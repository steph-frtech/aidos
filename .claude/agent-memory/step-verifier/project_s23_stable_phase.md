---
name: s23-stable-phase
description: S23 dag.stable_phase coherent-cut decision — pure IsStable, content-addressed DAG node, wall + mirror verified green
metadata:
  type: project
---

S23 — the stable phase (KRD §43/§44 the coherent cut / kernel LOCKFILE). PURE `IsStable(cut, heads, ls, sensors) → StablePhase`: REUSES S17 `links.Resolve` (a non-green link = red, named "from@v->to@v (stale|absent)") + S07 SensorStatus.Pass (red sensor named by id); EMPTY cut = VACUOUSLY STABLE base case; ANY single red mirror flips UNSTABLE; reasons sorted, empty IFF stable (both ways); content-addressed via S02 records.NewRecord (id==version==Hash(Canonicalize(body)), body={cut,sensor_status,stable,reasons}). Total/det/no-panic.

DONE-CRIT all met: (1) coherent-only — IsStable stable only when all links green + all sensors green; recording the node is the `aidos` writer role via ChangeSet (S20 commit-gate), `aidos stable` itself READ-ONLY/computes; (2) content-addressed DAG node — Record()/Version() reuse S02, migration CHECK version=id; (3) proven by mirror.

Migration dag_stable_phase_baseline.sql EXPAND-ONLY/append-only: NEW dag.stable_phase (id PK, body jsonb, version, parent=§44 DAG edge NULL=root, created_at) + parent idx; S02 dag.phase UNTOUCHED; wall — agent GRANT SELECT only REVOKE INSERT/UPDATE/DELETE/TRUNCATE, aidos writer GRANT SELECT,INSERT only (UPDATE/DELETE withheld = immutable append-only).

VERIFIED GREEN: go test archive/phases 11.7s (fixture 5 + RecordedPhaseIdIsContentHash + EmptyPhaseRecord + rapid 6: determinism/empty-always-stable/stable-iff-allGreen/any-red-unstable/reasons-iff-unstable/never-panics + Testcontainers 5: ContentAddressCheck/ParentEdgeAppendOnly/ExpandOnly/AgentRoleSelectOnly permission-denied/WriterRoleCanInsert) + cmd/aidos 0.022s; gofmt/vet clean. Front lib/phase-stable.ts byte-twin (resolve+isStable+linkViews) + lib/phase-stable-data.ts CUT_CASES (NOTE: this data file NOT in report files_changed list but present + load-bearing for panel+e2e) vitest 10/10 fast-check, tsc rc0, biome clean 5 files. PhaseStablePanel READ-ONLY action-capable (pick cut→evaluate, NO truth-write), page builds cutNames from flat keys. e2e phase-stable.spec 3 (empty=STABLE base / red-sensor=UNSTABLE names createOrder.fixture / stale-link=UNSTABLE names createOrder@v2) — option-label match by needle regex /empty|vide/, /red.?sensor|senseur rouge/, /stale.?link|lien périmé/ all match i18n values. nav phaseStable both locales; i18n phaseStable 31==31 parity. docs concept+internals 3 layers (Implémentation/Méta/Méta-méta) docs.json:115-116 mint validate PASS, .aidos-docs clean at FKE pushed.

OQ by-design: OQ-S23-1 live-store cut feed (current cut+heads+links+sensor-results) owned by S02/S24/S07 — `aidos stable` reads a deterministic canonical-cut catalogue NOW (same cuts as fixture), swap later = consistent with aidos impact; actual node-record-into-DAG = S20 ChangeSet commit-gate; no §43 federation/fractal aggregate, no branch/merge/revert (later Archive); Linear MCP unauth (authenticate-only). verified-green ZERO corrections.
