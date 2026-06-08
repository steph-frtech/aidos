---
name: s24-version-dag
description: S24 Version DAG (branch/checkout-ancestor/rebranch) verification — PURE append-only DAG over content-addressed nodes + ChangeSet edges
metadata:
  type: project
---

S24 dag.go VERSION DAG §120-§125 (back/archive/dag): NODES=stable phases (S23 content-addr via S01/S02 records.Hash) EDGES=ChangeSets (S20 changesets.changeset.id) — RELATION over existing rows, never copies a body. THREE §121 moves all PURE/total/no-panic over in-memory DAG value (immutable, returns new DAG):
- Branch(d,from,label,cs)→EventBranched: new node parented on from inherits stratum; off-head→head MOVES (clearHead), off-inner-ancestor→TWO parallel heads §125
- CheckoutAncestor(d,ancestor)→EventHeadMoved: HEAD-FLAG MOVE only (forwardReachable descendants→head=false, ancestor→head=true), NOTHING deleted, independent parallel heads untouched
- Rebranch(d,ancestor,label,cs)→EventRebranched: new node parented on ancestor, clearHead=false (ancestor stays head/base)
Reads: Heads/Ancestors(cycle-safe visited)/IsReachable(irreflexive, no trivial self-reach)/Node. NodeID REUSES records.Canonicalize+Hash (never forked) over {kind:phase,parent_ids,stratum,label}. Stratum closed {above,below} §124 waterline. ErrUnknownPhase typed, refusal never mutates.

DONE-CRIT all met: branch+checkout-ancestor+rebranch over nodes(phases)+edges(changesets) + ancestry proven by mirror. fixture 5 (off-root head-moves-never-deletes / off-inner-ancestor parallel-heads / checkout backward-nothing-destroyed node-count-unchanged / rebranch abandoned-line-persists+reachable-from-root=THE done case / NodeID content-address deterministic) + rapid 3 (only-grows-no-cycle-≥1-head + checkout-is-head-flag-move + rebranch-parents-on-ancestor).

go test -count=1 ./archive/dag 16.099s GREEN incl Testcontainers migration_roundtrip: ContentAddressCheck/StratumEnum/EdgeReferencesExistingNodes-NoSelfLoop/ExpandOnly-PriorTablesUntouched/AgentRoleSelectOnly (SELECT ok, INSERT+UPDATE-head REFUSED permission-denied) / WriterRole INSERT+UPDATE(head)-allowed DELETE-edge-referenced-node REFUSED (FK protects lineage append-only). mcp/dag 5.065s GREEN 6 tools (dag_branch/checkout_ancestor/rebranch/heads/ancestors/get). cmd/aidos GREEN. gofmt/vet clean.

migration dag_node_edge_baseline.sql EXPAND-ONLY ADDITIVE: NEW dag.node (content-addr CHECK version=id, stratum enum CHECK, head MUTABLE col) + dag.edge (FK both endpoints→dag.node, no-self-loop CHECK, reuses S20 changeset id). S02 dag.phase + S23 dag.stable_phase UNTOUCHED. WALL: agent SELECT-only REVOKE INSERT/UPDATE/DELETE/TRUNCATE; writer aidos SELECT+INSERT + UPDATE(head)-only no DELETE.

front: lib/version-dag.ts faithful PURE port (branch/checkoutAncestor/rebranch/heads/ancestors/isReachable/forwardReachable, local readable digest id NOT Go hash=OQ-S24-1 by-design) vitest 4/4. lib/version-dag-data.ts SEED_DAG (trunk v0→v1→v2 above + w1 below §124, NOT in report files_changed but load-bearing). VersionDagPanel READ-ONLY action-capable: 4 executable controls (branch/checkout/rebranch/reset) run SAME pure moves, two waterline bands, head highlighted+abandoned dimmed, all e2e testids present (node-*, band-above/below, last-event, heads, action-*, data-head/live/stratum). tsc rc=0 biome clean. e2e version-dag.spec.ts 5 incl done-criterion (rebranch abandoned-line-stays). nav:116 registered. i18n 3441==3441 versionDag 26==26.

docs: concept+internals 3 layers (Implémentation/Méta/Méta-méta) docs.json:117-118 mint validate PASS, committed 28b192a 0-ahead-of-origin (pushed).

NOTE: S53 later touched dag.go (added project.RootNode + Nodes() filter for heads per claude-mem obs 4843) — does not affect S24 done-crit, tests green.

OQ by-design: OQ-S24-1 front local-id vs Go content-hash surfaced via dag_get-when-wired / no semantic-merge §122=S25 / no mirror-gated promotion §124 / no QD sampling §123 / no red-wave-/goal firing / no codegen-from-DAG / Linear-unauth (issue already Done in original build run reaching S53+). verified-green ZERO corrections.
