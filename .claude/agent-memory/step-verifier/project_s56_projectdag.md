---
name: s56-projectdag
description: S56 per-project DAG version space — verifier notes (frontier, namespace, archive, cross-project merge wall)
metadata:
  type: project
---

S56 = app-builder EPIC 1 version-space side; the DAG twin of the S55 cross-project wall ([[s55-projectwall]]). back/archive/projectdag wraps S24 dag + S122 merge + S53 project.RootNode with a PURE frontier predicate SameProject(a,b)=a==b&&trim≠"" — never re-implements them (reuse-don't-reinvent).

THREE done-criteria all fixture-proven + rapid-property-proven:
- phase cut in A invisible from B's heads: TestFixture_PhaseInAInvisibleFromHeadsOfB — a project's DAG only ever holds its own nodes; Branch/Checkout/Rebranch refuse a foreign node with CROSS_PROJECT_NODE; namespaces project/<id>/ disjoint.
- duplicate forks ISOLATED root: TestFixture_DuplicateForksIsolatedRoot — Duplicate(src,dst)=Genesis(dst), disjoint genesisID (content-addressed on dst), shares no node, single head. Full template copy deferred to S81 (re-emit under new frontier via privileged writer) = OQ.
- archive masks without destroying (append-only): TestFixture_ArchiveMasksWithoutDestroying — Heads() nil when masked, HeadsIncludingMasked() keeps all, Restore() reverses exactly.
Plus roadmap refusal: Merge() returns CROSS_PROJECT_MERGE BEFORE engine when leftProjectID≠rightProjectID; same-project delegates to merge.MergeSemantic intact.

Sensors GREEN: gofmt/vet clean, go test projectdag+dag+merge+project ok, full go build ./... clean, MCP back/mcp/projectdag (8 pure tools) builds; front twin lib/projectDag.ts byte-faithful (Go SameProject==TS sameProject, same FR refusal text), vitest 8/8, tsc clean, biome 5 files clean; i18n 3328==3328 projectDag+nav.projectDag both locales; no hardcoded colors in panel; e2e 6/6 :3000 (all testids match panel: refusal-code/heads-count "heads: N · kept: M · masked"/merge-allow/dup-isolated/branch|merge|dup|archive|restore-button).

WALL held: actions.ts + ProjectDagPanel.tsx + MCP main.go grep-clean of insert/pgx/sql/kernel/mirrors/fitness — version-space verdict computed from authoritative twin; recording a node rides S24 dag MCP privileged writer. Determinism-first: pure decider, no LLM.

DOCS: concept + internals (3 layers Implémentation/Méta/Méta-méta) in .aidos-docs/steps/, registered docs.json, mint validate passed, pushed steph-frtech/docs main b2b5c77 (main==origin/main). Code commit 80afa40 on build/s00-s47.

SCAR: go build ./mcp/projectdag/ DROPS an 8.9MB ELF binary back/projectdag in the tree (default output name = package dir). It's untracked, never committed (executor removed the same trio pre-commit), but verifier's own build re-creates it — rm -f after building. Same pattern for projectscope/projectwall in prior steps.

OQ (by-design fwd-deps, non-blocking): Linear MCP unauthenticated (S56 issue not movable); persistence rides S24 dag schema (no new S56 migration); full template instantiation=S81; project switcher=S57; live gateway=S58. verified-green, 0 corrections to code (only removed my own build artifact).
