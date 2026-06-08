---
name: s30-memory-firewall
description: S30 MemoryFirewall verification — the /brain gate that forbids Memory→Kernel except via the mandatory flow
metadata:
  type: project
---

S30 MemoryFirewall (KRD §119.1) — verified GREEN, ZERO corrections.

Done-criteria all met: memory reaches kernel ONLY via Memory→ContextPack→Idea→Mirror→Goal→Kernel; direct Memory→Kernel ALWAYS blocked with MEMORY_CANNOT_DECLARE_TRUTH; fault-injection proves the firewall fires.

**Go pkg** `back/archive/brain/firewall/firewall.go`: MemoryItem (content/provenance/validity_scope/expires_at/confidence/taint, branch-aware) — NO Version, NO Mirror field (unrepresentable = what makes it fuel not truth). Closed Taint enum 5 {unverified,stale,user_claim,incident_derived,external_source}. id=records.Hash(Canonicalize) REUSE S01/S02, canonicalBody Kind="memory_item" EXCLUDES id, has no version/mirror key. PURE total funcs: Capture / Propose(taint travels forward never drops) / ToKernel(ALWAYS returns BlockReason regardless confidence/taint — no trusted-memory bypass) / ViaIdea(→ideas.Idea DRAFT, Provenance.Detail="memory:<id>", WroteKernel ALWAYS false, REUSE S27 ideas.Hashed) / CheckKernelWrite(provenance decider: ProvenanceMirroredIdea→nil pass, memory|unknown→BLOCK fail-closed). Writes NOTHING (returns values).

**Hook** `back/hooks/memory-firewall/main.go`: PreToolUse, DEFERS to firewall.CheckKernelWrite (determinism-first), reads INJECTED provenance from event (never reads kernel schema). TargetSchema!="kernel"→allow; garbage/decode-err→fail-closed block exit2. main_test.go 5 fault-inj GREEN: memory-prov BLOCKED / mirrored-idea ALLOWED / unknown fail-closed / non-kernel allowed / garbage fail-closed.

**Mirrors**: firewall_fixture_test.go 4 rows (capture-is-fuel-not-truth body has no version/mirror key / propose-taint-travels / ToKernel-Blocked-THE-done-case / ViaIdea-handed-to-S27). firewall_property_test.go 6 rapid (ToKernel always-blocked ∀ / clean-confident-still-blocked / content-addressed-no-version-no-mirror / propose-taint-never-drops / viaIdea-draft-no-kernel-write / deterministic). go test -count=1 fresh GREEN firewall 0.020s + hook 0.003s, build/vet/gofmt clean.

**Migration** `brain_memory_item_baseline.sql` EXPAND-ONLY: NEW brain schema + brain.memory_item content-addressed append-only (id PK, body jsonb, branch, created_at). 3 CHECK: kind='memory_item' / no-mirror-no-version (defense-in-depth NOT(body?'mirror')AND NOT(body?'version')) / branch-agrees. GRANT SELECT,INSERT on brain.* (BELOW waterline — fuel readable+appendable) REVOKE UPDATE/DELETE/TRUNCATE (append-only); re-asserts REVOKE writes+CREATE on kernel/mirrors/fitness (the row-level asymmetry IS the firewall: writable fuel that can never become truth). blockreason CodeMemoryCannotDeclareTruth wired (11th code at impl time) blocking severity, 4-step how_to_fix names full flow (no prison).

**Front** READ-ONLY twin: lib/firewall.ts byte-twin (Taint/MemoryItem/propose/toKernel always-blocks/viaIdea/FLOW_STAGES 6 + MEMORY_CANNOT_DECLARE_TRUTH FR) + firewall-data.ts STALE_DISCOUNT_CLAIM seed + firewall.test.ts fast-check 4 (vitest 4/4 GREEN, runs at lib/firewall.test.ts path NOT app/ — obs1776 glob concern resolved). MemoryFirewallPanel.tsx binds 4 controls to pure twins (capture/propose/toKernel/viaIdea) — ui-completeness HOLDS, no truth write. page.tsx Server Component. e2e tests/e2e/memory-firewall.spec.ts 5 scenarios, testids match panel exactly (flow-stage×6/kernel-shortcut/memory-card/block-reason data-code/no-kernel-write/how-to-fix/via-idea-result/ideas-link→/ideas). tsc clean, biome clean 5 files. nav WorkbenchHeader:43. i18n memoryFirewall 34==34, total 3441==3441.

**Docs** concept + internals (3 layers Implémentation/Méta/Méta-méta) registered docs.json:129-130, mint validate PASS, .aidos-docs 0-ahead origin/main (pushed). All S30 files committed d01e396, clean working tree.

**NOTE/minor report discrepancy (NOT blocking):** report's outputs claimed a Testcontainers roundtrip in the migration — NO such brain.memory_item roundtrip/permission-denied test exists on disk. Done-criteria are firewall BEHAVIOUR (proven by firewall pkg + hook fault-inj), so absence does not break this step. brain.* persistence/Testcontainers substrate rides S31 (pgvector extends brain). Recorded as OQ.

OQ by-design: no ContextRouter/ContextPack compilation §119.3=S31 / no ContextGraphDecision+Decision-Reuse-Test §119.2=S32 / actual kernel write+freeze = aidos CLI via /goal not this pkg / MemoryFirewall predicate is INJECTED provenance-is-memory (does not read kernel schema by design) / no brain.* permission-denied Testcontainers (substrate=S31) / Linear-unauth. verified-green ZERO corrections.
