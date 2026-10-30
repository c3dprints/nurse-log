'use strict';
// ChatGPT (OpenAI API) dictation helper. Audio is turned into text, then the
// text is read into the fields of the form the nurse has open. Nothing is
// saved here: the values go back to the form for the nurse to check and save.
// The API key stays on this PC; the browser never sees it.

const BASE = process.env.NL_OPENAI_URL || 'https://api.openai.com/v1';
const DEFAULTS = { model: 'gpt-4o-mini', transcribeModel: 'gpt-4o-mini-transcribe' };
const MAX_FIELDS = 40;

const fail = (code, msg) => Object.assign(new Error(msg), { code });

const configured = (s) => !!(s && s.enabled && s.key);

async function call(s, pathname, init) {
  let res;
  try {
    res = await fetch(BASE + pathname, { ...init, headers: { Authorization: `Bearer ${s.key}`, ...(init.headers || {}) }, signal: AbortSignal.timeout(60000) });
  } catch (e) {
    throw fail(502, `could not reach OpenAI: ${e.cause?.code || e.message}`);
  }
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok) {
    const msg = body?.error?.message || text.slice(0, 200) || res.statusText;
    throw fail(res.status === 401 ? 400 : 502, res.status === 401 ? 'OpenAI rejected the API key' : `OpenAI: ${msg}`);
  }
  return body;
}

// Checks the key and that both models are available to it.
async function test(s) {
  const r = await call(s, '/models', { method: 'GET' });
  const ids = new Set((r.data || []).map((m) => m.id));
  const missing = [s.model, s.transcribeModel].filter((m) => !ids.has(m));
  return { ok: !missing.length, missing };
}

async function transcribe(s, audio, mime = 'audio/webm') {
  const form = new FormData();
  form.append('model', s.transcribeModel);
  form.append('file', new Blob([audio], { type: mime }), mime.includes('mp4') ? 'dictation.mp4' : 'dictation.webm');
  const r = await call(s, '/audio/transcriptions', { method: 'POST', body: form });
  return String(r.text || '').trim();
}

// fields: [{ name, label, type: text|textarea|date|select|check|number|tel, choices }]
function schemaFor(fields) {
  const properties = {};
  for (const f of fields) {
    let p;
    if (f.type === 'check') p = { type: ['boolean', 'null'] };
    else if (f.type === 'select') p = { type: ['string', 'null'], enum: [...f.choices.filter(Boolean), null] };
    else p = { type: ['string', 'null'] };
    p.description = f.label + (f.type === 'date' ? ' (YYYY-MM-DD)' : '');
    properties[f.name] = p;
  }
  return { type: 'object', properties, required: fields.map((f) => f.name), additionalProperties: false };
}

function cleanFields(list) {
  if (!Array.isArray(list) || !list.length) throw fail(400, 'no fields to fill');
  return list.slice(0, MAX_FIELDS).map((f) => ({
    name: String(f.name || '').replace(/[^a-z0-9_]/gi, '').slice(0, 40),
    label: String(f.label || f.name || '').slice(0, 120),
    type: ['text', 'textarea', 'date', 'select', 'check', 'number', 'tel'].includes(f.type) ? f.type : 'text',
    choices: Array.isArray(f.choices) ? f.choices.map((c) => String(c).slice(0, 80)).slice(0, 30) : [],
  })).filter((f) => f.name);
}

// Returns only the fields the notes actually gave a value for.
async function fill(s, { notes, fields, current = {}, form = 'form', today }) {
  const list = cleanFields(fields);
  const known = Object.fromEntries(list.map((f) => [f.name, current[f.name] ?? null]).filter(([, v]) => v !== null && v !== ''));
  const r = await call(s, '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: s.model,
      messages: [
        { role: 'system', content: [
          `You fill in a school nurse's "${form}" form from dictated or typed notes. Today is ${today}.`,
          'Use only what the notes say. Set a field to null when the notes do not mention it; never guess or invent.',
          'Write dates as YYYY-MM-DD and phone numbers as 10 digits. For choice fields use one of the listed choices exactly.',
          'Fix obvious dictation slips in the spelling of medicine names, but keep doses, times and numbers exactly as said.',
          'Fields already filled in are given for context; only change one if the notes clearly correct it.',
        ].join(' ') },
        { role: 'user', content: `Already filled in: ${JSON.stringify(known)}\n\nNotes:\n${notes}` },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'form_values', strict: true, schema: schemaFor(list) } },
    }),
  });
  const msg = r.choices?.[0]?.message;
  if (msg?.refusal) throw fail(502, `ChatGPT declined: ${msg.refusal}`);
  let out;
  try { out = JSON.parse(msg?.content || '{}'); } catch { throw fail(502, 'ChatGPT sent back something that was not form values'); }
  const values = {};
  for (const f of list) {
    const v = out[f.name];
    if (v === null || v === undefined || v === '') continue;
    if (f.type === 'select' && !f.choices.includes(v)) continue;
    if (f.type === 'date' && !/^\d{4}-\d\d-\d\d$/.test(v)) continue;
    values[f.name] = f.type === 'check' ? !!v : String(v).slice(0, 4000);
  }
  return values;
}

module.exports = { DEFAULTS, configured, test, transcribe, fill, schemaFor };
