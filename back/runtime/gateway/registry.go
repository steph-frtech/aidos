package gateway

// DefaultRegistry is the CLOSED, content-addressable set of MCP tools the S58 gateway
// exposes over HTTP — EVERY tool of the 15 existing AIDOS MCP servers the roadmap
// names (store · mirror-runner · changeset · dag · idea-intake · memory · context ·
// evolve · backtester · telemetry-reader · pact-verifier · mutation-runner · project ·
// provision — the 14th ACTIVATED at DP13: the stack/bootstrap/profile tools — ·
// reality-ingest — the 15th REGISTERED at ADR 0081: the prod→kernel on-ramp the gateway
// must front so `/learn` has its door, never a dormant capability),
// PLUS the explicitly-fenced truth-zone write namespace (CLAUDE.md §2).
//
// THE WALL, ENCODED AS DATA (server-side). All 15 servers' real tools are BELOW THE
// LINE — they read/op the archive·brain·context·ideas·changesets·dag·besoin schemas
// the agent role MAY touch (the changeset_* tools ARE the legal ChangeSet door, the
// only path truth moves: they stay below-line because they propose/stage/apply through
// the gate, never a raw kernel write; the provision stack.* tools re-emit/project over
// the StackManifest AST + the observed host state, never a kernel write; the
// reality-ingest tools detect a prod divergence and project it into a DRAFT idea, never
// a kernel write — WroteKernel is always false). None of the 15 holds a GRANT to write
// kernel/mirrors/fitness — that is the wall by construction.
//
// The truth-zone WRITE namespace (kernel_write · mirror_write · fitness_write ·
// stack.engrave_manifest) is NOT a real tool of any server — it is the door a naïve or
// hostile caller might craft to move truth directly (the last is the DP13 provisioning
// twin: a StackManifest is above-the-line truth). The gateway registers these names
// with DispositionTruthWrite so that such a call is REFUSED with an actionable
// BlockReason (use a ChangeSet), rather than silently 404'd — the server-side wall is
// explicit, not incidental.
//
// DETERMINISM (CLAUDE.md §6): DefaultRegistry is a pure constant builder — same call,
// byte-identical registry (the reproducibility mirror pins it).
func DefaultRegistry() *Registry {
	return NewRegistry(DefaultTools())
}

