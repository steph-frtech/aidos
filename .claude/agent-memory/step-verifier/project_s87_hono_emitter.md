---
name: project-s87-hono-emitter
description: S87 hono-emitter verification — emitted-app Hono/TS server scaffold + Pulumi/TS IaC emitter, deterministic byte-stable FN02-pure; verified-green after 1 gofmt fix
metadata:
  type: project
---

S87 « scaffold serveur de l'app émise (Hono/TS) bootable + émetteur IaC Pulumi/TS » — VERIFIED GREEN after 1 gofmt correction.

`back/runtime/honoemit`: deterministic emitter of the EMITTED USER APP's server (Hono/functional TS, ADR 0040 — never Go for the user app, counterpart of S36 Go-API emitter for AIDOS itself). EmitServer renders createApp(deps) factory + middleware + GET /healthz + one POST handler per SYNC op delegating to injected Go interpreter callback (deps.interpret, ADR 0040 Déc.7 — re-implements no rule); async ops → EmitWorker (drains outbox, dispatches typed effects, S73/S74). NEW TargetPulumiProgram: StackManifest → Pulumi/TS program (docker.Network + one docker.Container per service on shared Traefik network, Traefik labels only on role=server, ADR 0043). All PURE/TOTAL/byte-identical, FN02-pure (no module-scope let/var — pinned by property test scanning for `let `/`var ` line-prefix).

DONE-CRIT both PINNED + RAN uncached:
- Godog/fixture (honoemit_fixture_test.go) ACTUALLY BOOTS the emitted server under node (`--experimental-strip-types`, real Hono `app.request` in-process client): GET /healthz→200 {status:ok}, createOrder route→201 (interpreter callback ran, OpBody.operation=="createOrder"), async worker dispatchSendReceipt drains exactly 1 job. Confirmed PASS not skipped (TestFixture_EmittedServerBootsAndAnswers 0.16s — node on PATH + node_modules/hono found upward). Structural fixtures (server wires every sync op NOT async, malformed-spec refused, pulumi refusals: unknown-role/no-server/dup-port).
- property (rapid): TestProp_ServerByteIdentical (same Kernel→byte-identical server+worker, input-order-permutation invariant, hashes match) + TestProp_EmittedServerFN02Pure (no module-scope mutable binding) + TestProp_PulumiByteIdentical_AndPure.

ONE CORRECTION: gofmt -w honoemit_fixture_test.go — struct-tag misalignment on `var res struct{...}` (DispatchedTarget tag column). RECURRING gofmt struct-tag-align pattern (go test/vet pass, gofmt -l still flags). Re-ran tests after fix, still green.

Wall CLEAN: MCP 5 PURE tools (emit_server/emit_worker/emit_pulumi/server_hash/manifest_hash) — NO truth-write tool, writes NOTHING; actions.ts RENDERS code as VALUES, writes nothing (only doc-comment mentions of kernel/mirrors/fitness, no SQL/INSERT/conn). Front: /hono-emitter action-capable 2 controls (projectServerAction emit server|worker + emitPulumiAction), nav reachable WorkbenchHeader {href:"/hono-emitter", k:"honoEmitter"} + nav.honoEmitter label fr+en present; panel exposes all e2e testids (emit-server/emit-pulumi/server-surface/emit-result/emit-output/emit-hash/data-verdict); lib twin vitest 6/6 (determinism+purity+byte-stability, own FNV digest for display Go-authoritative); tsc clean on hono-emitter files; biome clean 5 files; e2e 4 specs (panel renders both controls / server boots healthz+sync-handlers async-NOT-routed / worker drains outbox / pulumi network+containers+traefik). i18n 4234==4234 honoEmitter ns both locales.

go build ./... clean, vet clean, go test honoemit+mcp green. docs: concept+internals mdx exist, internals 3-layer (Implémentation/Méta/Méta-méta), docs.json:243-244, mint validate PASS, pushed e69f2e2 HEAD==origin/main clean tree.

OQ by-design: OQ-S87-stackmanifest (StackManifest as first-class kernel record kind = DP02 forward-dep, honoemit models it as JSON body content-addressed via S02, decoder binds unchanged when DP02 lands — coins no kernel kind, wall holds); Linear MCP unauthenticated (best-effort §7/§11, OpenQuestion); mintlify MCP reindex lag (push succeeded, validate clean).

Verdict: PASSED after 1 gofmt fix.
