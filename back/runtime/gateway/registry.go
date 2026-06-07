package gateway

// DefaultRegistry is the CLOSED, content-addressable set of MCP tools the S58 gateway
// exposes over HTTP — EVERY tool of the 13 existing AIDOS MCP servers the roadmap
// names (store · mirror-runner · changeset · dag · idea-intake · memory · context ·
// evolve · backtester · telemetry-reader · pact-verifier · mutation-runner · project),
// PLUS the explicitly-fenced truth-zone write namespace (CLAUDE.md §2).
//
// THE WALL, ENCODED AS DATA (server-side). All 13 servers' real tools are BELOW THE
// LINE — they read/op the archive·brain·context·ideas·changesets·dag·besoin schemas
// the agent role MAY touch (the changeset_* tools ARE the legal ChangeSet door, the
// only path truth moves: they stay below-line because they propose/stage/apply through
// the gate, never a raw kernel write). None of the 13 holds a GRANT to write
// kernel/mirrors/fitness — that is the wall by construction.
//
// The truth-zone WRITE namespace (kernel_write · mirror_write · fitness_write) is NOT a
// real tool of any server — it is the door a naïve or hostile caller might craft to
// move truth directly. The gateway registers these names with DispositionTruthWrite so
// that such a call is REFUSED with an actionable BlockReason (use a ChangeSet), rather
// than silently 404'd — the server-side wall is explicit, not incidental.
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

	// THE FENCED TRUTH-ZONE WRITE NAMESPACE (§2). Not a real tool of any server — the
	// door a caller might craft to move truth directly. Registered as TruthWrite so the
	// gateway refuses it with a ChangeSet-pointing BlockReason (server-side wall).
	t = append(t,
		Tool{Name: "kernel_write", Server: "kernel", Disposition: DispositionTruthWrite},
		Tool{Name: "mirror_write", Server: "mirrors", Disposition: DispositionTruthWrite},
		Tool{Name: "fitness_write", Server: "fitness", Disposition: DispositionTruthWrite},
	)
	return t
}

// GatewayServers is the closed list of the 13 MCP servers S58 exposes (display + the
// completeness assertion: every named server has ≥1 exposed tool). Ordered.
func GatewayServers() []string {
	return []string{
		"store", "mirror-runner", "changeset", "dag", "idea-intake", "memory",
		"context", "evolve", "backtester", "telemetry-reader", "pact-verifier",
		"mutation-runner", "project",
	}
}
