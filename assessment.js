/* RexOne Complementary Assessment — interview data + deterministic scoring engine.
   Rule: this file computes every number. AI (if ever added) only narrates them — never invents them. */

const SALES_TRIGGER_ANSWERS = ["Marketing spend efficiency", "Unfollowed leads / estimates"];

const QUESTIONS = [
  { id: "biz_type", section: "Business", text: "What does your business primarily do?", type: "single",
    options: ["Home services", "Franchise", "Professional services", "Retail", "Other"],
    elaborate: { "Franchise": "What's the name of the franchise?", "Other": "Please elaborate..." } },
  { id: "team_size", section: "Business", text: "How many people work in the business?", type: "single",
    options: ["Just me (solopreneur)", "2–10 people", "11–50 people", "51+ people"] },
  { id: "revenue", section: "Business", text: "Roughly what's your annual revenue range?", type: "single",
    options: ["Under $500K", "$500K–$2M", "$2M–$5M", "$5M+"] },

  { id: "pain_area", section: "Where it hurts", text: "Where do things most often slip through the cracks?", type: "single",
    options: ["Unfollowed leads / estimates", "Cash collection / invoicing", "Staff / rep performance visibility", "Scheduling / dispatch", "Reporting / visibility into the numbers", "Marketing spend efficiency"] },
  { id: "value_if_fixed", section: "Where it hurts", text: "If that got fixed, what would it be worth per year?", type: "single",
    options: ["Under $10K", "$10K–$50K", "$50K–$150K", "$150K+", "Not sure"] },

  { id: "lead_source", section: "Sales & marketing", text: "What's the main way new business comes in?", type: "single",
    options: ["Paid ads", "Referrals", "Repeat customers", "Inbound calls", "Other"],
    elaborate: { "Other": "Please elaborate..." },
    conditional: (a) => SALES_TRIGGER_ANSWERS.includes(a.pain_area) },
  { id: "volume", section: "Sales & marketing", text: "Roughly how many new leads/inquiries/orders do you handle monthly?", type: "single",
    options: ["Under 25", "25–100", "100–300", "300+"],
    conditional: (a) => SALES_TRIGGER_ANSWERS.includes(a.pain_area) },

  { id: "admin_tasks", section: "Administrative load", text: "Which tedious or administrative tasks eat up the most staff hours?", type: "multi",
    options: ["Matching invoices to work orders (AP)", "Payroll processing", "Email / inbox triage", "Data entry between systems", "Compiling reports manually", "Scheduling / dispatch coordination", "Other"],
    elaborate: { "Other": "Please elaborate..." } },
  { id: "admin_hours", section: "Administrative load", text: "Roughly how many hours per week go into those tasks combined, across your team?", type: "single",
    options: ["Under 5 hrs", "5–15 hrs", "15–30 hrs", "30+ hrs"] },

  { id: "crm_tools", section: "Your systems & tools", text: "Which CRM do you use?", type: "multi", optional: true,
    options: ["Salesforce", "Other"], elaborate: { "Other": "Which CRM(s)?" } },
  { id: "email_file_tools", section: "Your systems & tools", text: "Email & file sharing?", type: "multi", optional: true,
    options: ["Microsoft Office Suite", "Google Workspace", "Other"], elaborate: { "Other": "Please specify..." } },
  { id: "videoconf_tools", section: "Your systems & tools", text: "Videoconferencing?", type: "multi", optional: true,
    options: ["Zoom", "Teams", "Google Meet", "Other"], elaborate: { "Other": "Please specify..." } },
  { id: "messaging_tools", section: "Your systems & tools", text: "Messaging?", type: "multi", optional: true,
    options: ["SMS Text", "Slack", "WhatsApp", "Teams", "Other"], elaborate: { "Other": "Please specify..." } },
  { id: "ai_tools", section: "Your systems & tools", text: "AI tools?", type: "multi", optional: true,
    options: ["ChatGPT", "Claude", "Copilot", "Other"], elaborate: { "Other": "Please specify..." } },

  { id: "mandated_systems", section: "Constraints", text: "Any systems or vendors you're required to use (corporate/franchise-mandated)?", type: "single",
    options: ["Yes", "No", "Not sure"] },
  { id: "approval", section: "Constraints", text: "Who'd need to approve a new tool or automation?", type: "single",
    options: ["Just me", "Me + a partner/manager", "Corporate approval needed", "Not sure"] },
];

