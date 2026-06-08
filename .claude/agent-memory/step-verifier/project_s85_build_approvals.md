---
name: s85-build-approvals
description: S85 build-approvals — agent-proposed truth gated at the wall + human approval inbox; verified green after 1 nav-reachability correction
metadata:
  type: project
---

S85 = `back/runtime/buildloop/approval` seam, the build loop's ONLY legal path to a truth: GREEN turn over truth-implying goal → ProposeTruth (proposed, NEVER admitted, content-addressed) → per-project approval inbox WITH mirror → human holding scope authority admits (Decide reuses S63 authoritybinding.DecideProposal over S16 graph, re-derives admission from authority verdict NOT self-asserted status).

**Done-criteria (both PINNED + I ran them uncached):** (1) AGENT_WRITE_ABOVE_WATERLINE — RefuseDirectWrite projects agentlayer.MayWrite (S52/S04 wall); ProposeTruth has NO direct-write path. (2) proposed truth requires human approval — fixture TestProposedTruthRequiresHumanApproval: viewer→INSUFFICIENT_AUTHORITY stays proposed, owner ADMITS, forged `admitted` re-derived away (Decide never trusts input status), placeholder actor "agent"→PLACEHOLDER_ACTOR (it's in authoritybinding closed placeholder set). Guards: NOT_A_TRUTH_WRITE (below-line target not wrapped as fake proposal), MISSING_MIRROR (no monster). 5 property tests (determinism/never-admits/direct-write-always-refused/below-waterline-not-proposal/admission-re-derived/inbox-faithful-isolated).

**Reuse verified real:** agentlayer.MayWrite (wall.go:33), authoritybinding.DecideProposal (:241), RealActor/ProposalDecision/AuthorityRoleBinding types, authority.DecisionAdmitted const (authority.go:96), records.Hash content-address. proposalBody EXCLUDES status from hash (admitted hashes==proposed → admission is transition over same id). MCP build-approval: 3 PURE tools (approval_propose/decide/inbox), NO SQL, NO truth-write tool, write-NOTHING. actions.ts wall-clean (no kernel/mirrors/INSERT). Front lib twin vitest 7/7, two ops bound (proposeTruthAction+approveProposalAction), all e2e testids resolve in panel.

**ONE CORRECTION (recurring nav-reachability — SAME as S84):** `/build-approvals` route MISSING from WorkbenchHeader nav list `{href,k}[]` (after /self-cert :145) AND `nav.buildApprovals` i18n key missing in fr+en → route unreachable from any screen = ui-completeness gap. Fixed: added `{ href: "/build-approvals", k: "buildApprovals" }` + nav.buildApprovals fr="Approbations de build"/en="Build approvals". i18n 4153→4154 parity held.

**Verification:** go test -count=1 approval+mcp ok, build/vet/gofmt clean. tsc clean (only pre-existing behavior-capture S67 filtered). biome: 1 PRE-EXISTING suppression warning in WorkbenchHeader (a11y backdrop comment, predates S85, NOT my edit). Full front vitest 1214/1214 (prior-green intact). e2e 3/3 live :3000 (viewer-cannot-admit/owner-admits, NOT_A_TRUTH_WRITE, MISSING_MIRROR). mint validate PASS. docs 3-layer Implémentation:9/Méta:45/Méta-méta:51, docs.json:239-240, HEAD==origin/main 437d521 clean tree. wall-grep CLEAN.

**OQ (by-design, do not block):** Linear-unauth (no OAuth this session); /goal apply wiring of admission = changeset-engine track (same OQ as S52, proposal is value object, kernel write stays aidos CLI); mirrors-schema persistence back-fills at S06 (bootstrap exception, materialized as file+executable test); Mintlify semantic index async-refresh lag. Verified-green AFTER 1 nav correction.
