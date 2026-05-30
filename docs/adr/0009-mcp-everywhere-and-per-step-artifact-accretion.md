---
status: accepted
---

# Every backend op is an MCP tool; every step accretes its skills/agents/hooks/MCPs via the official creators

Two standing mandates, applied from S00 onward and at the end of **every** step.

## 0. Every backend API/op is MCP-accessible (no exception)

Every backend operation AIDOS exposes — read/write the truth-store, run a mirror, run a sensor, apply a changeset, query the DAG, intake an idea, recall memory, compile context, emit a projection, verify a Pact, read telemetry — **must be reachable as an MCP tool** (Go MCP SDK, one tool = one backend op). The MCP surface is the *capability* layer the agent/Workbench/external clients drive; the kernel + hooks remain the *authority* layer (what is *allowed*). This is forward-looking: a new backend op without an MCP tool is incomplete. (Strengthens CLAUDE.md §3 "MCP" + §5.)

## 1 & 2. Per-step artifact accretion via `skill-creator` + `agent-creator`

At the **end of every step** (and a broader upfront batch at **S00–S01**), create the **skills, agents, hooks, and MCP servers** the step makes necessary or foreseeably needed — using the **official Anthropic skills**: **`skill-creator`** (`claude-plugins-official/skill-creator`) for skills and the **`agent-creator`** agent (`claude-plugins-official/plugin-dev`) for subagents. Think about the MCPs needed **for both planes**:

- **the AIDOS code & code-generation** (the OS engine: the gestures, sensors, emitters, runners the agent replays while building AIDOS), and
- **the generated app** (the product AIDOS emits: skills/agents/hooks/MCPs the *built* application will need, e.g. its own data ops on the Doltgres store, ADR 0006).

**Honesty guard (reconciles with CLAUDE.md §5).** Skills and agents are feedforward procedures — safe to create ahead via the creators. **Hooks and MCP servers** are created as **declared scaffolds/specs** but only **activated** at the step that needs them, each with its **fault-injection test** (a hook that never fires is dead). Front-loading a *spec* is allowed; front-loading an *active, never-firing* guardrail is not. A new artifact may **ADD** a guardrail, never remove one.

## Considered Options

- **Create artifacts only when strictly needed, ad hoc.** Rejected per the user mandate: the agent should look ahead, so the skill/agent/MCP surface is ready and consistent (built with the official creators, not hand-rolled inconsistently).
- **Front-load *everything* fully at S00/S01.** Rejected for hooks/MCPs: violates the hook-honesty rule (a guardrail must have failed a real run first). Accepted for **skills/agents** (feedforward) and for **specs/scaffolds** of hooks/MCPs.
- **Per-step accretion via the official creators (chosen)**: skills + agents created with `skill-creator`/`agent-creator`; hooks + MCP scaffolded then activated+fault-injected at their step; every backend op gets an MCP tool.

## Consequences

- **CLAUDE.md §6 gains a final loop step** ("artifact accretion"): at each step's end, run `skill-creator`/`agent-creator` for the skills/agents the step needs, scaffold its hooks/MCP, and ensure every new backend op has an MCP tool — for both the OS code and the emitted app.
- **S00–S01 carry a larger upfront batch**: the foundational skill/agent inventory (CLAUDE.md §6 list) is generated, and the MCP/hook specs are scaffolded, so later steps flesh out + activate their own.
- **MCP is a completeness criterion**: `aidos check` / the completeness law should flag a backend op with no MCP tool, the same way it flags a truth with no mirror.
- **Cost**: the per-step loop is heavier (more agents/artifacts). Acceptable under the project's "reuse the official creators, don't hand-roll" stance; the creators keep the artifacts uniform and well-formed.
