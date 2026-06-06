---
name: el04-metadata
description: EL04 attaches the 4 per-truth metadata to each besoin LevelNode reusing 3 kernel pkgs, one enum source, /spike routing, determinism mirror — verified green
metadata:
  type: project
---

EL04 (compound-du-besoin track) — CertifyMetadata(node, meta)→MetadataVerdict in back/runtime/besoin/metadata.go: attaches the FOUR per-truth metadata (truth_kind, verifiability, scope, authority) to each LevelNode by REUSING the three distinct kernel packages truthtyping/scope/authority (never forked).

- SINGLE ENUM SOURCE: truth_kind canonical = truthtyping.TruthKind; authority.IsKnownTruthKind delegates to truthtyping.IsKnownKind; pinned by rapid TestTruthKind_SingleEnumSource + TS twin truthKindIsCoherent(canonical). 7 kinds, 5 verifiability levels.
- Four red fixtures (one per missing/unknown metadata) go GREEN: missing/unknown truth_kind, missing/unknown verifiability, missing/malformed scope (scope.Validate + active-truth rule, active node not-global ⇒ missing-scope), regulatory-without-legal-authority REUSES authority.Decide's DecisionBlocked done case.
- authority REQUIRED only for KindRegulatory (kindNeedsAuthority declared set, never learned); other kinds annex authority later via /goal — by-design, not omission.
- /spike routing: unverifiable ⇒ truthtyping.Classify ⇒ ZoneSpike, RouteToSpike=true, SAME verdict the kernel classifier produces; advisory only (idea_capture→idea_grill→idea_spike), no direct capture in spiking.
- WALL holds STRUCTURAL: metadata.go imports only fmt + the 3 read-only kernel pkgs; no pgx/INSERT/UPDATE/sql. LevelNode has NO Version/NO Mirror (the EL03 double-absence preserved). JSONB persistence into besoin schema = EL15 (FwdDep OQ).
- determinism-first: CertifyMetadata pure total; reproducibility mirror TestCertifyMetadata_Reproducible (Go rapid) + fast-check twin. MetaCode is EL04-LOCAL kebab enum (NOT a member of frozen runtime/blockreason.Code — §9 respected).
- TS twin lib/besoin-metadata.ts byte-faithful; vitest/fast-check 14/14. NOTE minor twin divergence: Go calls scope.Validate (all dimensions) for active nodes; TS only region-validates when !global && !empty — every TESTED case agrees, not a blocking gap (full multi-dim scope = S15's concern).
- action-capable /compound-besoin-metadata: 3 controls (Certifier / Prouver source unique d'enum / Reset), 5 selects, nav under 'brain' group after besoinGraph; i18n 2718==2718 FR/EN (+32 keys/locale from EL03 baseline 2686), all t() keys present both locales; e2e besoin-metadata.spec.ts 4/4 on :3000.
- SCAR check: report claimed "biome clean" — biome on the 5 changed front files surfaced 1 warning at WorkbenchHeader.tsx:261 (suppression-no-effect on a11y/useKeyWithClickEvents) but git-blame shows it is PRE-EXISTING (commit 295112e nav-drawer, NOT EL04 — EL04's only WorkbenchHeader change was a 1-line nav entry). Not an EL04-introduced gap, left as-is. gofmt/vet/tsc clean.
- docs d792eac HEAD==origin/main, both pages registered docs.json, 3 layers in internals, mint validate passed.
- FwdDep OQ: besoin-schema JSONB persistence (EL15), full classify-truth orchestration in forced interview (EL13). Linear unauth=OQ.
- verified-green
