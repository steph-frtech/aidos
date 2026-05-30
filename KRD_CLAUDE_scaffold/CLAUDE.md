# CLAUDE.md — KRD Implementation Agent Contract

## Mission

You are working inside a KRD project.

KRD means **Kernel-Ratchet Development**: a system for turning uncertain ideas into verified, versioned, scoped, authorized, observable software truths.

The core rule is:

> **Never go prompt → code directly.**
>
> Always go:
>
> `Idea → BDD Mirror → Goal → Kernel/Truth → Red Set → Implementation → Green → Stable Phase`

The human owns truth.  
The agent owns implementation.  
The harness enforces the wall.

---

# 0. Non-negotiable laws

## 0.1 Everything is BDD-first

Every feature, change, behavior, workflow, projection, hook, MCP capability, skill, or runtime mechanism must start with a **BDD scenario** or a mirror that can be expressed as BDD.

No implementation starts before a failing scenario exists.

BDD can be written as:

```gherkin
Feature: <capability>

  Scenario: <behavior>
    Given <context>
    When <event/action>
    Then <observable result>
```

If the thing is not naturally Gherkin, create an equivalent mirror:

- invariant → property-based test
- workflow → statechart scenario
- API → contract scenario
- hook → enforcement scenario
- MCP tool → capability scenario
- skill → procedure scenario
- UX → ExperienceInvariant scenario
- memory/context → decision reuse scenario
- data migration → before/after data scenario
- reality feedback → telemetry/incident scenario

## 0.2 No truth without mirror

A truth without a mirror is a wish.

A mirror must be executable, or explicitly human-reviewed when the truth is experiential or non-deterministic.

```yaml
Truth:
  id: ...
  truth_kind: behavioral | structural | experiential | economic | regulatory | statistical | exploratory
  verifiability: deterministic | statistical | delayed | human_judged | unverifiable
  scope: ...
  authority: ...
  mirror: ...
```

## 0.3 No memory to kernel directly

Memory is not truth.

Allowed flow:

```text
Memory → ContextPack → Idea → Mirror → Goal → Kernel
```

Forbidden flow:

```text
Memory → Kernel
```

## 0.4 No agent writes above the waterline

The agent may propose changes above the waterline, but must not silently apply them.

Above the waterline:

```text
/kernel
/mirror/above
/authority
/fitness
/meta-meta
```

Below the waterline:

```text
/src
/projections
/runtime generated files
/branches/evolution
/reports
```

If a task requires above-the-line mutation, create a ChangeSet in DRAFT and mark it for human approval.

## 0.5 Every step must be minimal, autonomous, visualizable

Each implementation step must produce:

```text
1. one small capability
2. one failing BDD/mirror first
3. one implementation
4. one automated test
5. one UI visualization or Workbench panel
6. one stable output
7. no silent overwrite of previous artifacts
```

---

# 1. Repository zones

Use this structure unless the project explicitly defines another one.

```text
/ideas        candidate truths, not frozen
/kernel       frozen truths, above the line
/mirror       executable proofs and BDD specs
/src          implementation and projections
/brain        memory adapters, ContextGraph, ContextRouter
/archive      ChangeSets, DAG, phases, branches
/runtime      hooks, queues, compiler, scheduler
/tools        CLI, scripts, MCP adapters
/skills       reusable agent procedures
/workbench    UI visualizations
/docs         human-readable documentation
/reports      generated reports
/spike        exploratory work, cliquet OFF
```

---

# 2. Standard workflow for every task

## Step A — Classify the request

Before coding, classify the task:

```yaml
TaskClassification:
  is_new_truth: true|false
  is_projection_only: true|false
  is_refactor: true|false
  is_spike: true|false
  truth_kind: ...
  verifiability: ...
  scope: ...
  authority_required: ...
  expected_artifacts:
    - BDD
    - Mirror
    - Skill
    - MCP
    - Hook
    - WorkbenchPanel
```

If the task is not objectively verifiable, do not force it into the kernel. Use `/spike`, `ExperienceClaim`, `human_review`, or `experiment`.

## Step B — Write BDD first

Create or update a scenario in `/mirror`.

Every scenario must answer:

```text
Given what state?
When what action happens?
Then what must be observable?
Who owns this truth?
What scope does it apply to?
How does it fail?
```

## Step C — Open a goal

A goal is the red set.

```yaml
Goal:
  id: ...
  source: idea | incident | human_request | refactor
  red_set:
    - mirror_id
  stop_condition:
    - all_red_green
    - no_previous_green_broken
    - completeness_law_holds
    - scope_valid
    - authority_valid
```

## Step D — Implement below the line

Only after the red mirror exists:

```text
red → minimal implementation → green → refactor
```

## Step E — Visualize

Every step needs a UI surface.

Examples:

- TruthKind matrix
- Mirror health
- Red wave graph
- ChangeSet timeline
- DAG view
- ContextPack viewer
- Hook monitor
- Skill registry
- MCP tool registry
- Workbench panel
- BDD scenario viewer
- RealityMirror incident replay

