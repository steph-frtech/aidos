---
name: project-s91-secret-store
description: S91 per-app secret store verification — AES-256-GCM at rest, project_id AAD isolation, fail-closed boot injection, gitleaks-style scan, rotation; verified green zero corrections
metadata:
  type: project
---

S91 — per-app SECRET STORE (app-builder EPIC 9, DP32/ADR 0043), back/runtime/secretstore.

**What it is:** per-project encrypted-at-rest secret store. AES-256-GCM, project_id bound into the GCM **AAD** so cross-project isolation is CRYPTOGRAPHIC not a convention (a ciphertext sealed for A fails the tag check under B → ErrNotFound). Set/Get/Has/Rotate append-only (superseded flag, head mutable, S02 shape reused below the line). InjectEnv = deterministic set-difference (declared − present) → SORTED APP_SECRET_* env OR fail-closed BlockReason CodeSecretMissingAtBoot. ScanEmission = pure gitleaks-style closed regex set + verbatim known-value scan, REDACTED excerpts (report never re-emits secret). StoreFingerprint = non-secret content view (hashes ciphertext+names, never plaintext). Sealer abstraction pins a fixed nonce for byte-stable reproducibility mirror (the only entropy = GCM nonce, crypto necessity).

**Done-criteria ALL met + RAN:** (1) property — secret of A never leaks to B (TestProp_CrossProjectIsolation AAD bind) nor into emitted source (ScanEmission sound∧complete, TestProp_LeakScanSoundAndComplete + TS twin tests 5/6/7/8); (2) fixture — rotation invalidates old (TestFixture_RotationInvalidatesOldSecret, old superseded never re-served); (3) missing-at-boot → actionable BlockReason (CodeSecretMissingAtBoot, missing key NAMED in explanation, non-empty how_to_fix, SeverityBlocking, fail-closed empty env); (4) scan = code (pure regex+verbatim, no LLM).

**Verification:** go test -count=1 secretstore+mcp+blockreason ok, agentimpl (Codes consumer) still green after enum addition, go build ./... exit 0, gofmt -l clean, vet clean. MCP aidos-secretstore 5 PURE tools (set/rotate/inject/scan/fingerprint) — DELIBERATELY no raw `get` tool (value leaves only as boot env var — never a read-anything leak channel). Wall-grep CLEAN (no INSERT/UPDATE/write to kernel/mirrors/fitness; secret = operational material below the line, the `secrets` projection). TS twin lib/secret-store vitest 8/8, tsc 1err=PRE-EXISTING S67 behavior-capture `Cannot find name Kind` NOT S91, biome clean 6 files. Front nav-reachable WorkbenchHeader:153 {href:/secret-store,k:secretStore}, i18n fr4332==en4332 secretStore 27==27. h1="Secret store par projet" matches e2e regex. Panel buttons via `<Submit testid=...>` (set/rotate/inject/scan-button) — testids NOT grep-able as data-testid (RECURRING: Submit wrapper sets data-testid from testid prop). e2e 6/6 RAN GREEN live:3000, values NEVER rendered (body not-contains plaintext). docs concept+internals 3-layer (Implémentation/Méta/Méta-méta) docs.json:251-252 mint-PASS HEAD==origin/main 9867ce1, concept URL live 200.

**OQ (by-design fwd-dep, NOT residual):** (a) encrypted `secrets` Postgres table + KMS master key = deploy track DP32/ADR0043 (package process-scoped in-mem, master key from AIDOS_SECRET_MASTER_KEY env dev-fallback); deterministic crypto+boot-injection fully built+mirror-proven here. (b) Linear MCP unauthenticated (only authenticate tool surfaced) — S91 issue not movable, §11 OQ not block. (c) gitleaks binary not installed — done-criterion mandates "scan = code jamais LLM" so the in-process gitleaks-style scanner IS the authoritative reproducible form.

verified-green ZERO corrections.