// DefaultTools enumerates every exposed tool with its owning server and disposition.
// Ordered by server then tool for a stable, reviewable surface. Pure.
func DefaultTools() []Tool {
	below := func(server string, names ...string) []Tool {
		out := make([]Tool, 0, len(names))
		for _, n := range names {
			out = append(out, Tool{Name: n, Server: server, Disposition: DispositionBelowLine})
		}
		return out
	}
	var t []Tool
	// 1. store — content-addressed append-only store (below the line; writes flow
	// through the store door, never the kernel).
	t = append(t, below("store", "store_put", "store_get", "store_set_head", "store_get_head", "store_history")...)
	// 2. mirror-runner — replay a mirror / check the ratchet (read-only certification).
	t = append(t, below("mirror-runner", "mirror_replay", "ratchet_check")...)
	// 3. changeset — the ONE legal door truth moves through (stage/apply/revert via the
	// commit gate). Below-line: it proposes a transition, the gate decides.
	t = append(t, below("changeset", "changeset_open", "changeset_apply", "changeset_revert", "changeset_discard", "changeset_status", "changeset_list")...)
	// 4. dag — stable-phase/branch graph (branch·checkout·rebranch·heads·ancestors·get).
	t = append(t, below("dag", "dag_branch", "dag_checkout_ancestor", "dag_rebranch", "dag_heads", "dag_ancestors", "dag_get")...)
	// 5. idea-intake — capture/triage candidate-truths (the `ideas` schema, below the
	// line; promotion to truth is /goal, not this server).
	t = append(t, below("idea-intake", "idea_capture", "idea_grill", "idea_spike", "idea_harvest", "idea_reject", "idea_status", "idea_list", "convert_to_markdown")...)
	// 6. memory — the brain (write/recall/get, the `brain` schema, below the line).
	t = append(t, below("memory", "memory_write", "memory_recall", "memory_get")...)
	// 7. context — compile a ContextPack / query the ContextGraph (derived, read).
	t = append(t, below("context", "context_compile", "context_pack_get", "context_graph_query")...)
	// 8. evolve — the medium loop in the EvolutionSandbox (proposes branches/ideas,
	// never the kernel; below the line by construction).
	t = append(t, below("evolve", "evolve_run", "evolve_confine", "evolve_propose_promotion", "evolve_run_get", "evolve_run_list")...)
	// 9. backtester — out-of-sample replay (read-only).
	t = append(t, below("backtester", "backtest_out_of_sample", "backtest_get")...)
	// 10. telemetry-reader — query telemetry + observe/learn incidents (the on-ramp to
	// an idea, below the line; the kernel write is /goal).
	t = append(t, below("telemetry-reader", "telemetry_query", "incident_observe", "incident_list", "incident_learn")...)
	// 11. pact-verifier — provider verification (read-only check).
	t = append(t, below("pact-verifier", "pact_verify")...)
	// 12. mutation-runner — run mutation testing / read the threshold (read-only).
	t = append(t, below("mutation-runner", "run_mutation", "read_threshold")...)
	// 13. project — the project lifecycle (create·list·get·archive·restore·delete,
	// the `projects` schema, below the line — an isolated DAG root, never kernel truth).
	t = append(t, below("project", "project_create", "project_list", "project_get", "project_archive", "project_restore", "project_delete", "project_duplicate", "project_branch", "project_rebranch", "project_checkout_ancestor", "project_merge_guard", "project_genesis")...)
	// 14. provision — the DP13 STACK / BOOTSTRAP / PROFILE tools + the S89 datastore
	// planner (ROADMAP-provisioning-deploy EPIC C, ADR 0009). All BELOW THE LINE: they
	// re-emit/project/resolve over the StackManifest AST (the SELECT-only kernel mirror)
	// + the observed host state, writing no truth. The `stack.engrave_manifest` door is
	// the fenced truth-write namespace below (refused with a ChangeSet-pointing reason).
	t = append(t, below("provision", "plan", "images", "stack.emit", "stack.select_profile", "stack.bootstrap", "stack.resolve_ports", "stack.print_urls")...)
	// 15. reality-ingest — the S106/E12 prod→kernel on-ramp (ADR 0081, issue A): detect a
	// deployed app's telemetry DIVERGENCE, ingest it as a project-scoped RealityMirror +
	// a DRAFT idea (template text, provenance=incident), or render that idea text. ALL
	// BELOW THE LINE: every tool is a PURE read whose WroteKernel is false; the only
	// outward edge is a DRAFT idea (idea → mirror → /goal → approval). Registering it
	// here makes `/learn`'s door reachable — the capability ceases to be dormant.
	t = append(t, below("reality-ingest", "detect_divergence", "ingest_divergence", "render_idea_text")...)
	// 16. why-tree — FK13 /why (the 5-whys redressed): build a content-addressed WhyTree
	// from a red symptom, serialize it to its kernel.link body, read the link-kind
	// discriminator. ALL BELOW THE LINE: three PURE graph-walks whose output is a VALUE
	// (a tree / a record / a discriminator); freezing the terminal mirror is /goal, never
	// these tools (WroteKernel always false — the wall).
	t = append(t, below("why-tree", "build", "serialize", "kinds")...)
	// 17. goal-piloting — S66 UI-piloted /goal: open a goal (a DRAFT ChangeSet PROPOSAL by
	// reference + the LIVE red set), the NON-GAMEABLE close gate, the live red-set worklist.
	// ALL BELOW THE LINE: pure computation that PROPOSES (the open returns the changeset by
	// id/status, never a raw kernel write); persistence rides the changeset door under
	// approval (the wall). No apply/close-stamp tool exists — closing stays the aidos role.
	t = append(t, below("goal-piloting", "goal_pilot_open", "goal_pilot_close", "goal_live_red_set")...)
	// 18. federation — S103/§51 cross-cell composition: run the canonical saga over two real
	// contracted cells, fan a global policy out to a RedWorkQueue per cell, evaluate a
	// temporal deadline across cells. ALL BELOW THE LINE: three PURE compositions returning
	// the per-cell waves as VALUES — the actual INSERT into runtime.red_work_queue is the
	// S22 hook's job below the waterline, never these tools (writes nothing — the wall).
	t = append(t, below("federation", "saga_over_cells", "fan_out", "temporal_over_cells")...)
	// 19. learn — S107/E12 /learn loop-closure: the hash bump an approved mirror causes on
	// its target, the targeted red wave it seeds, the full incident→wave loop. ALL BELOW THE
	// LINE: READ-ONLY on the kernel — every tool's WroteKernel is false; the loop never
	// authors the mirror (the human's /goal does) and the direct Reality→Kernel edge is
	// always refused (the wall). The dispatch-safe Target carries spec_body as an object
	// (the S59 RawMessage-scar guard lives in learnsrv).
	t = append(t, below("learn", "bump_hash", "targeted_wave", "close_loop")...)
	// 20. conscience — FK09 the conscience: reconcile the verdicts of the EXISTING judges
	// into a ConsciousnessReport, project the §FKE-31 decision cards. ALL BELOW THE LINE:
	// two PURE aggregations (AUCUN NOUVEAU JUGE) returning a projection as a VALUE — a
	// divergence card is a SIGNAL routed to idea → mirror → /goal, never a write (the wall).
	t = append(t, below("conscience", "reconcile", "decision_cards")...)
	// 21. arch-fitness — S102 structural ratchet: measure a cut's four lower-is-better
	// metrics, ratchet a candidate against a baseline, gate (measure∘ratchet) a candidate
	// cut. ALL BELOW THE LINE: three PURE graph algorithms returning a metric/verdict VALUE.
	// `propose` (the baseline-MOVE door) is DELIBERATELY NOT dispatched: it returns a DRAFT
	// ChangeSet whose Delta.Body is a json.RawMessage (a byte-array the HTTP output schema
	// rejects — the S59 scar) AND it is a truth-PROPOSAL the front never fires synchronously
	// (the move goes through the changeset commit gate under approval, like run_mutation).
	// It stays EXPOSED by the server (the stdio binary + CI use it), simply not wired here.
	t = append(t, below("arch-fitness", "measure", "ratchet", "gate")...)

	// ── ADR 0092 batch-2 DEP-FREE read servers (the Go engine is the SINGLE live source). ──
	// 22. cost-meter — S111 per-cell harness COST METER: meter a cell from its REAL recorded
	// AgentRuns (a COUNT, never an estimate) against its DECLARED HarnessCostBudget → the §66.3
	// verdict (cost_meter_cell), project that verdict onto the S83 disjoncteur (cost_disjoncteur_
	// signal), validate a declared budget's shape (cost_validate_budget). ALL BELOW THE LINE:
	// pure computation over a declared (above-the-line) budget the agent only READS — raising a
	// cap is a /goal, never an edit. Writes nothing (the wall); every I/O is a scalar object.
	t = append(t, below("cost-meter", "cost_meter_cell", "cost_disjoncteur_signal", "cost_validate_budget")...)
	// 23. build-console — S86 app-builder console: the FAITHFUL projection of a recorded AgentRun
	// + loop + cost + approval inbox (buildconsole_project), and the §43 coherent-cut verdict that
	// returns the per-project DAG node to record (buildconsole_record_stable_phase). BELOW THE
	// LINE: both pure; an inconsistent cut is REFUSED (no node from a red mirror) and the node is
	// a VALUE — the privileged aidos writer commits it, never the agent.
	t = append(t, below("build-console", "buildconsole_project", "buildconsole_record_stable_phase")...)
	// 24. build-loop — S83 build loop + circuit breaker: the non-gameable termination Decision
	// (buildloop_terminate), the deterministic no-progress verdict (buildloop_no_progress), the
	// closed three-value verdict set (buildloop_verdicts). BELOW THE LINE: pure functions of the
	// history — same history → same halt, never an LLM judgment. Writes nothing.
	t = append(t, below("build-loop", "buildloop_terminate", "buildloop_no_progress", "buildloop_verdicts")...)
	// 25. kernel-garden — S112/§82.4 per-project KernelDebt + /trim: scan a project's slice of the
	// truth-store for the FIVE rots (garden_tend_project), propose an open_idea_* trim over each
	// (garden_suggest_trim), project a suggestion onto the OpenIdea accepting it yields
	// (garden_accept_proposal). BELOW THE LINE: /trim SUGGESTS — deletes_anything is ALWAYS false;
	// accepting OPENS an idea → mirror → /goal → human approval (the only door, §2). Writes nothing.
	t = append(t, below("kernel-garden", "garden_tend_project", "garden_suggest_trim", "garden_accept_proposal")...)
	// 26. autonomy — FK10 the A0..A8 autonomy ladder: fail-closed enforcement of a declared level
	// against an attempted action (enforce — required>declared REFUSED, a critical action never
	// admits A8), and PURE promotion-from-history (promote — the level is COMPUTED from the record,
	// never declared, §8). BELOW THE LINE: both pure, write nothing — freezing a promotion stays
	// idea → mirror → /goal.
	t = append(t, below("autonomy", "enforce", "promote")...)
	// 27. behaviors — S79 project-scoped behavior LIBRARY: browse/search (read), tag/publish/
	// soft_delete/comment (append-only gestures over caller-supplied state), and attach (PREVIEW
	// the §24.6 expansion, or LAND it via an APPROVED ChangeSet — the wall: propose → approve).
	// BELOW THE LINE: every tool pure; attach's WroteKernel is ALWAYS false (the kernel freeze is
	// the aidos CLI downstream). The search matcher is a code substring match, NEVER an LLM. Every
	// I/O is a scalar object — behaviors_attach echoes behavior.Policy/Fixture as plain object
	// structs (no json.RawMessage body — the S59 byte-array transport scar is avoided).
	t = append(t, below("behaviors", "behaviors_browse", "behaviors_search", "behaviors_tag", "behaviors_publish", "behaviors_soft_delete", "behaviors_comment", "behaviors_attach")...)

	// ── ADR 0092 batch-3 servers (the Go engine is the SINGLE live source). ──
	// 28. billing — S114 customer-facing economic plane: plans/meter/meter_project/check_quota are
	// PURE READS (the closed plan ladder + the COUNTED usage fold + the quota verdict over the REAL
	// AgentRun ledger, never an estimate, never an LLM); ingest_webhook is the S73 async inbound
	// operation (idempotent, content-addressed) and pact_verify the read-only Pact provider check.
	// ALL BELOW THE LINE: plans/usage/quotas/webhook-events are runtime/commercial rows — the server
	// writes NO kernel/mirrors/fitness (a plan/limit is DECLARED data, §8). Every I/O is a scalar
	// object (billing.Quota/Usage/IngestEvent are plain structs — no json.RawMessage body, the S59
	// byte-array scar is avoided by construction). The dispatched live reads are the four pure ones;
	// ingest_webhook stays exposed but is the inbound async op (not a synchronous front read).
	t = append(t, below("billing", "billing_plans", "billing_meter", "billing_meter_project", "billing_check_quota", "billing_ingest_webhook", "billing_pact_verify")...)
	// 29. dsl-editor — S77 typed-DSL editors over the four behaviour DSLs: dsl_kinds (the editable
	// kinds), dsl_parse (typed editor doc → AST preview, no free code), dsl_propose (parse + wrap a
	// DRAFT ChangeSet — NEVER applied). ALL BELOW THE LINE: PURE computation, WroteKernel ALWAYS
	// false (there is no apply tool — freezing the edited source stays the /goal flow, the wall).
	// The S59 RawMessage scar is guarded in dsleditorsrv: DslDoc.Body / Parsed.Canonical are wrapped
	// as OBJECT (map[string]any) input/output schemas, so dsl_parse/dsl_propose dispatch over HTTP.
	t = append(t, below("dsl-editor", "dsl_kinds", "dsl_parse", "dsl_propose")...)
	// 30. templates — S81 curated starter catalogue: templates_list/get (read the content-addressed
	// bundles) + templates_instantiate/fork (DRY-RUN duplicate-from-template / fork-at-phase). ALL
	// BELOW THE LINE: every tool PURE, instantiate/fork are dry-run VALUES (WroteKernel ALWAYS false);
	// landing the bundle's truths rides templates.Propose through the changeset door (propose →
	// ChangeSet → approval), never these read tools. Every I/O is a scalar object (Bundle/
	// StarterProject are plain structs — the only RawMessage is in templates.Propose's Delta, not
	// dispatched here — so the S59 byte-array scar is avoided by construction).
	t = append(t, below("templates", "templates_list", "templates_get", "templates_instantiate", "templates_fork")...)

	// ── ADR 0092 batch-4A RLS-scoped + stateless servers (the Go engine is the SINGLE live source). ──
	// 31. besoin-intake (EL15) — the SINGLE capability door over the BesoinGraph (the NEED store ABOVE the
	// wall, §2 — DISTINCT from the truth-store, not an exception). The READ/VALIDATE tools (graph_state/
	// level_schema/list/validate_level/classify/red_backlog/capitalise) are pure projections; the CAPTURE/
	// EMIT tools append a DRAFT idea via the legal idea_capture door (EL05/EL16) — WroteKernel ALWAYS false
	// (the agent role has NO kernel grant; a kernel write is refused by GRANT). ALL BELOW THE LINE: the
	// besoin Store is RLS-scoped to `project` (the SET LOCAL `aidos.project` GUC, S55 — project A's rows are
	// invisible to a B-scoped session), the IdeaStore reuses the `ideas` schema. Every I/O is a scalar
	// object (the body fields are map[string]any — NOT a json.RawMessage byte-array — so the real HTTP
	// args:{object} payload survives the round-trip; the S59 scar is avoided by construction). Promotion
	// stays the /goal flow (S64) — there is no idea_promote_to_kernel tool.
	t = append(t, below("besoin-intake",
		"besoin_graph_state", "besoin_level_schema", "besoin_list",
		"besoin_capture_product", "besoin_capture_journey", "besoin_capture_view", "besoin_capture_control",
		"besoin_capture_action", "besoin_capture_operation", "besoin_capture_entity", "besoin_capture_invariant",
		"besoin_validate_level", "besoin_classify", "besoin_emit_ideas", "besoin_red_backlog", "besoin_capitalise")...)
	// 32. self-cert (S84) — selfcert_certify/gate/kinds: the deterministic SENSOR BATTERY that gates every
	// diff the build-loop takes. ALL BELOW THE LINE: pure computation that FOLDS the per-sensor verdicts into
	// the gated battery (green iff every sensor passes; a missing sensor is RED — anti-passthrough). The
	// judge is the deterministic mirror, never the LLM; WroteKernel is always false (no truth-write tool).
	// Every I/O is a scalar object (no json.RawMessage body — the S59 scar avoided by construction).
	t = append(t, below("self-cert", "selfcert_certify", "selfcert_gate", "selfcert_kinds")...)
	// 33. app-auth (S80) — app_auth_expand/check_access/attach: the auth & roles subsystem of the EMITTED
	// app. expand is a dry-run EXPAND (writes nothing); check_access is the emitted app's RUNTIME authz gate
	// (a pure role→operation lookup, NEVER an LLM); attach PREVIEWS or LANDS via an APPROVED ChangeSet (the
	// wall: propose → approve — WroteKernel ALWAYS false; the kernel freeze is the aidos CLI's job, like
	// behaviors_attach). ALL BELOW THE LINE: pure, stateless, every I/O a scalar object (no json.RawMessage).
	t = append(t, below("app-auth", "app_auth_expand", "app_auth_check_access", "app_auth_attach")...)
	// 34. workspace (S82) — workspace_provision/can_access/check_resources/build_hello: the isolated
	// per-project sandbox. ALL BELOW THE LINE: pure, stateless, DEP-FREE (no DSN, no store) — provisioning is
	// a DRY-RUN descriptor (WroteKernel ALWAYS false), can_access is the cross-project isolation verdict (a
	// path under another project or the truth-store is refused with SANDBOX_ESCAPE — the truth-store is
	// OUTSIDE every workspace root), check_resources the anti-noisy-neighbor kill check. Every I/O is a
	// scalar object (no json.RawMessage body — the S59 scar avoided by construction).
	t = append(t, below("workspace", "workspace_provision", "workspace_can_access", "workspace_check_resources", "workspace_build_hello")...)

	// ── ADR 0092 batch-4B PURE (NON-DSN, NON-RLS) servers (the Go engine is the SINGLE live source). ──
	// The final dispatcher-ready cohort: four STATELESS, DETERMINISTIC servers (no DSN, no store, no clock,
	// no embedder, no LLM — every builder returns a pre-built *mcp.Server directly). For each, only the
	// CHEAP/pure READ tools are dispatched; every dispatched tool's I/O is a scalar OBJECT (no
	// json.RawMessage body — the S59 byte-array transport scar avoided by construction). The `*_propose`
	// tools are DELIBERATELY NOT dispatched: each returns a changeset.ChangeSet whose Delta.Body is a
	// json.RawMessage (the byte-array output scar the HTTP edge rejects) AND is a truth-PROPOSAL the front
	// never fires synchronously — the move goes through the changeset commit gate under approval (the exact
	// arch-fitness `propose` precedent, line 130). Those panels keep their propose→ChangeSet voie propre
	// (the wall). All dispatched tools are BELOW THE LINE: WroteKernel always false.
	//
	// 35. entity-modeler (S75) — schema_validate/schema_hash/canvas_merge/canvas_presence: the canvas-side
	// modeler reads. validate resolves every relation (refuses UNKNOWN_RELATION_TARGET, never guessed),
	// hash is INPUT-ORDER-INVARIANT, merge is a CRDT three-way merge surfacing conflicts as VALUES (never
	// last-write-wins), presence is advisory. schema_propose (the DRAFT-ChangeSet door) is NOT dispatched
	// (RawMessage body + truth-proposal) — the /entity-modeler panel proposes through the changeset door.
	t = append(t, below("entity-modeler", "schema_validate", "schema_hash", "canvas_merge", "canvas_presence")...)
	// 36. shape-editor (S68) — shape_derive/shape_parse/shape_merge: the mirror-shaper reads. derive picks
	// the form from the truth-nature (the closed table), parse is a pure parser (typed spec or typed
	// refusal, never an LLM), merge folds two concurrent edits (MERGE disjoint | LOCK same-field clash,
	// never last-write-wins). shape_propose (the born-red DRAFT-ChangeSet door) is NOT dispatched
	// (RawMessage body + truth-proposal) — the /shape-editor panel proposes through the changeset door.
	t = append(t, below("shape-editor", "shape_derive", "shape_parse", "shape_merge")...)
	// 37. context-map (S101/§46) — verify_pair/verify_all/check_call: the federation pact-verifier reads
	// (HONORED iff the provider publishes a superset of the consumer's expectation; a cross-cell call over
	// an unhonored/absent pair is refused CROSS_CELL_NO_CONTRACT). The verifier is an algorithm, never an
	// LLM. `propose` (the Context-Map DRAFT-ChangeSet door) is NOT dispatched (RawMessage body + truth-
	// proposal) — the /context-map panel proposes through the changeset door.
	t = append(t, below("context-map", "verify_pair", "verify_all", "check_call")...)
	// 38. grilling-loop (S65, EL06) — grill_route/grill_verify_verdict/grill_verdicts: the in-product
	// /grill reads. ALL THREE dispatch (no RawMessage): route returns a VerdictRecord VALUE (the routed
	// idea — a DRAFT; persistence rides the idea_capture door, EL05/§S27), verify_verdict is the barricaded
	// re-verify gate over the closed verdict schema (the LLM exception), verdicts a closed-table read. The
	// routing is deterministic and authoritative; the routed idea persists via idea-intake, never here
	// (WroteKernel always false — the wall).
	t = append(t, below("grilling-loop", "grill_route", "grill_verify_verdict", "grill_verdicts")...)

	// ── ADR 0092 PHASE-2 conceptual-lens servers (the Go engine is the SINGLE live source). ──
	// The four V3 conceptual lenses (grille · liens · anatomie · arbres) were reading TS twins
	// (lib/v2/*) as "client-UX" — but each is a PURE CALCUL the Go kernel already owns (the §2
	// client-UX carve-out covers live editors / optimistic preview / AST extraction / on-keystroke
	// feedback, NEVER a pure computation byte-identical to the Go back). So each is a TWIN to flip:
	// its read tool calls the EXISTING Go kernel logic (it never reimplements it). All BELOW THE
	// LINE: every dispatched tool is a CHEAP/pure read whose output is a VALUE — no DSN, no store,
	// no clock, no embedder, no LLM (determinism-first §6/§8); WroteKernel is always false (the
	// wall, §2). Every I/O is a scalar OBJECT (no json.RawMessage body — the S59 byte-array scar is
	// avoided by construction; grid_build/anatomy_build echo the matrix/anatomy as plain structs).
	//
	// 39. grid (FK03) — grid_build/resolve/mark/affected/rungs: the GRILLE (FKE-1.4) over
	// back/kernel/grid. grid_build projects placed truths onto the full Level×Facet matrix (the
	// /v3/grille read); the four laws (resolve/mark/affected/rungs) are the existing FK03 tools
	// (gridsrv extracts the former package-main so BOTH the stdio binary and the dispatcher reuse
	// one source — no twin).
	t = append(t, below("grid", "grid_build", "grid_resolve", "grid_mark", "grid_affected", "grid_rungs")...)
	// 40. links (KRD §41) — links_kinds/validate/resolve/graph: the SIX versioned link types over
	// back/kernel/links. links_graph validates + resolves a whole graph against the heads (the
	// /v3/liens read); each verdict is the existing links.Validate / links.Resolve (the §41–§42
	// staleness check — green|stale|absent). A new kernel.link row stays the aidos CLI's job.
	t = append(t, below("links", "links_kinds", "links_validate", "links_resolve", "links_graph")...)
	// 41. anatomy (FKE) — anatomy_pairs/voyant/build: the SIX mirror-pairs around the wall + the
	// deterministic VOYANT (the §8 judge is a calcul) over back/kernel/mirror/anatomy (the pure
	// truth-table is NEW Go logic — per determinism-first it MUST be code, so the Go engine is the
	// authoritative source). anatomy_build is the /v3/anatomie read (six ordered pairs + worst-of-
	// six overall + counts). A red voyant is a SIGNAL routed to idea → mirror → /goal, never a write.
	t = append(t, below("anatomy", "anatomy_pairs", "anatomy_voyant", "anatomy_build")...)
	// 42. kernel-tree (KRD §108/§109) — tree_weights/aggregate/reopens: the `composes` mereology
	// link over back/kernel/composes. tree_aggregate is the §109 recursive verdict + the §110
	// drill-down (the /v3/arbres read); a cycle is a typed refusal (CAUSED_BY_CYCLE). tree_reopens
	// is the §112 weighted/thresholded activation. Weights/thresholds are DECLARED, never learned.
	t = append(t, below("kernel-tree", "tree_weights", "tree_aggregate", "tree_reopens")...)

	// ── ADR 0092 PHASE-3 emitted-app + library READ servers (the Go engine is the SINGLE live source). ──
	// Six DEP-FREE servers (no DSN, no store, no clock, no embedder, no LLM in the dispatch path —
	// determinism-first §6/§8) whose every dispatched tool is a CHEAP/pure read whose output is a
	// scalar OBJECT VALUE (no json.RawMessage body — the S59 byte-array transport scar is avoided by
	// construction: a blob handler / a deploy plan / a cockpit state / an emitted Hono artifact's
	// bytes are rendered as STRING fields, a mirror library / an ops dashboard are plain object
	// structs). ALL BELOW THE LINE: WroteKernel always false — no kernel/mirrors/fitness write reaches
	// a backend (the router refuses a truth-write before any dispatch, the wall §2). The builder
	// ignores its ctx and returns the default server; it dispatches identically whatever DSN is set.
	//
	// 43. blob-attribute (S72) — blob_address/validate_upload/storage_key/cross_project/emit_handler:
	// the blob/file attribute door over back/kernel/entities/blob. PURE content-addressing + the CLOSED
	// MIME/size validation (BLOB_MIME_REFUSED / BLOB_SIZE_REFUSED, never coerced) + the project-scoped
	// key + the cross-project refusal (BLOB_CROSS_PROJECT) + the byte-stable handler emission. A blob
	// attribute is a SOURCE above the line; freezing it stays the aidos CLI's job (WroteKernel false).
	t = append(t, below("blob-attribute", "blob_address", "blob_validate_upload", "blob_storage_key", "blob_cross_project", "blob_emit_handler")...)
	// 44. deploy (S96) — plan/gate/check_served/forward_only: the phase-keyed deploy reads over
	// runtime/deploy. plan builds a content-addressed DeployPlan ONLY from a STABLE phase (a non-stable
	// phase is refused PHASE_NOT_STABLE; a breaking-no-backfill migration BREAKING_MIGRATION_NO_BACKFILL);
	// gate is the « done is computed » verdict; check_served is the re-projection property; forward_only
	// the migration ordering check. PURE planning + comparisons over supplied facts — writes nothing.
	t = append(t, below("deploy", "plan", "gate", "check_served", "forward_only")...)
	// 45. ai-lab (FK11) — build_cockpit/propose_slot/scope_pair/validate_card: the AI Lab cockpit reads
	// over runtime/ailab. build_cockpit composes the FK09 conscience report into the zoomable cockpit
	// state; propose_slot is the GAUCHE chat (a PROPOSED slot, or a wall refusal AI_LAB_DIRECT_TRUTH_WRITE
	// — never a truth); scope_pair the CENTRE click; validate_card the DROITE card (fix_below_wall flips a
	// pair; an above-the-wall option opens a /goal). ALL PURE — WroteKernel always false (the wall §2).
	t = append(t, below("ai-lab", "build_cockpit", "propose_slot", "scope_pair", "validate_card")...)
	// 46. hono-emitter (S87) — emit_server/emit_worker/emit_pulumi/server_hash/manifest_hash: the
	// emitted-app SERVER emitter reads over runtime/honoemit. PURE PROJECTION — it renders the bootable
	// Hono/TS server + the async worker + the Pulumi/TS infra program as VALUES (Artifact.Bytes is a
	// STRING field, NOT a json.RawMessage — the S59 byte-array scar is avoided) and the two content
	// addresses; a malformed spec/manifest is a typed BlockReason. Same cut → byte-identical, writes nothing.
	t = append(t, below("hono-emitter", "emit_server", "emit_worker", "emit_pulumi", "server_hash", "manifest_hash")...)
	// 47. mirror-library (S70) — library_list_by_app/library_scoped_health: the project mirror-library
	// reads over back/kernel/mirror/library. PURE grouping (mirrors BY APP + the liveness tally) + the
	// project-scoped completeness law (the monster set + verdict, reusing records.ComputeCompleteness).
	// Project isolation is the S55 RLS wall, made explicit here as a deterministic scope. Writes nothing.
	t = append(t, below("mirror-library", "library_list_by_app", "library_scoped_health")...)
	// 48. ops-observability (S92) — ops_ingest/ops_dashboard/ops_fingerprint: the per-app ops engine
	// reads over runtime/opsobservability. ops_ingest VALIDATEs one OTel signal (closed kind set, project
	// scope); ops_dashboard AGGREGATEs a project's signals into its ops panel (error rate + latency
	// p50/p95/p99 + redacted feeds); ops_fingerprint content-addresses the panel (same signals → same
	// fingerprint). DISTINCT from the E12 telemetry-reader on-ramp — WroteKernel ALWAYS false (the wall).
	t = append(t, below("ops-observability", "ops_ingest", "ops_dashboard", "ops_fingerprint")...)

	// THE FENCED TRUTH-ZONE WRITE NAMESPACE (§2). Not a real tool of any server — the
	// door a caller might craft to move truth directly. Registered as TruthWrite so the
	// gateway refuses it with a ChangeSet-pointing BlockReason (server-side wall).
	// `stack.engrave_manifest` (DP13) is the provisioning twin: a StackManifest is
	// above-the-line truth, so a direct write of one is refused at the edge — truth
	// moves only via idea → mirror → /goal → ChangeSet (the provision server mirrors
	// this refusal independently; both layers fail-close).
	t = append(t,
		Tool{Name: "kernel_write", Server: "kernel", Disposition: DispositionTruthWrite},
		Tool{Name: "mirror_write", Server: "mirrors", Disposition: DispositionTruthWrite},
		Tool{Name: "fitness_write", Server: "fitness", Disposition: DispositionTruthWrite},
		Tool{Name: "stack.engrave_manifest", Server: "provision", Disposition: DispositionTruthWrite},
	)
	return t
}