## Step F — Stable phase

A step is done only if:

```text
BDD/mirrors green
previous green still green
krd check passes
UI visualization exists
ChangeSet is coherent
BlockReasons resolved
no above-line mutation without approval
```

---

# 3. BDD rules

## 3.1 BDD file naming

Use:

```text
/mirror/<domain>/<feature>.feature
/mirror/<domain>/<feature>.property.test.*
/mirror/<domain>/<feature>.contract.test.*
/mirror/<domain>/<feature>.statechart.*
```

Examples:

```text
/mirror/checkout/apply-promo.feature
/mirror/checkout/create-order.statechart.ts
/mirror/checkout/can-place-order.property.test.ts
/mirror/context/reuse-decision.feature
/mirror/hooks/block-kernel-write.feature
```

## 3.2 BDD scenario quality

A BDD scenario must be:

- observable
- scoped
- owned
- minimal
- independent
- executable or explicitly human-reviewed
- linked to a truth or idea

Bad:

```gherkin
Scenario: The checkout is nice
```

Good:

```gherkin
Scenario: Promo code cannot make the total negative
  Given a cart total of 10 euros
  And a promo code worth 15 euros
  When the customer applies the promo code
  Then the order total is 0 euros
  And the discount is capped at 10 euros
```

For UX:

```gherkin
Scenario: Primary checkout action is identifiable
  Given the cart page is displayed on mobile
  When the user scans the visible actions
  Then exactly one primary action is visually dominant
  And the action label communicates purchase intent
```

This UX scenario requires human or heuristic mirror, not pure deterministic proof unless the project defines a heuristic DSL.

---

# 4. Skills policy

## 4.1 Create a skill when a procedure repeats

Create or update a skill when:

- the same workflow appears twice
- a step has more than three manual instructions
- a recurring error should become a reusable procedure
- a human decision needs a guided review
- a BDD pattern repeats
- a projection generation pattern repeats

Skills live in:

```text
/skills/<skill-name>/SKILL.md
```

## 4.2 Skill format

Each skill must contain:

```markdown
# Skill: <name>

## Purpose

## When to use

## Inputs

## Outputs

## BDD/mirror required before use

## Steps

## Stop conditions

## Failure modes

## Related hooks

## Related MCP tools

## Workbench visualization
```

## 4.3 Required core skills

Create these as soon as the repo reaches the relevant stage:

```text
/skills/write-bdd-scenario
/skills/classify-truth
/skills/open-goal
/skills/derive-mirror
/skills/check-completeness
/skills/compute-red-wave
/skills/propose-composes-weight
/skills/review-authority
/skills/build-context-pack
/skills/trim-kernel
/skills/replay-incident
/skills/evolve-in-sandbox
/skills/semantic-diff
/skills/explain-block
```

Do not create all skills on day one. Create them when the step requires them. But when the need appears, the skill must be created.

---

# 5. MCP policy

## 5.1 Create an MCP tool when the agent needs an external capability

Create or configure MCP when the task requires access to:

- file index
- test runner
- browser
- database
- telemetry
- issue tracker
- design system
- memory system
- ContextGraph
- CI status
- artifact store
- documentation search

MCP tools must not bypass KRD laws.

## 5.2 MCP tool contract

Every MCP tool must have:

```yaml
MCPTool:
  name: ...
  purpose: ...
  input_schema: ...
  output_schema: ...
  permissions:
    read:
      - ...
    write:
      - ...
  forbidden:
    - /kernel direct write
    - /mirror/above direct write
    - /authority direct write
  related_bdd:
    - ...
  related_hook:
    - ...
```

## 5.3 MCP must have BDD

Any MCP tool must have at least one BDD scenario.

Example:

```gherkin
Feature: ContextGraph MCP

  Scenario: Expired decision cannot be reused
    Given a stored decision that expired yesterday
    When the agent asks the ContextGraph if it may reuse it
    Then the MCP response is may_reuse false
    And the reason is "expired"
```

---

# 6. Hooks policy

## 6.1 Create a hook when a rule must be enforced mechanically

Create a hook when:

- a law must not rely on discipline
- a recurring failure must become impossible
- an unsafe operation must be blocked
- a Stop condition must be checked
- a generated artifact must be validated
- a tool call must be constrained

Hooks live in:

```text
/runtime/hooks
```

## 6.2 Required hook categories

```yaml
Hooks:
  PreToolUse:
    - block_agent_write_above_waterline
    - validate_scope_before_reuse
    - block_memory_to_kernel_direct
  PostToolUse:
    - run_affected_mirrors
    - run_krd_check
    - update_red_work_queue
    - record_provenance
  Stop:
    - all_red_green
    - no_previous_green_broken
    - completeness_law_holds
    - scope_valid
    - authority_valid
    - mutation_threshold_met_if_required
  Continuous:
    - kernel_debt_scan
    - mirror_liveness_scan
    - context_graph_reuse_audit
    - archive_curation
    - reality_mirror_monitor
```

## 6.3 Hook BDD example

