---
name: el03-besoingraph
description: EL03 BesoinGraph record — ordered/append-only/content-addressed need graph above the wall, double-absence (no Version/Mirror), Go+TS twin hash parity
metadata:
  type: project
---

EL03 = the [[el02-grammar]] grammar's RECORD: `back/runtime/besoin/graph.go` BesoinGraph{Project,Nodes[],Edges[]} — ordered (sorted by §23 levelRank, bands last), append-only, content-addressed via records.Hash(Canonicalize(graph)) REUSED never forked. LevelNode{Level,Body json.RawMessage,Refs[],Provenance,Status,OpenQuestions[]}; closed NodeStatus(empty/drafting/resolved) + EdgeKind(constrains/seeds). THE DOUBLE ABSENCE: struct carries NO Version, NO Mirror field by construction (like ideas.Idea) — the wall encodes "need above the line, not a truth"; a rapid property walks all canonical keys + substring-checks `"version"`/`"mirror"` absent. AddNode/AddEdge value-semantics (clone, non-destructive §9), dup level refused (ErrDuplicateNode → ChangeSet EL08), out-of-grammar/unknown-status HARD refused.

Wall STRUCTURAL: graph.go imports only encoding/json, fmt, sort, kernel/records — no INSERT/UPDATE/pgx/mirrors/fitness path. Determinism-first: pure total fns, no clock/rng/LLM; verdicts COMPUTED by the twin not declared.

Mirrors: Go rapid graph_property_test.go GREEN (order-indep, key-order-indep, round-trip byte-lossless+hash-stable, distinct-projects-disjoint, same-answers-same-hash, NO version/mirror key recursive walk, non-destructive+guarded, edges deduped, closed sets x50). TS twin lib/besoin-graph.ts byte-faithful (omitempty honoured, canonicalEncode sorts keys recursively) + vitest/fast-check 9/9. CROSS-PLANE PARITY VERIFIED by me: single product node (no ref) → Go and TS BOTH hash 86d7824bd53e17ed9c12a4aef30edd002908c32f7aec822f1dd2fac2426cd3d3 (independently recomputed, not trusted from report).

Action-capable /compound-besoin-graph (nav after besoinGrammar): 5 controls (add-node/compute-hash/reorder/compare/clear) all execute the twin (ui-completeness), double-absence panel renders canonicalize(graph). 33 i18n keys fr==en, nav both. e2e besoin-graph.spec.ts 3/3 on :3000.

SCAR (recurring, see [[feedback-biome-clean-report-lie]]): report said "biome clean" but biome had 1 warning — unused `g` in test reconstruct() helper (dead code, leftover from refactor). Fixed by deleting the line. gofmt/vet/tsc clean as reported. docs a96743c HEAD==origin/main 3 layers mint validate passed. Linear unauth=OQ. verified-green.

Forward-deps (OQ, non-blocking): ProjectScope/RLS S53/S55 (modelled as plain Project key — distinct project → distinct hash deterministically); besoin Postgres schema persistence EL15 (pkg PURE, JSONB round-trip proven in-memory).