const CONTACT_FIELDS = [
  { id: "name", label: "Your name", type: "text", required: true },
  { id: "business_name", label: "Business name", type: "text", required: true },
  { id: "email", label: "Email", type: "email", required: true },
];

function activeQuestions() {
  return QUESTIONS.filter((q) => (q.conditional ? q.conditional(answers) : true));
}

/* ---------- Deterministic scoring engine (no AI involved) ---------- */

function bandScore(value, table) {
  return table.hasOwnProperty(value) ? table[value] : 0;
}

function computeScores(answers) {
  const revenueScore = bandScore(answers.revenue, {
    "Under $500K": 0, "$500K–$2M": 1, "$2M–$5M": 2, "$5M+": 3,
  });
  const volumeScore = bandScore(answers.volume, {
    "Under 25": 0, "25–100": 1, "100–300": 2, "300+": 3,
  });
  const adminHoursScore = bandScore(answers.admin_hours, {
    "Under 5 hrs": 0, "5–15 hrs": 1, "15–30 hrs": 2, "30+ hrs": 3,
  });
  const economicValue = Math.max(revenueScore, volumeScore, adminHoursScore); // 0-3, deal-size proxy

  // Pain magnitude now derives from stated dollar value if fixed (confidence question removed).
  const painMagnitude = bandScore(answers.value_if_fixed, {
    "Under $10K": 0, "$10K–$50K": 1, "$50K–$150K": 2, "$150K+": 3, "Not sure": 1,
  }); // 0-3

  let workflowRepeatability = 0;
  if (["Paid ads", "Inbound calls"].includes(answers.lead_source)) workflowRepeatability += 1;
  if (Array.isArray(answers.admin_tasks) && answers.admin_tasks.length > 0) workflowRepeatability += 1;
  workflowRepeatability = Math.min(workflowRepeatability, 2); // 0-2

  const SYSTEM_FIELDS = ["crm_tools", "email_file_tools", "videoconf_tools", "messaging_tools", "ai_tools"];
  const hasAnySystemTool = SYSTEM_FIELDS.some((id) => Array.isArray(answers[id]) && answers[id].length > 0);

  let integrationFeasibility = 0;
  if (answers.mandated_systems === "No") integrationFeasibility += 1;
  if (hasAnySystemTool) integrationFeasibility += 1; // existing digital tooling = more to integrate with
  integrationFeasibility = Math.min(integrationFeasibility, 2); // 0-2

  // Urgency question removed — authority/approval alone now drives this factor.
  const authorityUrgency = bandScore(answers.approval, {
    "Just me": 2, "Me + a partner/manager": 1, "Corporate approval needed": 0, "Not sure": 0,
  }); // 0-2

  const totalScore = painMagnitude + economicValue + workflowRepeatability + integrationFeasibility + authorityUrgency; // max 12

  let tier = "C";
  const hasAuthority = ["Just me", "Me + a partner/manager"].includes(answers.approval);
  if (totalScore >= 8 && hasAuthority) {
    tier = "A";
  } else if (totalScore >= 5) {
    tier = "B";
  }

  return { revenueScore, volumeScore, adminHoursScore, economicValue, painMagnitude, workflowRepeatability, integrationFeasibility, authorityUrgency, totalScore, tier };
}

