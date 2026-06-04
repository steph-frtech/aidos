---
name: ba07-capacityaxis
description: BA07 — capacity-axis enforcer ToolAllowed (allow-list sibling of S04/S52 zone-axis MayWrite); pure set-membership, default-deny, AGENT_TOOL_NOT_BOUND
metadata:
  type: project
---

BA07 adds the CAPACITY axis of the wall to the governed build-agent (back/runtime/agentimpl/enforce.go).

- `ToolAllowed(impl, server, tool) -> ToolDecision{Allowed, *BlockReason}`: pure total fail-closed set-membership over `impl.Tools` (the Enabled MCP bindings BA05 resolved). Allowed IFF (server,tool) bound; else default-deny with NEW S13 `AGENT_TOOL_NOT_BOUND`. Same verdict SHAPE as agentlayer.MayWrite (the zone axis) — the two axes are siblings: zone = deny-list above waterline, capacity = allow-list of granted tools.
- New blockreason code `CodeAgentToolNotBound` added additively (const + reasons entry + codeOrder) — auto-validated by the enum-driven property mirror via Codes().
- TS twin `toolAllowed` + `ToolDecision` + `AGENT_TOOL_NOT_BOUND_REASON` (verbatim FR explanation+howToFix matching Go) in front/web/lib/agentlayer.ts.
- /agents gains an action-capable cap-probe (testid `cap-probe-run`): enter (server,tool) → executes toolAllowed → renders allowed badge or AGENT_TOOL_NOT_BOUND BlockReason+how_to_fix. Below-the-line pure verdict, no truth-write — wall respected.
- e2e SEMANTIC (not count): idea-intake/submit_idea→allowed (enabled binding), changeset/apply_changeset→denied (DISABLED binding, proves resolveTools narrows enabled-only), evil/exfiltrate→default-deny.

Gotcha: front/web/lib/agentlayer.ts is classified `file: data` (binary) because of `String.fromCharCode(31)` ASCII-US seed separator (BA-series, line ~274) — plain line-mode `grep` SILENTLY returns nothing on it. Use `grep -a` (or rely on tsc/vitest) when checking this file; do NOT conclude a symbol is missing from a bare grep miss.

Verified-green: Go build/vet/gofmt clean, rapid 5 props + blockreason green, 19/19 runtime pkgs, vitest 52/52, tsc clean, e2e 25/25, i18n 9 capProbe keys in BOTH fr/en, mint validate clean, both .aidos-docs pages live (200) + pushed origin/main 9a87ad3. Biome `isKnownModel` useOptionalChain warning is pre-existing BA05, untouched. OQ: BA13 verdict composition (fwd-dep), Linear MCP unauth (best-effort). PASS.
