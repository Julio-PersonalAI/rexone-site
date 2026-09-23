/* Builds the HTML for both emails sent on a completed assessment.
   Server-safe port of report.js's rendering logic (no DOM/sessionStorage here). */

const HOURS_FLOOR = { "Under 5 hrs": 2, "5–15 hrs": 5, "15–30 hrs": 15, "30+ hrs": 30 };
const BLENDED_HOURLY_RATE = 40;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtMoney(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function resolveAnswer(a, key) {
  const val = a[key];
  const detail = a[key + "_detail"];
  if (!detail) return val;
  if (val === "Other") return detail;
  return `${val} (${detail})`;
}

const SYSTEM_CATEGORIES = [
  { key: "crm_tools", label: "CRM" },
  { key: "email_file_tools", label: "Email & File Sharing" },
  { key: "videoconf_tools", label: "Videoconferencing" },
  { key: "messaging_tools", label: "Messaging" },
  { key: "ai_tools", label: "AI Tools" },
];

function formatMultiAnswer(a, key) {
  const values = a[key];
  if (!Array.isArray(values) || values.length === 0) return null;
  const detail = a[key + "_detail"];
  const resolved = values.map((v) => (v === "Other" && detail ? detail : v)).filter((v) => v !== "Other");
  return resolved.length > 0 ? resolved.join(", ") : null;
}

function buildSummary(a) {
  const parts = [];
  const bizType = resolveAnswer(a, "biz_type");
  if (bizType) parts.push(`a ${String(bizType).toLowerCase()} business`);
  if (a.team_size) parts.push(`with ${a.team_size.toLowerCase()}`);
  if (a.volume) parts.push(`handling ${a.volume.toLowerCase()} new leads/orders per month`);
  const leadSource = resolveAnswer(a, "lead_source");
  if (leadSource) parts.push(`mostly from ${String(leadSource).toLowerCase()}`);
  return "You run " + parts.join(", ") + ".";
}

const BASE_STYLE = `font-family: -apple-system, 'Segoe UI', Inter, sans-serif; color: #1F2430; line-height: 1.6;`;

/* Email to Julio: everything, unfiltered, for internal triage. */
export function buildInternalAlertHtml(answers, contact, scores, category, band) {
  const hoursPerWeek = HOURS_FLOOR[answers.admin_hours] || 0;
  const annualAdminValue = hoursPerWeek * 52 * BLENDED_HOURLY_RATE;
  const rows = Object.entries(answers)
    .filter(([k]) => !k.endsWith("_detail"))
    .map(([k, v]) => `<tr><td style="padding:4px 10px 4px 0;color:#5B6472;font-size:12px;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;font-size:13px;">${esc(Array.isArray(v) ? v.join(", ") : v)}</td></tr>`)
    .join("");

  return `<div style="${BASE_STYLE}max-width:640px;margin:0 auto;">
    <h2 style="color:#14213D;">New Complementary Assessment: ${esc(contact.business_name)}</h2>
    <p><strong>Tier (internal only):</strong> ${esc(scores.tier)} &nbsp; <strong>Score:</strong> ${scores.totalScore}/12</p>
    <p><strong>Contact:</strong> ${esc(contact.name)} — ${esc(contact.email)}</p>
    <p><strong>Recommended category:</strong> ${esc(category.name)}${category.hasProof ? "" : " (no proof point yet)"}</p>
    <p><strong>Pricing band:</strong> Setup ${esc(band.setup)} · Monthly ${esc(band.monthly)}</p>
    <p><strong>Admin time cost estimate:</strong> ~${hoursPerWeek} hrs/week → ${fmtMoney(annualAdminValue)}/year</p>
    <h3 style="color:#14213D;margin-top:24px;">All answers</h3>
    <table style="border-collapse:collapse;">${rows}</table>
  </div>`;
}

/* Email to the prospect: their report, condensed for email body (no PDF attachment yet). */
export function buildProspectEmailHtml(answers, contact, scores, category, band) {
  const hoursPerWeek = HOURS_FLOOR[answers.admin_hours] || 0;
  const annualAdminValue = hoursPerWeek * 52 * BLENDED_HOURLY_RATE;

  const bottlenecks = [];
  if (answers.pain_area) bottlenecks.push(answers.pain_area);
  if (Array.isArray(answers.admin_tasks)) {
    bottlenecks.push(...answers.admin_tasks.map((t) => (t === "Other" && answers.admin_tasks_detail ? answers.admin_tasks_detail : t)).filter((t) => t !== "Other"));
  }
  const topBottlenecks = [...new Set(bottlenecks)].slice(0, 3);

  const envRows = SYSTEM_CATEGORIES.map(({ key, label }) => {
    const value = formatMultiAnswer(answers, key) || "None reported";
    return `<tr><td style="padding:4px 10px 4px 0;color:#5B6472;font-size:12.5px;">${esc(label)}</td><td style="padding:4px 0;font-size:13px;font-weight:600;">${esc(value)}</td></tr>`;
  }).join("");

  return `<div style="${BASE_STYLE}max-width:600px;margin:0 auto;">
    <h1 style="color:#14213D;font-size:22px;">Prepared for ${esc(contact.business_name || contact.name)}</h1>
    <p style="color:#5B6472;font-size:12.5px;font-style:italic;">This is a preliminary assessment based only on what you told us — not a binding proposal. We'll confirm everything on a short call.</p>

    <h2 style="color:#C77B3B;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;">Where you are today</h2>
    <p>${esc(buildSummary(answers))}</p>

    <h2 style="color:#C77B3B;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;">Environment</h2>
    <table style="border-collapse:collapse;width:100%;">${envRows}</table>

    <h2 style="color:#C77B3B;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;margin-top:20px;">Biggest opportunities</h2>
    <ul>${topBottlenecks.map((b) => `<li>${esc(b)}</li>`).join("") || "<li>To be confirmed on a call.</li>"}</ul>

    <h2 style="color:#C77B3B;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;">Estimated administrative time cost</h2>
    <p>Based on ~${hoursPerWeek} hrs/week of administrative work across your team, at a conservative blended rate of $${BLENDED_HOURLY_RATE}/hr:</p>
    <p style="font-size:26px;font-weight:800;color:#14213D;">${fmtMoney(annualAdminValue)} / year</p>

    <h2 style="color:#C77B3B;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;">Recommended first step: ${esc(category.name)}</h2>
    <p>${esc(category.pitch)}</p>

    <table style="border-collapse:collapse;background:#F8F7F4;border-radius:8px;width:100%;margin:16px 0;">
      <tr>
        <td style="padding:12px;"><span style="font-size:10.5px;color:#5B6472;text-transform:uppercase;">Complexity</span><br><strong>Low–moderate</strong></td>
        <td style="padding:12px;"><span style="font-size:10.5px;color:#5B6472;text-transform:uppercase;">Timeline</span><br><strong>4–6 weeks</strong></td>
      </tr>
      <tr>
        <td style="padding:12px;"><span style="font-size:10.5px;color:#5B6472;text-transform:uppercase;">Setup</span><br><strong>${esc(band.setup)}</strong></td>
        <td style="padding:12px;"><span style="font-size:10.5px;color:#5B6472;text-transform:uppercase;">Monthly</span><br><strong>${esc(band.monthly)}</strong></td>
      </tr>
    </table>

    <p style="margin-top:24px;"><strong>Next step:</strong> Reply to this email or book a 30-minute workflow review to validate these numbers and scope Phase 1.</p>
    <p style="color:#5B6472;font-size:12px;">RexOne.ai — automation, done inside your systems.</p>
  </div>`;
}
