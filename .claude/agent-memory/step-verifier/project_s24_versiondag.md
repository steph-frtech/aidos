---
name: project-s24-versiondag
description: S24 version DAG — pure append-only Branch/CheckoutAncestor/Rebranch over phase nodes + changeset edges; content-addressed dag.node/dag.edge; action-capable /version-dag; verified-green
metadata:
  type: project
---

S24 makes the version space a DAG, not a line (KRD §120–§125).

- **Core** `back/archive/dag/dag.go`: pure, total, deterministic `Branch` / `CheckoutAncestor` / `Rebranch` + helpers `Heads/Ancestors/IsReachable/Node/NodeID`. NODES = stable phases (S23, content-addressed via S01/S02 `records.Canonicalize`+`Hash`, never forked), EDGES = ChangeSets (S20 `changesets.changeset.id`, referenced never copied). Append-only with a mutable `head`; checkout = head-flag move via `forwardReachable`, abandoned line stays (§123 stepping stone). Stratum above|below (§124).
- **Mirrors**: fixture (semantic asserts — parentage, head move, parallel heads §125, reachability, content-address) + rapid property (monotone growth, no-cycle, head-flag-move, rebranch-parents-on-ancestor, id==hash). 14 Go tests incl. Testcontainers (content-address CHECK, FK, expand-only, agent SELECT-only/writer INSERT+UPDATE(head)-no-DELETE). MCP `back/mcp/dag` round-trip + fault-injection (UnknownPhase refused, persists nothing).
- **Wall**: package returns DAG values; `store.go` writes through `aidos` writer DSN via the dag MCP (single door). Migration `dag_node_edge_baseline.sql`: agent REVOKE all writes, writer INSERT + UPDATE(head) only, no DELETE. Note: writer-role DELETE refusal in the container relies on the FK (login role owns tables) — honest caveat in the test; GRANT-based REVOKE is the production wall.
- **UI**: `/version-dag` action-capable — branch/checkout/rebranch/reset execute from screen via `lib/version-dag.ts` twin (fast-check mirror); read-only against truth (local state). Nav registered, i18n `versionDag.*` + `nav.versionDag` present in fr+en.
- **Docs**: concept + internals (3 layers) registered in docs.json, `mint validate` clean, pushed 28b192a.
- **Linear**: AID-5 = S24 (offset scheme — search by title, not number) → Done.
- OpenQuestions (not residual): mirrors-schema persistence back-filled S06; semantic merge §122 = S25; QD/evolution promotion §123/§124 later.

Verified-green pattern (see [[project_s23_phasestable]]). i18n keys checked both locales per [[feedback_i18n_keys_missing]].
