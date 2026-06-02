---
name: project-s16-authority
description: S16 AuthorityGraph — pure Decide/Validate (veto dominates) + content-addressed kernel.authority_graph table; read-only /authorities; verified-green
metadata:
  type: project
---

S16 lands the KRD §13.8 AuthorityGraph as Kernel substrate: `back/kernel/authority`.

- **Pure core:** `Decide(graph, truth, granted) → AdmissionDecision{admitted|blocked|escalated}` + `Validate(graph)`. Precedence (ADR 0016): veto dominates → no approver ⇒ blocked/MISSING_AUTHORITY_APPROVAL → all approvers ⇒ admitted → partial ⇒ escalated. Total + deterministic, no I/O. TruthKind delegates to `truthtyping` (single owner of the §13.4 enum — no second source).
- **Mirror:** fixture (`checkout-regulatory`, 4 named rows incl. the done case) pins the rule (authority=above); rapid property pins invariants (total/deterministic/no-admission-without-authority/veto-dominates/content-address tie-in, authority=below). Testcontainers proves round-trip + wall.
- **Wall:** migration `kernel_authority_graph_baseline.sql` — content-addressed append-only table, GRANT SELECT-only + REVOKE writes on `aidos_agent`; `TestAgentRoleSelectOnly` proves INSERT refused.
- **UI:** read-only `/authorities` (graph card + admission table running the pure TS projection `lib/authority.ts`, exact mirror of Go). **ui-completeness vacuous** — no truth-write op developed; truth-write/reauthorize via propose→ChangeSet (S20) is a by-design forward-dependency, NOT a residual issue. Same pattern as [[project-s14-truthtyping]] / S15.
- **Verified green:** go test ./... exit 0, vet/gofmt clean, tsc clean, vitest 10/10, Playwright 6/6 (port 3000), mint validate+broken-links clean, docs pushed (origin/main==local), Linear AID-7 Done.

Gotcha: WorkbenchHeader nav label lives under `nav.authorities` namespace, NOT `WorkbenchHeader.*` — checking the wrong namespace falsely flags a missing key. The e2e + tsc passing is the real signal.
