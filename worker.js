/**
 * PodGen — Cloudflare Worker
 *
 * Paste this entire file into the Cloudflare Workers editor.
 * Set one environment variable: ANTHROPIC_API_KEY = sk-ant-...
 * Optional: DAILY_LIMIT (default 100), ALLOWED_ORIGIN (default *)
 */

const MODEL = "claude-sonnet-4-20250514";
const DEFAULT_DAILY_LIMIT = 100;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "*";
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";

    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204, allowedOrigin);
    }

    // Only accept POST to /generate
    const url = new URL(request.url);
    if (url.pathname !== "/generate" || request.method !== "POST") {
      return corsResponse(JSON.stringify({ error: "Not found" }), 404, allowedOrigin);
    }

    // ── Rate limiting via KV (optional but recommended) ──────────────────
    if (env.PODGEN_KV) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `count:${today}`;
      const count = parseInt((await env.PODGEN_KV.get(key)) || "0");
      const limit = parseInt(env.DAILY_LIMIT || DEFAULT_DAILY_LIMIT);
      if (count >= limit) {
        return corsResponse(
          JSON.stringify({ error: `Daily limit of ${limit} episodes reached. Try again tomorrow.` }),
          429, allowedOrigin
        );
      }
      // Increment (fire and forget)
      ctx.waitUntil(env.PODGEN_KV.put(key, String(count + 1), { expirationTtl: 172800 }));
    }

    // ── Parse request body ───────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: "Invalid JSON body" }), 400, allowedOrigin);
    }

    const { topic, format } = body;
    if (!topic || typeof topic !== "string" || topic.trim().length < 2) {
      return corsResponse(JSON.stringify({ error: "topic is required" }), 400, allowedOrigin);
    }

    if (!env.ANTHROPIC_API_KEY) {
      return corsResponse(JSON.stringify({ error: "API key not configured on server" }), 500, allowedOrigin);
    }

    // ── Build prompt ─────────────────────────────────────────────────────
    const fmt = (format || "news-dive").toString().slice(0, 30);
    const fmtDescriptions = {
      "news-dive": "a news deep-dive with two hosts named Alex Chen (host1) and Sarah Miles (host2). They discuss real recent facts, cite real experts and organisations by name, debate nuance, and close with a clearly-labelled illustrative fiction story segment",
      "interview": "a one-on-one interview where host Alex Chen (host1) interviews a named fictional but realistic expert (guest) with a full name, title, and real institution. They discuss real research and data. Include a short illustrative fiction segment",
      "debate": "a panel debate where host Alex Chen (host1) moderates two guests with opposing views: Sam Torres (host2) arguing one side and Dr. Priya Mehta (guest) arguing the other. Every claim grounded in real data. Include an illustrative fiction segment",
      "explainer": "an explainer-style podcast with host Alex Chen (host1) and co-host Sam Rivera (host2). Break the topic down step-by-step with real data and a short illustrative fiction segment before the verdict"
    };
    const fmtDesc = fmtDescriptions[fmt] || fmtDescriptions["news-dive"];

    const systemPrompt = `You are a professional podcast script writer and researcher. You MUST use the web_search tool at least 3 times to find current, real, verified facts before writing anything.

Rules:
- Every factual claim must be backed by a real source (real paper, real organisation, real publication with a real URL)
- Never invent statistics, quotes, or events
- Illustrative fiction / narrator segments must be clearly labelled and use role "narrator"
- Speakers must sound like real intelligent people having a natural conversation
- Include natural agreement, pushback, and follow-up questions between speakers

Respond ONLY with valid JSON. No markdown fences. No preamble. No trailing text.

JSON structure:
{
  "title": "Episode title — specific and punchy",
  "subtitle": "One sentence teaser",
  "topic": "the topic string",
  "format": "${fmt}",
  "emoji": "single most relevant emoji",
  "duration_minutes": number,
  "tags": ["tag1","tag2","tag3","tag4"],
  "sources": [
    {
      "id": "s1",
      "title": "Author / Org — Article or paper title",
      "publication": "Journal or outlet name",
      "year": "YYYY",
      "claim": "The specific claim this source supports (1-2 sentences)",
      "url": "https://real-url.com"
    }
  ],
  "segments": [
    {
      "id": "seg_id",
      "type": "intro|facts|story|interview|debate|wrap",
      "title": "Segment title",
      "duration_min": number,
      "lines": [
        {
          "speaker": "Full Name",
          "role": "host1|host2|guest|narrator",
          "text": "What they say — 2-5 natural sentences",
          "source_ids": ["s1"]
        }
      ]
    }
  ]
}

For narrator segments: role = "narrator", begin text with "Imagine..." or similar. Clearly illustrative fiction.
Total duration: 20-30 minutes. Segments: 4-7. Sources: 4-8 real ones. Keep language natural and intelligent.`;

    const userPrompt = `Search the web for current, real information about: "${topic.trim()}"

Search at least 3-4 different angles: recent news, scientific research, expert opinions, statistics/data.

Then produce the full podcast JSON for format: ${fmtDesc}`;

    // ── Call Anthropic ────────────────────────────────────────────────────
    let anthropicResp;
    try {
      anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 8000,
          system: systemPrompt,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: userPrompt }]
        })
      });
    } catch (err) {
      return corsResponse(JSON.stringify({ error: "Failed to reach Anthropic API: " + err.message }), 502, allowedOrigin);
    }

    if (!anthropicResp.ok) {
      const errBody = await anthropicResp.text();
      let msg = `Anthropic API error ${anthropicResp.status}`;
      try { msg = JSON.parse(errBody).error?.message || msg; } catch {}
      return corsResponse(JSON.stringify({ error: msg }), anthropicResp.status, allowedOrigin);
    }

    const data = await anthropicResp.json();
    const fullText = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return corsResponse(JSON.stringify({ error: "Could not parse podcast from AI response. Please try again." }), 500, allowedOrigin);
    }

    let podcast;
    try {
      podcast = JSON.parse(jsonMatch[0]);
    } catch (e) {
      return corsResponse(JSON.stringify({ error: "JSON parse error. Please try again." }), 500, allowedOrigin);
    }

    podcast.format = fmt;
    return corsResponse(JSON.stringify({ podcast }), 200, allowedOrigin);
  }
};

function corsResponse(body, status, origin) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  return new Response(body, { status, headers });
}