/* Recommended category = named pain area / top admin task, mapped to a real RexOne proof point where one exists. */
const CATEGORY_MAP = {
  "Cash collection / invoicing": {
    name: "Faster Cash Collection",
    pitch: "Automated follow-ups and approvals to shorten the cash cycle and reduce manual work.",
    hasProof: true,
  },
  "Payroll processing": {
    name: "Payroll & Cash Prep",
    pitch: "Calendar- and order-driven payroll prep, so cash is ready before it's needed.",
    hasProof: true,
  },
  "Marketing spend efficiency": {
    name: "Ad Spend Reallocation",
    pitch: "Used real customer data to optimize spend by location, driving higher ROI in every market.",
    hasProof: true,
  },
  "Staff / rep performance visibility": {
    name: "Performance Visibility & QA",
    pitch: "Full-coverage QA and performance diagnostics — not just a 1% sample.",
    hasProof: true,
  },
  "Reporting / visibility into the numbers": {
    name: "Rolling Forecasting & Reporting",
    pitch: "A rolling forecast flags shortfalls and trends weeks ahead, not after the fact.",
    hasProof: true,
  },
  "Unfollowed leads / estimates": {
    name: "Lead & Estimate Recovery",
    pitch: "Structured, automatic follow-up on every lead or estimate that doesn't close right away.",
    hasProof: false,
  },
  "Matching invoices to work orders (AP)": {
    name: "AP Matching Automation",
    pitch: "Automated matching of invoices to work orders, cutting manual reconciliation time.",
    hasProof: false,
  },
  "Email / inbox triage": {
    name: "Inbox Triage",
    pitch: "Automatic sorting, routing, and drafting for high-volume inboxes.",
    hasProof: false,
  },
  "Data entry between systems": {
    name: "System-to-System Integration",
    pitch: "Removing manual re-entry between the tools you already use.",
    hasProof: false,
  },
  "Scheduling / dispatch coordination": {
    name: "Scheduling & Dispatch Automation",
    pitch: "Coordinated scheduling/dispatch without a person manually juggling it.",
    hasProof: false,
  },
};

function recommendCategory(answers) {
  if (CATEGORY_MAP[answers.pain_area]) return CATEGORY_MAP[answers.pain_area];
  if (Array.isArray(answers.admin_tasks)) {
    for (const t of answers.admin_tasks) {
      if (CATEGORY_MAP[t]) return CATEGORY_MAP[t];
    }
  }
  return CATEGORY_MAP["Unfollowed leads / estimates"];
}

/* Investment band — deterministic lookup keyed to Economic value score. Never AI-generated. */
const PRICING_BANDS = [
  { max: 1, setup: "$1,500–$3,500", monthly: "$2,500–$3,000" },
  { max: 2, setup: "$3,500–$6,000", monthly: "$3,000–$3,750" },
  { max: 3, setup: "$6,000–$8,500", monthly: "$3,750–$4,500" },
];

function pricingBand(economicValue) {
  for (const band of PRICING_BANDS) {
    if (economicValue <= band.max) return band;
  }
  return PRICING_BANDS[PRICING_BANDS.length - 1];
}

/* ---------- Wizard UI ---------- */

let stepIndex = 0;
const answers = {};
let contact = {};

const app = document.getElementById("assessment-app");

/* Returns the elaboration prompt text if the current answer(s) include a value that
   requires elaboration (e.g. "Other" -> "Please elaborate...", "Franchise" -> franchise name), else null. */
function elaborationPrompt(q) {
  if (!q.elaborate) return null;
  const selected = q.type === "multi" ? (answers[q.id] || []) : [answers[q.id]];
  for (const val of selected) {
    if (q.elaborate[val]) return q.elaborate[val];
  }
  return null;
}

function getSteps() {
  return [{ kind: "intro" }, ...activeQuestions().map((q) => ({ kind: "question", q })), { kind: "contact" }, { kind: "results" }];
}

const INTRO_SECTIONS = [
  { name: "Business", desc: "A quick snapshot — what you do, team size, revenue range." },
  { name: "Where it hurts", desc: "Where would you most like to see improvement." },
  { name: "Sales & marketing", desc: "Only asked if that's where it hurts — skipped otherwise." },
  { name: "Administrative load", desc: "Tedious, repetitive tasks eating staff hours." },
  { name: "Your systems & tools", desc: "What you already run on — CRM, email, messaging, AI." },
  { name: "Constraints", desc: "Who approves changes, and any mandated systems." },
];

