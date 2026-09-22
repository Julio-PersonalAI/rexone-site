/* Renders the printable Preliminary Assessment from the result saved by assessment.js.
   No AI involved here — every number was already computed by the deterministic engine. */

const HOURS_FLOOR = { "Under 5 hrs": 2, "5–15 hrs": 5, "15–30 hrs": 15, "30+ hrs": 30 };
const BLENDED_HOURLY_RATE = 40; // stated assumption, shown in the report

function fmt$(n) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

function resolveAnswer(a, key) {
  const val = a[key];
  const detail = a[key + "_detail"];
  if (!detail) return val;
  if (val === "Other") return detail; // "Other" alone is meaningless — just show what they typed
  return `${val} (${detail})`; // e.g. "Franchise (That 1 Painter)"
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

function buildEnvironmentRows(a) {
  return SYSTEM_CATEGORIES.map(({ key, label }) => ({
    label,
    value: formatMultiAnswer(a, key) || "None reported",
  }));
}

function buildSummary(a) {
  const parts = [];
  const bizType = resolveAnswer(a, "biz_type");
  if (bizType) parts.push(`a ${bizType.toLowerCase()} business`);
  if (a.team_size) parts.push(`with ${a.team_size.toLowerCase()}`);
  if (a.volume) parts.push(`handling ${a.volume.toLowerCase()} new leads/orders per month`);
  const leadSource = resolveAnswer(a, "lead_source");
  if (leadSource) parts.push(`mostly from ${leadSource.toLowerCase()}`);
  return "You run " + parts.join(", ") + ".";
}

function render() {
  const raw = sessionStorage.getItem("rexone_assessment_result");
  const page = document.getElementById("r-page");

  if (!raw) {
    page.innerHTML = `<p class="r-loading">No assessment found in this browser session. <a href="assessment.html">Take the assessment</a> first.</p>`;
    return;
  }

  const { answers: a, contact, scores, category, band, generatedAt } = JSON.parse(raw);

  const hoursPerWeek = HOURS_FLOOR[a.admin_hours] || 0;
  const annualAdminHours = hoursPerWeek * 52;
  const annualAdminValue = annualAdminHours * BLENDED_HOURLY_RATE;

  const bottlenecks = [];
  if (a.pain_area) bottlenecks.push(a.pain_area);
  if (Array.isArray(a.admin_tasks)) {
    bottlenecks.push(...a.admin_tasks.map((t) => (t === "Other" && a.admin_tasks_detail ? a.admin_tasks_detail : t)).filter((t) => t !== "Other"));
  }
  const topBottlenecks = [...new Set(bottlenecks)].slice(0, 3);
  const environmentRows = buildEnvironmentRows(a);

  const dateStr = new Date(generatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  page.innerHTML = `
    <header class="r-head">
      <img src="rexone-convergence.svg" alt="RexOne" class="r-logo" />
      <div class="r-head-meta">
        <span>Preliminary Assessment</span>
        <span>${dateStr}</span>
      </div>
    </header>

    <h1 class="r-title">Prepared for ${escapeHtml(contact.business_name || contact.name || "your business")}</h1>
    <p class="r-not-binding">This is a preliminary assessment based only on what you told us — not a binding proposal. Figures are estimates; we'll confirm everything on a short call.</p>

    <section class="r-section">
      <h2>Where you are today</h2>
      <p>${buildSummary(a)}</p>
    </section>

    <section class="r-section">
      <h2>Environment</h2>
      <p class="r-env-intro">Our understanding of the systems and tools already in place — what we'd build inside, not replace.</p>
      <div class="r-env-grid">
        ${environmentRows.map((row) => `<div><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`).join("")}
      </div>
      ${a.mandated_systems ? `<p class="r-assumption">Corporate/franchise-mandated systems: ${escapeHtml(a.mandated_systems)}.</p>` : ""}
    </section>

    <section class="r-section">
      <h2>Biggest opportunities</h2>
      <ul class="r-list">
        ${topBottlenecks.map((b) => `<li>${escapeHtml(b)}</li>`).join("") || "<li>To be confirmed on a call.</li>"}
      </ul>
    </section>

    <section class="r-section">
      <h2>Estimated administrative time cost</h2>
      <p>Based on ~${hoursPerWeek} hrs/week of administrative work across your team, at a conservative blended rate of $${BLENDED_HOURLY_RATE}/hr:</p>
      <p class="r-big-number">${fmt$(annualAdminValue)} / year</p>
      <p class="r-assumption">Assumption: ${hoursPerWeek} hrs/week &times; 52 weeks &times; $${BLENDED_HOURLY_RATE}/hr. Conservative estimate — uses the low end of your selected range.</p>
    </section>

    <section class="r-section">
      <h2>Recommended first step: ${escapeHtml(category.name)}</h2>
      <p>${escapeHtml(category.pitch)}</p>
    </section>

    <section class="r-section r-grid">
      <div><span>Complexity</span><strong>Low–moderate</strong></div>
      <div><span>Timeline</span><strong>4–6 weeks</strong></div>
      <div><span>Setup investment</span><strong>${band.setup}</strong></div>
      <div><span>Monthly</span><strong>${band.monthly}</strong></div>
    </section>

    <section class="r-section">
      <h2>Still to confirm</h2>
      <ul class="r-list">
        <li>Access to your current CRM/scheduling/phone systems</li>
        <li>Any corporate or franchise technology restrictions</li>
        <li>Specific integration requirements</li>
      </ul>
    </section>

    <footer class="r-footer">
      <p><strong>Next step:</strong> Book a 30-minute workflow review to validate these numbers and scope Phase 1.</p>
      <p class="r-contact-line">RexOne.ai — automation, done inside your systems.</p>
    </footer>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

document.getElementById("r-print")?.addEventListener("click", () => window.print());
render();
