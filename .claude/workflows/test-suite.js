// .claude/workflows/test-suite.js
// Parallel scenario runner for AIDOS/KRD. Reads TEST_PLAN.md (root index). Scenarios are
// independent → run them in parallel via test-runner, then gate on failures. State and
// gating live here — not in the conversation context. (Mirrors long-run.js style.)
export const meta = {
  name: 'test-suite',
  description: "Execute TEST_PLAN.md scenarios in parallel via test-runner, gate on failures, then compat-check any suggestions.",
  whenToUse: "Independent scenarios run side by side. No arg → reads TEST_PLAN.md ; {planPath:'...'} for another plan.",
  phases: [
    { title: 'Plan', detail: 'parse TEST_PLAN.md into scenarios' },
    { title: 'Run', detail: 'one test-runner per scenario, parallel' },
    { title: 'Compat', detail: 'compat-check the collected suggestions' },
  ],
}

const PLAN_PATH = (args && args.planPath) || 'TEST_PLAN.md'

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    scenarios: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          objectif: { type: 'string' },
          commande: { type: 'string', description: 'the command / gesture the test-runner executes' },
          attendu: { type: 'string', description: 'the expected result' },
        },
        required: ['id', 'objectif', 'commande', 'attendu'],
      },
    },
  },
  required: ['scenarios'],
}

const RUN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    scenario: { type: 'string' },
    status: { type: 'string', enum: ['PASS', 'FAIL'] },
    details: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['scenario', 'status', 'details', 'suggestions'],
}

const COMPAT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    compatible: { type: 'array', items: { type: 'string' } },
    conflicting: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['compatible', 'conflicting', 'notes'],
}

// 1. Parse the plan (the script reads no file: the agent reads).
phase('Plan')
const plan = await agent(
  `Read ${PLAN_PATH} and return each scenario: id, objectif, commande (the gesture to execute), attendu (expected result). Run no scenario.`,
  { label: 'plan:parse', phase: 'Plan', schema: PLAN_SCHEMA, model: 'opus' },
)
log(`${plan.scenarios.length} scenarios`)

// 2. Independent scenarios → run them in parallel, one test-runner each.
phase('Run')
const results = await parallel(
  plan.scenarios.map((sc) => () => agent(
    `Scenario ${sc.id}\nObjective: ${sc.objectif}\n` +
    `Command: ${sc.commande}\nExpected: ${sc.attendu}\n` +
    `Execute it, judge PASS/FAIL deterministically (the mirror + reality is the judge — never declare PASS to be helpful), ` +
    `record details, and list any suggestions for follow-up changes.`,
    { label: `run:${sc.id}`, phase: 'Run', agentType: 'test-runner', schema: RUN_SCHEMA },
  )),
)

// 3. Gate: collect the failures.
const failures = results.filter((r) => r.status === 'FAIL')
for (const f of failures) log(`✗ ${f.scenario}: ${f.details}`)
log(`${results.length - failures.length}/${results.length} passed`)

// 4. Compat: if any scenario produced suggestions, check them against each other.
let conflicts = 0
const suggestions = results.flatMap((r) => r.suggestions ?? [])
if (suggestions.length) {
  phase('Compat')
  const compat = await agent(
    `These suggestions came out of the scenario run:\n- ${suggestions.join('\n- ')}\n` +
    `Group them into compatible (can land together, no conflict) and conflicting (mutually exclusive or contradicting). ` +
    `Add notes on the conflicts. Apply nothing — this is an analysis only.`,
    { label: 'compat:check', phase: 'Compat', agentType: 'suggestion-compat-checker', schema: COMPAT_SCHEMA },
  )
  conflicts = compat.conflicting.length
  log(`${compat.compatible.length} compatible, ${conflicts} conflicting`)
}

return {
  total: results.length,
  passed: results.length - failures.length,
  failed: failures.length,
  conflicts,
}