function renderIntro() {
  return `
    <p class="a-section-label">Before we start</p>
    <h2 class="a-question">A few minutes, divided into 5 or 6 short sections.</h2>
    <p class="a-result-copy">This is a business diagnostic, not a sales form. Every answer feeds a deterministic scoring model — nothing here is guessed or AI-generated; the numbers in your report come straight from what you tell us.</p>
    <ul class="a-intro-sections">
      ${INTRO_SECTIONS.map((s) => `<li><strong>${escapeHtml(s.name)}:</strong> <span>${escapeHtml(s.desc)}</span></li>`).join("")}
    </ul>
    <p class="a-result-copy">Most questions are single-click or checkbox — pick what applies, no typing required. A few offer an optional "tell us more" box for detail we wouldn't otherwise capture.</p>
    <p class="a-fineprint">Takes about 5–9 minutes. Nothing here is a binding proposal — we'll confirm everything on a short call before anything is scoped.</p>
    <div class="a-nav"><span></span><button type="button" class="btn btn-copper" id="a-next">Start the assessment →</button></div>
  `;
}

function render() {
  const steps = getSteps();
  stepIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[stepIndex];

  let html = "";
  if (step.kind !== "intro" && step.kind !== "results") {
    const questions = activeQuestions();
    const introOffset = 1;
    const totalToComplete = questions.length + 1; // +1 for the contact step
    const completedSoFar = stepIndex - introOffset;
    const progressPct = Math.round((completedSoFar / totalToComplete) * 100);
    const label = step.kind === "question" ? `Question ${completedSoFar + 1} of ${questions.length}` : "Almost done";
    html += `<div class="a-progress-label">${label}</div>`;
    html += `<div class="a-progress"><div class="a-progress-bar" style="width:${progressPct}%"></div></div>`;
    if (step.kind === "question") {
      const sectionList = [...new Set(questions.map((qq) => qq.section))];
      html += `<div class="a-section-nav">${sectionList
        .map((s) => `<span class="a-section-pill${s === step.q.section ? " active" : ""}">${escapeHtml(s)}</span>`)
        .join(`<span class="a-section-arrow">→</span>`)}</div>`;
    }
  }

  if (step.kind === "intro") {
    html += renderIntro();
  } else if (step.kind === "question") {
    const q = step.q;
    html += `<p class="a-section-label">${q.section}</p>`;
    html += `<h2 class="a-question">${q.text}</h2>`;
    html += `<div class="a-options" data-type="${q.type}">`;
    for (const opt of q.options) {
      const selected = q.type === "multi"
        ? (answers[q.id] || []).includes(opt)
        : answers[q.id] === opt;
      html += `<button type="button" class="a-option${selected ? " selected" : ""}" data-value="${escapeAttr(opt)}">${opt}</button>`;
    }
    html += `</div>`;
    const prompt = elaborationPrompt(q);
    if (prompt) {
      html += `<div class="a-other"><label>Tell us a bit more<textarea id="a-other-detail" rows="2" placeholder="${escapeAttr(prompt)}">${escapeHtml(answers[q.id + "_detail"] || "")}</textarea></label></div>`;
    }
    html += navButtons(canAdvance(q), steps);
  } else if (step.kind === "contact") {
    html += `<p class="a-section-label">Almost done</p>`;
    html += `<h2 class="a-question">Where should we send your assessment?</h2>`;
    html += `<div class="a-fields">`;
    for (const f of CONTACT_FIELDS) {
      html += `<label class="a-field"><span>${f.label}</span><input type="${f.type}" id="field-${f.id}" value="${escapeAttr(contact[f.id] || "")}" /></label>`;
    }
    html += `</div>`;
    html += navButtons(contactValid(), steps);
  } else if (step.kind === "results") {
    html += renderResults();
  }

  app.innerHTML = html;
  attachHandlers(step, steps);
}

function navButtons(nextEnabled, steps) {
  const backDisabled = stepIndex === 0 ? "disabled" : "";
  const isLast = stepIndex === steps.length - 1;
  if (isLast) return `<div class="a-nav"><button type="button" class="btn btn-ghost" id="a-back" ${backDisabled}>← Back</button></div>`;
  return `<div class="a-nav">
    <button type="button" class="btn btn-ghost" id="a-back" ${backDisabled}>← Back</button>
    <button type="button" class="btn btn-copper" id="a-next" ${nextEnabled ? "" : "disabled"}>Continue →</button>
  </div>`;
}

function canAdvance(q) {
  if (q.optional) return !elaborationPrompt(q) || (answers[q.id + "_detail"] || "").trim().length > 1;
  const answered = q.type === "multi" ? (Array.isArray(answers[q.id]) && answers[q.id].length > 0) : !!answers[q.id];
  if (!answered) return false;
  if (elaborationPrompt(q)) {
    return (answers[q.id + "_detail"] || "").trim().length > 1;
  }
  return true;
}

