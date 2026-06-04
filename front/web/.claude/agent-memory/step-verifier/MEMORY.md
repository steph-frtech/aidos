# step-verifier — memory index

- [gofmt struct alignment in fixture tests](feedback_gofmt_fixture_alignment.md) — executor reports "gofmt clean" but anonymous-struct field alignment in table-driven tests sometimes slips; always run `gofmt -l` on the changed Go dir.
- [BA-series prompt twin](project_ba_series_prompt_twin.md) — BA0x agent-layer steps ship a Go pure fn + byte-for-byte TS twin in lib/agentlayer.ts; e2e at repo-root tests/e2e/agents.spec.ts; back/kernel/agentlayer is CODE not the truth schema.
- [BA23 scheduler MCP](project_ba23_schedulermcp.md) — scheduler MCP shell (tick/assignments/fence) over pure planner; captureApplier seam below the line, no SQL in shell; /agents Queue & Dispatch panel; verified-green.
- [BA25 team coordination](project_ba25_teamcoord.md) — ScheduleTeam pure N-agent planner reusing ResolveConflict+BA22; scheduler TS twin in lib/scheduler.ts; run Go from back/ (ignore ./agentloop/... glob); verified-green.
- [BA26 agentrun replay](project_ba26_agentrun_replay.md) — AgentRun gains Impl/Seed/ProviderTranscript via supersede-via-version; LegacyID keeps legacy hash byte-stable; run Testcontainers not just -short; verified-green.
- [BA28 replay+redact](project_ba28_replay_redact.md) — Replay re-derives same id via records.Hash; Redact closed declared secret-pattern set; front twin agentrun-redact.ts; web-projection.test.ts is a pre-existing UNRELATED failure; verified-green.
