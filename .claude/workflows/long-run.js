// .claude/workflows/long-run.js
// Sequential step executor for AIDOS/KRD. Reads PLAN.md (root index). Each step is
// implemented by step-executor then validated by step-verifier. Advances only after a pass.
// State, gating and resume live here — not in the conversation context.
export const meta = {
  name: 'long-run',
  description: "Execute PLAN.md step by step: step-executor implements, step-verifier validates. Advances only after validation. Resumes from cache.",
  whenToUse: "Long task split into sequential steps. No arg → reads PLAN.md ; {planPath:'...'} for another plan ; {maxRetries:N} retries per step (default 2) ; {startFrom:'S02'} begin at that step id (skips earlier, already-done steps) ; {maxSteps:N} stop after the first N steps ; {stopAfter:'S47'} stop after that step id.",
  phases: [
    { title: 'Plan', detail: 'parse PLAN.md' },
    { title: 'Run', detail: 'executor + verifier per step, sequential' },
  ],
}

const PLAN_PATH = (args && args.planPath) || 'PLAN.md'
const MAX_RETRIES = (args && args.maxRetries) ?? 2
const START_FROM = (args && args.startFrom) || null
const MAX_STEPS = (args && args.maxSteps) || null
const STOP_AFTER = (args && args.stopAfter) || null

const PLAN_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' },
          objectif: { type: 'string' },
          detailDoc: { type: 'string', description: 'path to the detailed step .md under docs/plan/' },
          inputs: { type: 'array', items: { type: 'string' } },
          criteres: { type: 'string' },
        },
        required: ['id', 'objectif', 'criteres'],
      },
    },
  },
  required: ['steps'],
}

const EXEC_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    step: { type: 'string' },
    status: { type: 'string', enum: ['done', 'blocked'] },
    outputs: { type: 'array', items: { type: 'string' } },
    files_changed: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['step', 'status', 'files_changed'],
}

const VERIFY_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    step: { type: 'string' },
    verification_status: { type: 'string', enum: ['passed', 'failed'] },
    corrections_applied: { type: 'array', items: { type: 'string' } },
    residual_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['step', 'verification_status', 'residual_issues'],
}

// 1. Parse the plan (the script reads no file: the agent reads).
phase('Plan')
const plan = await agent(
  `Read ${PLAN_PATH} and return each step: id, objectif, detailDoc (its docs/plan/*.md), inputs, done criteria. Execute no step.`,
  { label: 'plan:parse', phase: 'Plan', schema: PLAN_SCHEMA, model: 'opus' },
)

// Bound the run: maxSteps (first N) and/or stopAfter (step id, inclusive).
// Robust id match (trim + case-insensitive); anti-runaway guard if a requested
// bound does not match — run ONLY the first step rather than the whole plan.
const norm = (x) => String(x ?? '').trim().toUpperCase()
let steps = plan.steps
// startFrom: begin at a given step id (skip earlier, already-done steps). Applied
// BEFORE maxSteps/stopAfter so they compose. If the id isn't found, do NOT skip
// (run the full plan) and warn — never silently drop every step.
if (START_FROM) {
  const idx = steps.findIndex((s) => norm(s.id) === norm(START_FROM))
  if (idx >= 0) {
    steps = steps.slice(idx)
  } else {
    log(`⚠ startFrom='${START_FROM}' not found among step ids [${steps.slice(0, 5).map((s) => s.id).join(', ')}…]; running the full plan from the start.`)
  }
}
if (MAX_STEPS) steps = steps.slice(0, MAX_STEPS)
if (STOP_AFTER) {
  const idx = steps.findIndex((s) => norm(s.id) === norm(STOP_AFTER))
  if (idx >= 0) {
    steps = steps.slice(0, idx + 1)
  } else {
    log(`⚠ stopAfter='${STOP_AFTER}' not found among step ids [${steps.slice(0, 5).map((s) => s.id).join(', ')}…]; running ONLY the first step to avoid a runaway.`)
    steps = steps.slice(0, 1)
  }
}
log(`${plan.steps.length} steps in plan; running ${steps.length}${MAX_STEPS || STOP_AFTER ? ' (bounded)' : ''}: ${steps.map((s) => s.id).join(', ')}`)

// 2. Sequential loop: steps depend on each other → no parallelism.
phase('Run')
const done = []
let prevOutputs = []

for (const s of steps) {
  let report, verdict, attempt = 0

  while (attempt <= MAX_RETRIES) {
    const retryCtx = attempt > 0
      ? `\nRetry ${attempt}. Residual issues to fix:\n- ${verdict.residual_issues.join('\n- ')}`
      : ''

    report = await agent(
      `Step ${s.id}\nObjective: ${s.objectif}\n` +
      `Detailed spec: read ${s.detailDoc || `docs/plan/${s.id}.md`} and follow CLAUDE.md §6 (the per-step KRD loop: grill→BDD mirror→tdd→sensors→diagnose→UI+Playwright→improve).\n` +
      `Inputs: ${(s.inputs ?? []).concat(prevOutputs).join(', ') || '(none)'}\n` +
      `Done criteria: ${s.criteres}${retryCtx}`,
      { label: `exec:${s.id}:${attempt}`, phase: 'Run', agentType: 'step-executor', schema: EXEC_SCHEMA },
    )

    if (report.status === 'blocked') {
      return { verdict: 'BLOCKED', stoppedAt: s.id, reason: report.notes, ranBefore: done }
    }

    verdict = await agent(
      `step-executor report for ${s.id}:\n${JSON.stringify(report, null, 2)}\n` +
      `Done criteria: ${s.criteres}\nRe-read the changed files, fix any gap, return your verdict.\n` +
      `BOOTSTRAP RULE (CLAUDE.md §6): a by-design forward-dependency — substrate owned by a LATER step (the mirrors Postgres schema arrives at S06, the wall hook at S04, the changeset engine at S20) — is an OpenQuestion, NOT a residual issue. PASS the step if its OWN done-criteria are met (e.g. S00 = the contract doc + /contract Workbench page + its e2e; a materialized-file mirror + executable test is a valid mirror before S06). residual_issues holds ONLY blocking gaps fixable now; never block a step for what it cannot fix by design.`,
      { label: `verify:${s.id}:${attempt}`, phase: 'Run', agentType: 'step-verifier', schema: VERIFY_SCHEMA },
    )

    if (verdict.verification_status === 'passed' && verdict.residual_issues.length === 0) break
    attempt++
  }

  // 3. Guardrail = the stop. No mid-run input → hand back.
  if (verdict.verification_status !== 'passed' || verdict.residual_issues.length) {
    return {
      verdict: 'STOP',
      stoppedAt: s.id,
      residual_issues: verdict.residual_issues,
      ranBefore: done,
      message: `Step ${s.id} not validated after ${MAX_RETRIES} retries. Fix, then relaunch the workflow (validated steps return from cache).`,
    }
  }

  done.push(s.id)
  prevOutputs = report.outputs ?? []
  log(`✓ ${s.id} validated`)
}

return { verdict: 'DONE', steps: done.length, completed: done }
