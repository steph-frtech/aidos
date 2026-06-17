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

// GatewayServers is the closed list of the 27 MCP servers the gateway exposes (display
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
// false). A capability the gateway never fronts is dormant; fronting it here makes the
// engine the single live source.
func GatewayServers() []string {
	return []string{
		"store", "mirror-runner", "changeset", "dag", "idea-intake", "memory",
		"context", "evolve", "backtester", "telemetry-reader", "pact-verifier",
		"mutation-runner", "project", "provision", "reality-ingest",
		"why-tree", "goal-piloting", "federation", "learn", "conscience", "arch-fitness",
		"cost-meter", "build-console", "build-loop", "kernel-garden", "autonomy", "behaviors",
	}
}
