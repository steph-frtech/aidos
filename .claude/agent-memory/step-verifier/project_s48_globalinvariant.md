---
name: s48-globalinvariant
description: S48 GlobalInvariant — cross-cell invariant AST, red-wave fan-out + blast_radius→authority admission; verified-green
metadata:
  type: project
---

S48 GlobalInvariant (KRD §49.1) — a truth spanning >1 cell (distinct from per-truth S15 TruthScope).

- Pure Go `back/kernel/globalinvariant`: typed AST + `Validate` + `RedWave` + `Admit`. Reuses S02 records.Hash/Canonicalize (content-address), S16 authority.Decide (tier resolution, no fork), S19 propagation.FireParent (red-wave fan-out genuinely composes the weighted engine — load-bearing cross-cell links).
- Three FROZEN §49.1 enums: scope {local_cell, contract_pair, federation_policy}, blast_radius {small, bounded, global}, approval_required {cell_owner, both_contract_owners, architecture_owner}. Precedence DECLARED: global⇒architecture_owner, bounded⇒both_contract_owners, small⇒cell_owner.
- Migration kernel.global_invariant: content-addressed append-only, three CHECK enums on JSONB path, agent SELECT-only (REVOKE writes). Testcontainers proves round-trip + CHECK rejects out-of-enum + agent INSERT refused (the wall).
- Done criteria proven semantically (not count-only): RedWave(pii-forgettable-federation,'billing')={checkout,profile,billing} not just violator; Admit(cell_owner)=blocked/INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS + how_to_fix escalate_to_architecture_owner; Admit(architecture_owner)=admitted; single-cell federation rejected by Validate.
- TS twin lib/global-invariant.ts + fast-check 8/8. NOTE: TS admit() omits the Go `resolveAdmits` conjunct (only checks grantedRank>=requiredRank) — faithful for the 3 demo rows, boundary verdicts agree; not a blocker.
- Sensors all green: go test 7s (Testcontainers ran), vet, gofmt, tsc 0, vitest 8/8, Playwright 4/4 on :3000.
- i18n: all 30 globalInvariants keys + nav.globalInvariants in BOTH fr/en (cross-checked the scar).
- Docs: concept + internals (3 Couches: Implémentation/Méta/Méta-méta), docs.json registered, mint validate clean, pushed origin/main 99973c9.
- OpenQuestions (forward-deps, NOT residual): mirrors→S06, ChangeSet engine + /goal admission wiring→S20, RedWave drain into S22 RedWorkQueue later, no federation/stage-5 stability (S23/S47). Linear MCP unauthenticated (§11 OQ).
- Verdict: PASSED.
