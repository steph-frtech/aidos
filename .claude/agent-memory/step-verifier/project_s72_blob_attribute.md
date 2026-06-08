---
name: s72-blob-attribute
description: S72 blob/file Entity AST node + per-project object storage + deterministic upload handler emitter — verified green, zero corrections
metadata:
  type: project
---

S72 « type blob/fichier + stockage objet par projet » — THIRD distinct Entity AST node (over S35 scalars + S71 relations), NEITHER scalar NOR relation. BlobAttribute{name, allowed_mime[], max_bytes, required omitempty}.

**Done-crit proven:** property (round-trip content-addr AST + deterministic handler emit) = TestProp_RoundTrip/ContentAddressed/HandlerDeterministic; fixture (blob of A inaccessible from B) = TestFixture_BlobOfAIsInaccessibleFromB + TestProp_ProjectScoped; out-of-MIME/size refused = TestFixture_OutOfMime/OverSize (BLOB_MIME_REFUSED/BLOB_SIZE_REFUSED, never coerced, non-empty how_to_fix).

**Closed-set honesty (the S72 invariant):** TestProp_ScalarSetUntouched proves blob node NEVER widens entities.ScalarTypes() (5 unchanged) — mirrors S71's TestProp_ScalarSetUntouched. A MIME string never leaks into scalar set.

**Byte-anchor INDEPENDENTLY verified:** Go blob.ID(avatar{png,jpeg,1MiB,required}) = b532622b6bd65a7595f2a4377e03fc1b11e374d201757f8b6ccbd4e05bb57f03; body = {"allowed_mime":["image/png","image/jpeg"],"max_bytes":1048576,"name":"avatar","required":true}. TS canonicalBody byte-equal (omitempty false-required absent, array order preserved, keys sorted) → same hash.

**StorageKey project-scoped** = "<project>/<entity>/<attr>/<contentHash>"; ProjectOf=first segment; CrossProjectAccess refuses BLOB_CROSS_PROJECT. EmitHandler renders byte-stable TS (ADR 0040 Hono/functional, imports ../provider) baking ALLOWED_MIME tuple + MAX_BYTES + KEY_PREFIX + signUpload/signDownload; signing delegated to provider at runtime (smallest irreducible seam, behind replaceable port ADR 0046). Body/ID/Parse reuse records.Hash/Canonicalize verbatim; BlockUpload reuses blockreason S13 (code CodeOutOfScope).

**Sensors:** go build/vet/gofmt clean, go test kernel+MCP green (MCP 7/7 verbose), Vitest 6/6, biome clean. ONLY tsc error = lib/behavior-capture.test.ts(101) 'Kind' — PRE-EXISTING S67 file, NOT in S72 files_changed, zero blob tsc errors (NOT blocking).

**Wall:** MCP 5 pure tools (blob_address/validate_upload/storage_key/cross_project/emit_handler) write nothing; actions.ts computes VALUES only, grep INSERT/UPDATE/changeset CLEAN. ui-completeness: /blob-attribute action-capable, e2e 4/4 testids all match panel (upload-submit/mime/size, upload-result data-verdict, block-code data-code, storage-key count 0 on refusal, cross-a/b data-reachable, handler-head AIDOS-GENERATED). h1 title FR "Type blob/fichier de l'Entity AST" matches e2e regex. nav:138 blobAttribute both locales.

**Docs:** concept+internals .mdx exist, 3 layers (Implémentation/Méta/Méta-méta), docs.json:213-214, mint validate PASS, pushed 592f610 ahead:0. ADR 0046 (MinIO default/any-S3, bytes never in truth-store/git, per-project scoping).

**OQ by-design (non-blocking):** (1) BlobAttribute not yet wired into entities.Entity struct (Blobs slice owned by S74 relation-aware/blob emitters — same pattern as S71 ref deferred wiring); (2) StorageProvider signPut/signGet concrete MinIO/S3 = emitted-app runtime substrate (deployment track), pure-emitter only here; (3) Linear MCP unauthenticated (only authenticate/complete exposed, interactive OAuth) — S72 issue not created.

verdict: verified-green ZERO corrections.
