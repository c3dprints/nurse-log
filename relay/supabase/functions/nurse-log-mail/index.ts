// Supabase Edge Function "nurse-log-mail" (MakerQ's Supabase project). Runs the rules in
// mail.mjs with the project's RESEND_API_KEY, and counts sends in MakerQ's relay_sends
// table (from_name "Nurse's Log"), so they also count toward MakerQ's hourly ceiling.
// Deploy: see relay/README.md.
// @ts-nocheck
import { handle } from "./mail.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REST = `${SUPABASE_URL}/rest/v1/relay_sends`;
const DB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
const NAME = "Nurse's Log";
const MAX_PER_HOUR = 60;            // all Nurse's Log mail
const MAX_FEEDBACK_PER_HOUR = 30;   // all feedback (it all goes to one inbox)
const MAX_RESETS_PER_ADDRESS = 5;   // reset codes to one address

async function sentLastHour(extra = "") {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const r = await fetch(`${REST}?from_name=eq.${encodeURIComponent(NAME)}&created_at=gte.${encodeURIComponent(since)}${extra}&select=id`, {
    headers: { ...DB, Prefer: "count=exact", Range: "0-0" },
  });
  if (!r.ok) throw new Error(`relay_sends ${r.status}`);
  return Number((r.headers.get("content-range") || "").split("/")[1]) || 0;
}

const env = {
  RESEND_KEY: Deno.env.get("RESEND_API_KEY") || "",
  FROM: Deno.env.get("NURSE_LOG_FROM") || "Nurse's Log <hi@c3dprints.com>",
  FEEDBACK_TO: Deno.env.get("NURSE_LOG_FEEDBACK_TO") || "hi@c3dprints.com",
  async allow(mail) {
    // Fails open like MakerQ's relay if the table cannot be read, and says so in the logs.
    try {
      if (await sentLastHour() >= MAX_PER_HOUR) return false;
      const cap = mail.kind === "feedback" ? MAX_FEEDBACK_PER_HOUR : MAX_RESETS_PER_ADDRESS;
      return await sentLastHour(`&to_addr=eq.${encodeURIComponent(mail.to)}`) < cap;
    } catch (e) {
      console.error(`[nurse-log-mail] rate check failed (fail-open): ${e instanceof Error ? e.message : e}`);
      return true;
    }
  },
  async record(mail) {
    try {
      await fetch(REST, {
        method: "POST",
        headers: { ...DB, Prefer: "return=minimal" },
        body: JSON.stringify({ to_addr: mail.to, from_name: NAME, created_at: new Date().toISOString() }),
      });
    } catch (e) {
      console.error(`[nurse-log-mail] could not record send: ${e instanceof Error ? e.message : e}`);
    }
  },
};

Deno.serve((req) => handle(req, env));