```gherkin
Feature: Kernel write protection

  Scenario: Agent tries to write directly to kernel
    Given the actor is an agent
    And the target path is /kernel/payment/policy.yaml
    When the write is attempted
    Then the PreToolUse hook blocks the write
    And the BlockReason is "AGENT_WRITE_ABOVE_WATERLINE"
```

---

# 7. Workbench/UI policy

## 7.1 Every step needs a visualization

Every implementation step must add or update at least one Workbench panel.

This is not optional. KRD is graph-heavy; without visualization, humans cannot govern truth.

## 7.2 Core Workbench panels

Create these progressively:

```text
Core Entities
Truth Typing
Mirror Health
BDD Scenarios
Goal Red Set
Link Graph
Truth Tree
Red Propagation
Semantic Diff
Version DAG
Ideas Funnel
Context Pack Viewer
Decision Reuse
Hooks Monitor
Kernel Debt
Truth Lifecycle
Data Truth Scope
Entity Map
Operation State Machine
Policy Invariants
UI Truth Tree
Experience Checks
API Projection
Web Preview
Mobile Preview
Saga Graph
Temporal Rules
Incidents → Ideas
Evolution Sandbox
QD Archive
Cell Vitality
Harness Economics
Compiler Report
Release Dashboard
```

## 7.3 UI must show block reasons

If something is red or blocked, the UI must show:

```text
what is blocked
why
who owns the fix
how to fix
which command to run next
```

---

# 8. Tool search policy for implementation steps

When a step requires choosing tooling, do not guess.

At the beginning of that step:

1. Search current best tools.
2. Prefer official sources.
3. Compare at most three.
4. Choose the simplest tool that satisfies the step.
5. Record the choice in an ADR.
6. Do not over-engineer.

Tool choice examples:

```text
BDD runner
property-based testing library
statechart/model testing
schema validation
contract testing
mutation testing
UI framework
graph visualization
local database
content-addressed store
memory backend
MCP SDK
test runner
```

Do not search tools globally for all future steps. Search only for the current step.

---

# 9. Anti-overwrite rule

Each step must preserve previous stable phases.

Forbidden:

- rewriting old artifacts without ChangeSet
- replacing a previous model silently
- deleting truths directly
- changing a mirror without semantic diff
- modifying generated files as if they were sources
- changing authority or scope without explicit reason

Allowed:

- adding new files
- adding a ChangeSet
- superseding via version
- deprecating via lifecycle
- creating a new branch
- creating a projection from a source

---

# 10. ChangeSet rules

Every non-trivial change must be wrapped in a ChangeSet.

```yaml
ChangeSet:
  id: ...
  status: DRAFT | APPLIED | REVERTED
  semantic_diff: ...
  touched:
    - ...
  mirrors_affected:
    - ...
  red_wave:
    - ...
  authority_required:
    - ...
  block_reasons:
    - ...
```

A ChangeSet cannot become APPLIED if:

- a truth lacks a mirror
- scope is missing
- authority is missing
- affected mirrors are red
- Stop condition fails
- mutation threshold fails when required
- ContextGraph reuse is invalid
- memory tries to enter kernel directly

---

# 11. Agent behavior rules

## 11.1 Always act as a KRD agent

Before implementation, write:

```text
Classification:
BDD/mirror:
Artifacts touched:
Need skill? yes/no
Need MCP? yes/no
Need hook? yes/no
Need UI? yes/no
Expected tests:
```

## 11.2 Ask for human approval only at true checkpoints

Human approval is required for:

- above-the-line truth changes
- authority changes
- scope changes with product/regulatory meaning
- mirror changes that redefine behavior
- weight reclassification to load-bearing/critical
- deleting or deprecating truth
- promotion from experiment to kernel
- anything irreversible

Do not ask for approval for simple below-the-line implementation if the mirror is already defined.

## 11.3 Never claim done without evidence

A final step report must include:

```text
BDD scenarios added/updated
tests run
UI panel added/updated
ChangeSet status
red set status
known limitations
next safe step
```

---

# 12. KRD commands expected over time

Implement progressively:

```bash
krd check
krd impact
krd stable
krd diff
krd explain
krd trim
krd goal
krd grill
krd spike
krd harvest
krd context-pack
krd mirror-health
krd authority-check
krd scope-check
krd red-queue
krd evolve
```

Do not fake a command as complete if it is only a stub. Mark it as stub in UI and reports.

---

# 13. Definition of Done

A step is done only when:

```text
BDD first exists
test/mirror runs
implementation passes
krd check passes for the implemented scope
Workbench visualization exists
BlockReasons are actionable
previous phase is not overwritten
ChangeSet is coherent
next step can build on this without cleanup
```

---

# 14. Final principle

KRD is not a coding style.

It is a protocol for governing the transformation of uncertain ideas into verified software truths.

Therefore:

```text
Probabilistic search is allowed.
Deterministic acceptance is mandatory.
BDD is the entry point.
Mirrors are the judge.
Hooks enforce the wall.
Skills package repeatable gestures.
MCP gives controlled capabilities.
The Workbench makes truth governable.
```
