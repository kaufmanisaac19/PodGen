/**
 * PodGen — Cloudflare Worker v3
 * Generates podcast script via Anthropic, then converts each line to
 * real audio via OpenAI TTS with distinct voices per speaker role.
 *
 * Environment variables required:
 *   ANTHROPIC_API_KEY  — from console.anthropic.com
 *   OPENAI_API_KEY     — from platform.openai.com
 *
 * Optional:
 *   DAILY_LIMIT        — max episodes per day (default 50)
 *   ALLOWED_ORIGIN     — restrict to your domain (default *)
 */

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";
const OPENAI_TTS_MODEL = "tts-1";

// Distinct OpenAI voices per speaker role
// Available: alloy, echo, fable, onyx, nova, shimmer
const VOICE_MAP = {
  host1:    "onyx",     // deep male — main host
  host2:    "nova",     // warm female — co-host / Sarah
  guest:    "fable",    // expressive — guests
  narrator: "shimmer",  // soft, storytelling
};

export default {
  async fetch(request, env, ctx) {
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const headers = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);

    // ── /generate — full podcast (script + audio) ───────────────────────
    if (url.pathname === "/generate" && request.method === "POST") {
      return handleGenerate(request, env, headers);
    }

    // ── /tts — single line audio (for retries) ──────────────────────────
    if (url.pathname === "/tts" && request.method === "POST") {
      return handleTTS(request, env, headers);
    }

    return json({ error: "Not found" }, 404, headers);
  }
};

// ── /generate ─────────────────────────────────────────────────────────────
async function handleGenerate(request, env, headers) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "API key not configured on server" }, 500, headers);
  if (!env.OPENAI_API_KEY) return json({ error: "OpenAI API key not configured on server" }, 500, headers);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400, headers); }

  const { topic, format } = body;
  if (!topic || topic.trim().length < 2) return json({ error: "topic is required" }, 400, headers);

  const fmt = (format || "news-dive").toString().slice(0, 30);

  // ── Step 1: Generate script with Anthropic ──────────────────────────
  let podcast;
  try {
    podcast = await generateScript(topic.trim(), fmt, env.ANTHROPIC_API_KEY);
  } catch (err) {
    return json({ error: "Script generation failed: " + err.message }, 500, headers);
  }

  // ── Step 2: Generate audio for each line with OpenAI TTS ───────────
  try {
    podcast = await addAudio(podcast, env.OPENAI_API_KEY);
  } catch (err) {
    // Return script without audio rather than failing completely
    podcast.audioError = "Audio generation failed: " + err.message;
  }

  return json({ podcast }, 200, headers);
}

// ── /tts — generate audio for a single line ───────────────────────────────
async function handleTTS(request, env, headers) {
  if (!env.OPENAI_API_KEY) return json({ error: "OpenAI API key not configured" }, 500, headers);
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Invalid JSON" }, 400, headers); }

  const { text, role } = body;
  if (!text) return json({ error: "text required" }, 400, headers);

  const voice = VOICE_MAP[role] || "alloy";
  try {
    const audio = await fetchTTS(text, voice, env.OPENAI_API_KEY);
    const b64 = bufferToBase64(audio);
    return json({ audio: b64, voice }, 200, headers);
  } catch (err) {
    return json({ error: err.message }, 500, headers);
  }
}

// ── Script generation ─────────────────────────────────────────────────────
async function generateScript(topic, fmt, apiKey) {
  const fmtDescriptions = {
    "news-dive": "a news deep-dive with two hosts: Alex Chen (host1) and Sarah Miles (host2). Real facts, named experts, ends with a clearly-labelled illustrative fiction story segment",
    "interview": "a one-on-one interview: host Alex Chen (host1) interviews a named realistic expert (guest) with full name, title, and institution. Real research discussed",
    "debate": "a panel debate: host Alex Chen (host1) moderates Sam Torres (host2) vs Dr. Priya Mehta (guest) on opposing sides. Every claim grounded in real data",
    "explainer": "an explainer: host Alex Chen (host1) and co-host Sam Rivera (host2) break the topic down step-by-step with real data and a story segment"
  };

  const systemPrompt = `You are a professional podcast script writer. Use web_search at least 3 times to find real, verified, current facts. Never invent statistics or quotes. Narrator/story segments must be clearly labelled fiction. Write natural, intelligent conversation — not AI-sounding.

Respond ONLY with valid JSON. No markdown. No preamble. No trailing text.

{
  "title": "Specific punchy episode title",
  "subtitle": "One sentence teaser",
  "topic": "topic string",
  "format": "${fmt}",
  "emoji": "single emoji",
  "duration_minutes": number,
  "tags": ["tag1","tag2","tag3","tag4"],
  "sources": [
    {"id":"s1","title":"Author — Article title","publication":"Journal/outlet","year":"YYYY","claim":"Specific claim this supports","url":"https://real-url.com"}
  ],
  "segments": [
    {
      "id":"seg1",
      "type":"intro|facts|story|interview|debate|wrap",
      "title":"Segment title",
      "duration_min": number,
      "lines": [
        {"speaker":"Full Name","role":"host1|host2|guest|narrator","text":"2-4 natural sentences","source_ids":["s1"]}
      ]
    }
  ]
}

Keep each line 2-4 sentences. Natural speech — contractions, interruptions, follow-ups. 4-6 segments, 20-28 minutes total, 4-8 real sources.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      system: systemPrompt,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: `Search the web for current real information about: "${topic}"\n\nSearch at least 3-4 different angles: recent news, research, expert opinions, statistics.\n\nThen write a full podcast JSON for format: ${fmtDescriptions[fmt] || fmtDescriptions["news-dive"]}` }]
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Anthropic error ${resp.status}`);
  }

  const data = await resp.json();
  const fullText = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const match = fullText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Could not parse script JSON");

  const podcast = JSON.parse(match[0]);
  podcast.format = fmt;
  return podcast;
}

// ── Audio generation ──────────────────────────────────────────────────────
async function addAudio(podcast, openAiKey) {
  const segments = podcast.segments || [];

  // Process all lines across all segments, generating audio in parallel
  // but in batches of 5 to avoid overwhelming the API
  const allLineTasks = [];
  for (const seg of segments) {
    for (const line of (seg.lines || [])) {
      allLineTasks.push({ seg, line });
    }
  }

  const BATCH = 5;
  for (let i = 0; i < allLineTasks.length; i += BATCH) {
    const batch = allLineTasks.slice(i, i + BATCH);
    await Promise.all(batch.map(async ({ line }) => {
      const voice = VOICE_MAP[line.role] || "alloy";
      try {
        const audioBuffer = await fetchTTS(line.text, voice, openAiKey);
        line.audio = bufferToBase64(audioBuffer);
        line.voice = voice;
      } catch (err) {
        line.audioError = err.message;
      }
    }));
  }

  return podcast;
}

// ── OpenAI TTS call ───────────────────────────────────────────────────────
async function fetchTTS(text, voice, apiKey) {
  const resp = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      input: text,
      voice: voice,
      response_format: "mp3",
      speed: 1.0
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `OpenAI TTS error ${resp.status}`);
  }

  const buffer = await resp.arrayBuffer();
  return buffer;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
