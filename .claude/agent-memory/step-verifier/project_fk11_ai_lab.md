---
name: fk11-ai-lab
description: §FK11 (after FK10, FKE-38) the AI Lab trialogue cockpit /ai-lab — PURE composition of FK09 conscience, write-NOTHING; verified-green after 1 RECURRING gofmt fix
metadata:
  type: project
---

§FK11 (ROADMAP-fke FKE-38, after FK10) the AI LAB COCKPIT — the trialogue screen /ai-lab as PURE deterministic core back/runtime/ailab write-NOTHING. COMPOSES the EXISTING FK09 conscience report; AUTHORS none.

**THE TRIALOGUE (3 panes, 1 zoomable screen, 2 modes conversational/navigational=zoom-hint never a different truth):**
- GAUCHE chat: ProposeSlot(node,message)→SlotResult amber status="proposed" content-addr id="SLOT-"+records.Hash[:8] NEVER a truth; IsTruthWriteRequest CLOSED truthWriteMarkers (écris la vérité/write the kernel/freeze/gèle/modifie le miroir…) → WallRefusal code AI_LAB_DIRECT_TRUTH_WRITE 3 how_to_fix (idea→mirror→/goal). NO LLM — declared marker matcher.
- CENTRE navigable: PairTier(source) draws WALL by judge: aboveTheLineSources CLOSED{runner,completeness,facet,semantic_diff}=TierAbove propose-only; else (sensor/reality/ledger)=TierBelow read-only. VoyantFor verdict green→green/advisory→amber/else red. PairKey=facet:pair:source. BuildCockpit→CockpitState cells sorted-by-key + redWave + blast + gate, ReadOnly iff tier==below.
- DROITE: ApplyCardValidation(report,cardID,option): belowWallOptions CLOSED{fix_below_wall}→flip addressed red pair→green, rebuild verdicts from report.Pairs, conscience.Reconcile RE-RECONCILES (FK09 aggregator recomputes verdict+cards); any above-wall option (change_above_wall…)→OpenedGoal=true Applied=false report UNCHANGED (no truth written). ScopeForPair(report,key)→PairScope left chat facet+pair + right cardIDs sorted addressing the pair.

**DETERMINISM-FIRST §6/§8:** every fn PURE+TOTAL no DB/clock/rng/IO/LLM, gaps are FK09 SemanticDiff/blast never "LLM diff agent". Property mirror ailab_property_test.go: BuildCockpit/ScopeForPair deterministic, ProposeSlot content-addressed (rapid), wall-drawn-both-sides+below-read-only, chat-truth-write-refused, fix_below_wall flips pair, above-wall opens goal report-unchanged.

**WALL grep CLEAN** (only doc-comment hits). MCP aidos-ai-lab (back/mcp/ai-lab, ADR0009) 4 PURE write-nothing tools build_cockpit/propose_slot/scope_pair/validate_card stdio, toInput mirrors conscience MCP, gateFor(level) clamps 0..8 CanPromote=false (promotion proof is FK10's fn).

**TS twin** front/web/lib/ai-lab.ts Go-authoritative; slot id hashStr FNV-1a-32 DISPLAY-ONLY divergence (Go records.Hash SHA-256, each internally deterministic — same FK09 card-ID pattern). Reuses lib/conscience reconcile + lib/facetwire Facet. ABOVE_THE_LINE_KINDS/SOURCES declared. wallTier(kind) separate from pairTier(source). Carries OWN reproducibility property. vitest 13/13.

**Verification (verified-green AFTER 1 correction):**
- 1 RECURRING gofmt fix in ailab.go (SAME S104/S109/S112/S116/FK09 scar): struct-tag column-alignment on CardValidation/PairScope/PromotionGate/CockpitState continuation lines + `records.Hash([]byte(a+"|"+b))` spacing. Executor's go test was CACHED so missed it. gofmt -w fixed → CLEAN. vet clean, go test -count=2 -rapid.checks=2000 0.028s, broad-build exit0, prior-green conscience/facetwire/autonomy + kernel/... intact.
- conscience types: SourcedVerdict.Verdict=Verdict(string)/Drift=DriftKind/Blast=BlastRadius — ailab literals use string-typed values (untyped const assignable, compiles). CockpitState reads report.Green/Red (exist); Amber computed locally from cells.
- routeOptions (lib/conscience): semantic/contract drift→options{fix_below_wall,change_above_wall,ask_user_decision} so runner-drift card carries BOTH options the e2e clicks.
- front: tsc clean (only PRE-EXISTING behavior-capture.test:101 'Kind' S64-S77 filtered), biome 6 files clean, vitest 13/13.
- i18n FULL structural key parity (fr-only=[] en-only=[]), aiLab namespace 36==36, aiLabNav both, nav WorkbenchHeader:208. (fr/en char counts differ 534791 vs 459702 = French prose length, NOT missing keys.)
- next build ƒ /ai-lab compiled. Playwright 8/8 GREEN live:3000 6.0s: route-controls / 3-panes+determinism-badge / chat→amber-slot / truth-write-REFUSED(code+no-slot) / validate-card flips 🔴→🟢 verdict drift→aligned / above-wall opens /goal stays drift / click-pair scopes left(chat-facet=F)+right / below-wall read-only.
- docs 3-layer Impl:9/Méta:27/Méta-méta:35 concept+internals fk11-ai-lab.mdx docs.json:475-476 mint validate PASS, .aidos-docs HEAD d256221==origin/main clean.
- Cleaned 2 stray uncommitted ELF binaries (back/ai-lab, back/relation-emitter — build cruft from `go build` to repo root, not tracked).

**OQ by-design (NOT residual):** Linear MCP unauth (only authenticate tool surfaced, issue-CRUD absent — needs OAuth+restart to flip FK11→Done) / Mintlify reindex-lag asynchronous (push succeeded, mint clean) / live decision-card recommendation badge styling unrelated.