// GatewayServers is the closed list of the 38 MCP servers the gateway exposes (display
// + the completeness assertion: every named server has ≥1 exposed tool). Ordered. The
// 14th — `provision` — is ACTIVATED at DP13 (the scaffold the gateway now fronts:
// every provisioning op is an MCP tool, ADR 0009; a scaffold the gateway never fronts
// is dead). The 15th — `reality-ingest` — is REGISTERED at ADR 0081 (issue A): the
// prod→kernel on-ramp the gateway must front so `/learn` has its door; a capability the
// gateway never fronts is the symmetric monster of an orphan mirror (§1, §5 generalised).
// The 16th–21st — why-tree · goal-piloting · federation · learn · conscience ·
// arch-fitness — are the S59-batch DEP-FREE read servers (ADR 0092 batch-1): each fronts
// only its CHEAP/pure read tools (graph-walk, compute, hash), the in-process dispatch is
// the live path and the TS twin dies. The 22nd–27th — cost-meter · build-console ·
// build-loop · kernel-garden · autonomy · behaviors — are the ADR 0092 batch-2 DEP-FREE
// read servers (same shape: no DSN, no LLM, every I/O a scalar object, WroteKernel always
// false). The 28th–30th — billing · dsl-editor · templates — are the ADR 0092 batch-3
// servers (same shape: dep-free pure reads, every I/O a scalar object — dsl-editor wraps its
// Body/Canonical as OBJECT schemas to dodge the S59 RawMessage scar; WroteKernel always false).
// The 31st–34th — besoin-intake · self-cert · app-auth · workspace — are the ADR 0092 batch-4A
// servers. besoin-intake is the ONLY DSN-backed one: an RLS-scoped DUAL store (the `besoin` need
// graph scoped to `project` via the SET LOCAL `aidos.project` GUC, S55, + the `ideas` reuse door,
// EL05) — its capture/emit tools append a DRAFT idea (WroteKernel always false), its read/validate
// tools are pure projections. self-cert · app-auth · workspace are dep-free/stateless pure reads
// (app_auth_attach lands via an APPROVED ChangeSet, WroteKernel false; workspace provisioning is a
// dry-run descriptor). Every I/O is a scalar object — the besoin body fields are map[string]any (NOT
// a json.RawMessage byte-array), so the S59 RawMessage scar is avoided by construction.
// The 35th–38th — entity-modeler · shape-editor · context-map · grilling-loop — are the ADR 0092
// batch-4B PURE servers (NON-DSN, NON-RLS, stateless/deterministic — each builder returns a pre-built
// *mcp.Server directly). Each fronts only its CHEAP/pure READ tools (the canvas modeler reads, the
// mirror-shaper reads, the federation pact-verifier reads, the in-product /grill reads); every
// dispatched I/O is a scalar object. The `*_propose` tools (entity-modeler.schema_propose ·
// shape-editor.shape_propose · context-map.propose) are DELIBERATELY NOT dispatched — each returns a
// changeset.ChangeSet whose Delta.Body is a json.RawMessage (the byte-array scar) AND is a truth-
// PROPOSAL the front never fires synchronously (the arch-fitness `propose` precedent, line 130); those
// panels keep their propose→ChangeSet voie propre. grilling-loop dispatches ALL THREE (no RawMessage:
// grill_route returns a VerdictRecord idea VALUE that persists via the idea_capture door, WroteKernel
// always false). truth-approval is DELIBERATELY NOT fronted: its three tools (truth_propose/approve/
// apply_concurrent) DECIDE/GATE a truth-write and return the apply envelope — they ARE the
// propose → ChangeSet → approval door, never a below-the-line read, so the /truth-approval panel
// stays that door (route(truth_propose) resolves to unknown_tool, never a readVia). A capability
// the gateway never fronts is dormant; fronting it here makes the engine the single live source.
func GatewayServers() []string {
	return []string{
		"store", "mirror-runner", "changeset", "dag", "idea-intake", "memory",
		"context", "evolve", "backtester", "telemetry-reader", "pact-verifier",
		"mutation-runner", "project", "provision", "reality-ingest",
		"why-tree", "goal-piloting", "federation", "learn", "conscience", "arch-fitness",
		"cost-meter", "build-console", "build-loop", "kernel-garden", "autonomy", "behaviors",
		"billing", "dsl-editor", "templates",
		"besoin-intake", "self-cert", "app-auth", "workspace",
		"entity-modeler", "shape-editor", "context-map", "grilling-loop",
		// ADR 0092 PHASE-2 conceptual-lens servers — the four V3 lenses whose pure-calcul twins
		// (lib/v2/grid · lib/v2/links · lib/v2/anatomy · lib/v2/kernel-tree) flip to the Go engine.
		"grid", "links", "anatomy", "kernel-tree",
		// ADR 0092 PHASE-3 emitted-app + library READ servers — six DEP-FREE pure-read servers whose
		// demo-twin panels flip to the Go engine: blob-attribute (the S72 blob/file attribute door) ·
		// deploy (the S96 phase-keyed deploy reads) · ai-lab (the FK11 cockpit reads) · hono-emitter
		// (the S87 emitted-app SERVER emitter reads — Artifact.Bytes is a STRING, not a json.RawMessage,
		// so the byte-array scar is avoided) · mirror-library (the S70 per-project mirror library reads) ·
		// ops-observability (the S92 per-app ops dashboard reads). Each dispatches CHEAP/pure reads whose
		// output is a scalar object VALUE — WroteKernel always false (the wall). Without these entries
		// route(blob_address)→unknown_tool→demo (a hollow flip — the cliquet's readVia-frontier blind spot).
		"blob-attribute", "deploy", "ai-lab", "hono-emitter", "mirror-library", "ops-observability",
	}
}
