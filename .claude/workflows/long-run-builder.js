// .claude/workflows/long-run-builder.js
// Baked variant of long-run.js for the AIDOS app-builder track (BUILDER_PLAN.md, S53→S117).
// WHY a dedicated script: the Workflow tool's `args` param does NOT forward to a
// scriptPath-launched script's `args` global (observed: a BUILDER_PLAN/S62 launch ran
// PLAN.md from S00 instead). So the plan path + the start cursor are baked as LITERAL
// defaults here (args, if ever wired, still override). The orchestrator rewrites the
// START_FROM literal below via Edit between auto-relaunches (the dynamic cursor).
// Body is otherwise byte-identical to long-run.js.
export const meta = {
  name: 'long-run-builder',
  description: "Execute BUILDER_PLAN.md (app-builder S53→S117) step by step: step-executor implements, step-verifier validates. Advances only after validation. Resumes from cache.",
  whenToUse: "App-builder track. Plan + start cursor are baked literals (args override if present). Edit START_FROM between relaunches.",
  phases: [
    { title: 'Plan', detail: 'parse BUILDER_PLAN.md' },
    { title: 'Run', detail: 'executor + verifier per step, sequential' },
  ],
}

const PLAN_PATH = (args && args.planPath) || 'BUILDER_PLAN.md'
const MAX_RETRIES = (args && args.maxRetries) ?? 2
const START_FROM = (args && args.startFrom) || 'FK06' // CURSOR — orchestrator edits this literal between relaunches
const MAX_STEPS = (args && args.maxSteps) || 5 // BATCH SIZE — orchestrator commits+relaunches per batch (args override)
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
// Wrapped in a retry: a one-off StructuredOutput miss here must NOT kill the whole
// run (this was the only agent() call outside the per-step try/catch).
phase('Plan')
let plan = null
for (let pa = 0; pa < 3 && !plan; pa++) {
  try {
    plan = await agent(
      `Read ${PLAN_PATH} and return each step: id, objectif, detailDoc (its docs/plan/*.md), inputs, done criteria. Execute no step.`,
      { label: `plan:parse:${pa}`, phase: 'Plan', schema: PLAN_SCHEMA, model: 'opus' },
    )
  } catch (e) {
    log(`⚠ plan:parse attempt ${pa} failed (${String(e?.message ?? e).slice(0, 80)}); retrying`)
  }
}
if (!plan) {
  return { verdict: 'STOP', stoppedAt: 'plan', message: 'plan:parse never returned StructuredOutput after 3 tries' }
}

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
    try {
    const retryCtx = attempt > 0
      ? `\nRetry ${attempt}. Residual issues to fix:\n- ${verdict.residual_issues.join('\n- ')}`
      : ''

    const execPrompt =
      `Step ${s.id}\nObjective: ${s.objectif}\n` +
      `Detailed spec: read ${s.detailDoc || `docs/plan/${s.id}.md`} and follow CLAUDE.md §6 (the per-step KRD loop: grill→BDD mirror→tdd→sensors→diagnose→UI+Playwright→improve).\n` +
      `Inputs: ${(s.inputs ?? []).concat(prevOutputs).join(', ') || '(none)'}\n` +
      `Done criteria: ${s.criteres}${retryCtx}\n\n` +
      `⛔ REPORTING DISCIPLINE (a hard rule — violating it has wasted entire steps). Your turn budget is FINITE and you do NOT reliably sense when it is near. Therefore: the MOMENT your done-criteria above are met, call StructuredOutput as your VERY NEXT action — BEFORE any final-polish pass. Do NOT, after the work is done, run redundant verification (re-running biome/go test/git status, re-reading files you just wrote, "let me do one last check"): that endless final-checking is exactly what burned the turn budget on a prior step and left no turn to report. Reserve your last few turns for the StructuredOutput call. If you have NOT finished, still emit StructuredOutput with status:'blocked' and notes listing precisely what remains. Never end with a plain-text message.\n` +
      `If much of this step already exists on disk from a prior interrupted attempt (files present, Linear issue already Done), do NOT redo it — verify it meets the done-criteria and report status:'done' quickly.`
    const execOpts = { label: `exec:${s.id}:${attempt}`, phase: 'Run', schema: EXEC_SCHEMA }
    // Dispatch to this step's DEDICATED agent (CLAUDE.md §6: one agent per step,
    // step-sNN). It is only in the registry after a Claude restart, so fall back to
    // the generic step-executor (same contract) when it isn't loaded yet.
    const dedicated = `step-${norm(s.id).toLowerCase()}`
    try {
      report = await agent(execPrompt, { ...execOpts, agentType: dedicated })
    } catch (e) {
      log(`↪ dedicated agent '${dedicated}' unavailable (${String(e?.message ?? e).slice(0, 80)}); using step-executor`)
      report = await agent(execPrompt, { ...execOpts, agentType: 'step-executor' })
    }

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
    } catch (e) {
      // An agent finished without StructuredOutput (or another infra error). Don't let it
      // kill the whole run — treat the attempt as a failure and retry the step.
      log(`⚠ ${s.id} attempt ${attempt}: agent infra error (${String(e?.message ?? e).slice(0, 90)}); retrying the step`)
      verdict = { verification_status: 'failed', residual_issues: [`infra: agent did not report — ${String(e?.message ?? e).slice(0, 100)}`] }
    }
    attempt++
  }

  // 3. Guardrail = the stop. No mid-run input → hand back.
  if (!verdict || verdict.verification_status !== 'passed' || verdict.residual_issues.length) {
    return {
      verdict: 'STOP',
      stoppedAt: s.id,
      residual_issues: verdict ? verdict.residual_issues : ['no verdict (agent never reported after retries)'],
      ranBefore: done,
      message: `Step ${s.id} not validated after ${MAX_RETRIES} retries. Fix, then relaunch the workflow (validated steps return from cache).`,
    }
  }

  done.push(s.id)
  prevOutputs = report.outputs ?? []
  log(`✓ ${s.id} validated`)
}

return { verdict: 'DONE', steps: done.length, completed: done }
