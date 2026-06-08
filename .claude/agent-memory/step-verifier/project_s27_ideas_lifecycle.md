---
name: project-s27-ideas-lifecycle
description: S27 verification — Idea record + lifecycle, the only door into the kernel (promote only via mirror+goal); verified-green zero corrections
metadata:
  type: project
---

# S27 — Ideas lifecycle (verified-green, ZERO corrections)

**Done-crit all met:** idea transitions draft/grilled/spiking/harvested/rejected; promote ONLY via mirror+goal; illegal transitions blocked.

- Go `back/kernel/ideas`: `Idea{ID,Proposes,Intent,Provenance,Status,RejectReason}` — NO Version, NO Mirror field (unrepresentable by type = what makes it an idea not a truth, KRD §118). id=records.Hash(records.Canonicalize(body{proposes,intent,provenance})) REUSES S01/S02 — Status/RejectReason EXCLUDED from content address (lifecycle metadata, id stable across transitions). PURE/total Capture/Grill/Spike/Harvest/Reject + `Promote(idea,mirrorRef)→(*Promotion,*BlockReason)` gate: not-harvested OR empty mirror ⇒ NO_MIRROR_NO_KERNEL, idea stays harvested no mutation. Reject append-only/terminal. Proposes closed{control,policy,operation,action,entity,product} ProvenanceSource closed{human,incident}.
- Tests fresh -count=1 GREEN: ideas 11.470s (fixture 8 incl THE done-case row5 + illegal-transitions + harvest-direct-still-needs-mirror; rapid 2 LifecycleInvariants closed-status-set/no-version-mirror-key/id-stable/reject-append-only + Deterministic key-order-independent; Testcontainers migration_roundtrip_test.go) · promotion-gate 0.003s (fault-injection mirror-less→deny) · idea-intake mcp 6.319s. go build/vet/gofmt clean.
- Migration `ideas_lifecycle_baseline.sql` EXPAND-ONLY: ideas.idea table ALREADY in S02 kernel_records_baseline.sql (CREATE SCHEMA ideas + table) — S27 only ADDs status-CHECK closed-5 + WIDENS agent GRANT to INSERT/SELECT/UPDATE (staging ABOVE wall, an idea is candidate not truth) + REVOKE DELETE/TRUNCATE + RE-ASSERTS REVOKE writes on kernel.truth/layer/link + mirrors.mirror (wall unchanged). S02 baseline had agent SELECT-only on ideas.idea; S27 widening is by-spec (staging above wall).
- Hook promotion-gate: PURE Evaluate DEFERS to ideas.Promote (no re-implement), non-kernel target=allow, decode-error fail-closed=deny. INJECTED mirror_ref signal (does NOT reach mirrors schema = circularity ban). exit 0 allow / 2 deny.
- MCP idea-intake: capture/grill/spike/harvest/reject/status/list — NO idea_promote_to_kernel bypass tool (promotion=/goal). NOTE convert_to_markdown tool present = later MK03 step (captures idea draft, not S27, not a bypass).
- Front: lib/ideas.ts twin (5 statuses, gestures, promote gate, NO_MIRROR_NO_KERNEL FR prose) READ-ONLY no-truth-write; lib/ideas-data.ts SEED (NOT in report files_changed but PRESENT+load-bearing — e2e anchors) ids idea-{draft,grilled,spiking,harvested,rejected}-1 match e2e. IdeasPanel.tsx static testids ideas-panel/promote-no-mirror/promote-with-mirror/promotion-blocked/block-code/stays-harvested/promotion-promoted/provenance-link + dynamic idea-card-${id}/status-/no-mirror-/reject-reason-/lane-. vitest 8/8 tsc clean biome clean. e2e 5/5 GREEN live 6.0s (controls execute: blocked NO_MIRROR_NO_KERNEL + promoted+provenance-link).
- nav WorkbenchHeader:80 /ideas. i18n 3441==3441 ideas 29==29.
- Docs: concept+internals 3 layers (Implémentation/Méta/Méta-méta) docs.json:123-124 mint-validate PASS, pushed commit a1c5afb 0-ahead/0-behind tree-clean.
- OQ by-design (NOT residual): no kernel write/freeze wired (/goal mutation = later step); no MemoryFirewall/ContextPack §119.1 (later Archive/brain); promotion-gate injected has-mirror predicate (not reading mirrors schema = circularity ban); Linear S27 unflippable (linear-server MCP OAuth unauthenticated non-interactive).
- verified-green ZERO corrections.
