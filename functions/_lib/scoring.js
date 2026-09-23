/* Server-side mirror of assessment.js's scoring engine. Re-computed here rather than
   trusted from the client, so a tampered payload can't fake its own score/pricing. */

export function bandScore(value, table) {
  return table.hasOwnProperty(value) ? table[value] : 0;
}

export function computeScores(answers) {
  const revenueScore = bandScore(answers.revenue, {
    "Under $500K": 0, "$500K–$2M": 1, "$2M–$5M": 2, "$5M+": 3,
  });
  const volumeScore = bandScore(answers.volume, {
    "Under 25": 0, "25–100": 1, "100–300": 2, "300+": 3,
  });
  const adminHoursScore = bandScore(answers.admin_hours, {
    "Under 5 hrs": 0, "5–15 hrs": 1, "15–30 hrs": 2, "30+ hrs": 3,
  });
  const economicValue = Math.max(revenueScore, volumeScore, adminHoursScore);

  const painMagnitude = bandScore(answers.value_if_fixed, {
    "Under $10K": 0, "$10K–$50K": 1, "$50K–$150K": 2, "$150K+": 3, "Not sure": 1,
  });

  let workflowRepeatability = 0;
  if (["Paid ads", "Inbound calls"].includes(answers.lead_source)) workflowRepeatability += 1;
  if (Array.isArray(answers.admin_tasks) && answers.admin_tasks.length > 0) workflowRepeatability += 1;
  workflowRepeatability = Math.min(workflowRepeatability, 2);

  const SYSTEM_FIELDS = ["crm_tools", "email_file_tools", "videoconf_tools", "messaging_tools", "ai_tools"];
  const hasAnySystemTool = SYSTEM_FIELDS.some((id) => Array.isArray(answers[id]) && answers[id].length > 0);

  let integrationFeasibility = 0;
  if (answers.mandated_systems === "No") integrationFeasibility += 1;
  if (hasAnySystemTool) integrationFeasibility += 1;
  integrationFeasibility = Math.min(integrationFeasibility, 2);

  const authorityUrgency = bandScore(answers.approval, {
    "Just me": 2, "Me + a partner/manager": 1, "Corporate approval needed": 0, "Not sure": 0,
  });

  const totalScore = painMagnitude + economicValue + workflowRepeatability + integrationFeasibility + authorityUrgency;

  let tier = "C";
  const hasAuthority = ["Just me", "Me + a partner/manager"].includes(answers.approval);
  if (totalScore >= 8 && hasAuthority) {
    tier = "A";
  } else if (totalScore >= 5) {
    tier = "B";
  }

  return { revenueScore, volumeScore, adminHoursScore, economicValue, painMagnitude, workflowRepeatability, integrationFeasibility, authorityUrgency, totalScore, tier };
}

export const CATEGORY_MAP = {
  "Cash collection / invoicing": { name: "Faster Cash Collection", pitch: "Automated follow-ups and approvals to shorten the cash cycle and reduce manual work.", hasProof: true },
  "Payroll processing": { name: "Payroll & Cash Prep", pitch: "Calendar- and order-driven payroll prep, so cash is ready before it's needed.", hasProof: true },
  "Marketing spend efficiency": { name: "Ad Spend Reallocation", pitch: "Used real customer data to optimize spend by location, driving higher ROI in every market.", hasProof: true },
  "Staff / rep performance visibility": { name: "Performance Visibility & QA", pitch: "Full-coverage QA and performance diagnostics — not just a 1% sample.", hasProof: true },
  "Reporting / visibility into the numbers": { name: "Rolling Forecasting & Reporting", pitch: "A rolling forecast flags shortfalls and trends weeks ahead, not after the fact.", hasProof: true },
  "Unfollowed leads / estimates": { name: "Lead & Estimate Recovery", pitch: "Structured, automatic follow-up on every lead or estimate that doesn't close right away.", hasProof: false },
  "Matching invoices to work orders (AP)": { name: "AP Matching Automation", pitch: "Automated matching of invoices to work orders, cutting manual reconciliation time.", hasProof: false },
  "Email / inbox triage": { name: "Inbox Triage", pitch: "Automatic sorting, routing, and drafting for high-volume inboxes.", hasProof: false },
  "Data entry between systems": { name: "System-to-System Integration", pitch: "Removing manual re-entry between the tools you already use.", hasProof: false },
  "Scheduling / dispatch coordination": { name: "Scheduling & Dispatch Automation", pitch: "Coordinated scheduling/dispatch without a person manually juggling it.", hasProof: false },
};

export function recommendCategory(answers) {
  if (CATEGORY_MAP[answers.pain_area]) return CATEGORY_MAP[answers.pain_area];
  if (Array.isArray(answers.admin_tasks)) {
    for (const t of answers.admin_tasks) {
      if (CATEGORY_MAP[t]) return CATEGORY_MAP[t];
    }
  }
  return CATEGORY_MAP["Unfollowed leads / estimates"];
}

const PRICING_BANDS = [
  { max: 1, setup: "$1,500–$3,500", monthly: "$2,500–$3,000" },
  { max: 2, setup: "$3,500–$6,000", monthly: "$3,000–$3,750" },
  { max: 3, setup: "$6,000–$8,500", monthly: "$3,750–$4,500" },
];

export function pricingBand(economicValue) {
  for (const band of PRICING_BANDS) {
    if (economicValue <= band.max) return band;
  }
  return PRICING_BANDS[PRICING_BANDS.length - 1];
}