function contactValid() {
  return CONTACT_FIELDS.every((f) => (contact[f.id] || "").trim().length > 1);
}

function escapeAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function attachHandlers(step, steps) {
  if (step.kind === "question") {
    const q = step.q;
    app.querySelectorAll(".a-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = btn.getAttribute("data-value");
        if (q.type === "multi") {
          const cur = answers[q.id] || [];
          answers[q.id] = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
        } else {
          answers[q.id] = val;
        }
        render();
      });
    });
    const otherField = document.getElementById("a-other-detail");
    if (otherField) {
      otherField.addEventListener("input", () => {
        answers[q.id + "_detail"] = otherField.value;
        const nextBtn = document.getElementById("a-next");
        if (nextBtn) nextBtn.disabled = !canAdvance(q);
      });
    }
  }
  if (step.kind === "contact") {
    CONTACT_FIELDS.forEach((f) => {
      const el = document.getElementById(`field-${f.id}`);
      el.addEventListener("input", () => {
        contact[f.id] = el.value;
        const nextBtn = document.getElementById("a-next");
        if (nextBtn) nextBtn.disabled = !contactValid();
      });
    });
  }
  const back = document.getElementById("a-back");
  if (back) back.addEventListener("click", () => { if (stepIndex > 0) { stepIndex--; render(); } });
  const next = document.getElementById("a-next");
  if (next) next.addEventListener("click", () => { if (stepIndex < steps.length - 1) { stepIndex++; render(); } });
}

let submitted = false;

function submitAssessment(answers, contact) {
  if (submitted) return;
  submitted = true;
  fetch("/api/submit-assessment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, contact }),
  })
    .then((res) => res.json().then((data) => ({ httpOk: res.ok, data })))
    .then(({ httpOk, data }) => {
      const statusEl = document.getElementById("a-email-status");
      if (!statusEl) return;
      const success = httpOk && data && data.ok && data.emailsSent === 2;
      statusEl.textContent = success ? "A copy has been emailed to you." : "Couldn't send the email copy — your report is still available below.";
    })
    .catch((err) => {
      console.error("Assessment submit failed:", err);
      const statusEl = document.getElementById("a-email-status");
      if (statusEl) statusEl.textContent = "Couldn't send the email copy — your report is still available below.";
    });
}

function renderResults() {
  const scores = computeScores(answers);
  const category = recommendCategory(answers);
  const band = pricingBand(scores.economicValue);

  // Persist for the printable report template (report.html reads this).
  const payload = { answers, contact, scores, category, band, generatedAt: new Date().toISOString() };
  localStorage.setItem("rexone_assessment_result", JSON.stringify(payload)); // localStorage, not sessionStorage: "View your report" opens a new tab, which doesn't share sessionStorage
  submitAssessment(answers, contact);

  const gapNote = category.hasProof ? "" : `<p class="a-gap-note">This is a newer automation area for us — happy to walk through exactly how it'd work on the call.</p>`;

  return `
    <p class="a-section-label">Your preliminary assessment</p>
    <h2 class="a-question">Recommended first step: ${category.name}</h2>
    <p class="a-result-copy">${category.pitch}</p>
    ${gapNote}
    <p id="a-email-status" class="a-fineprint">Sending your report by email…</p>
    <div class="a-result-grid">
      <div class="a-result-card"><span>Complexity</span><strong>Low–moderate</strong></div>
      <div class="a-result-card"><span>Timeline</span><strong>4–6 weeks</strong></div>
      <div class="a-result-card"><span>Setup</span><strong>${band.setup}</strong></div>
      <div class="a-result-card"><span>Monthly</span><strong>${band.monthly}</strong></div>
    </div>
    <p class="a-fineprint">This is a preliminary estimate based only on what you told us — not a binding proposal. We'll confirm the details on a short call.</p>
    <div class="a-nav a-nav-results">
      <a class="btn btn-ghost" id="a-back" href="#">← Back</a>
      <a class="btn btn-copper" href="report.html" target="_blank" rel="noopener">View your report →</a>
    </div>
  `;
}

render();
