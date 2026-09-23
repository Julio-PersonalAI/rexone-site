import { computeScores, recommendCategory, pricingBand } from "../_lib/scoring.js";
import { buildInternalAlertHtml, buildProspectEmailHtml } from "../_lib/email-html.js";

const FROM_ADDRESS = "RexOne Assessment <assessment@rexone.ai>";
// ALERT_EMAIL is a Cloudflare-managed secret, deliberately not in this public repo.
// If it's ever unset, the internal alert fails loudly (emailsSent drops to 1) rather than silently.

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { answers, contact } = body || {};
  if (!answers || !contact || !contact.email || !contact.name) {
    return json({ error: "Missing answers or contact info" }, 400);
  }

  const scores = computeScores(answers);
  const category = recommendCategory(answers);
  const band = pricingBand(scores.economicValue);
  const alertTo = env.ALERT_EMAIL;

  const results = await Promise.allSettled([
    sendEmail(env, {
      to: alertTo,
      subject: `New Assessment: ${contact.business_name || contact.name} (${scores.tier})`,
      html: buildInternalAlertHtml(answers, contact, scores, category, band),
    }),
    sendEmail(env, {
      to: contact.email,
      subject: "Your RexOne Preliminary Assessment",
      html: buildProspectEmailHtml(answers, contact, scores, category, band),
      replyTo: alertTo,
    }),
  ]);

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error("Email send failure(s):", failures.map((f) => String(f.reason)));
  }

  return json({
    ok: failures.length < results.length,
    tier: scores.tier,
    emailsSent: results.filter((r) => r.status === "fulfilled").length,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function sendEmail(env, { to, subject, html, replyTo }) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  if (!to) throw new Error("Recipient missing (is the ALERT_EMAIL secret set?)");
  const payload = { from: FROM_ADDRESS, to: [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error ${res.status}: ${text}`);
  }
  return res.json();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
