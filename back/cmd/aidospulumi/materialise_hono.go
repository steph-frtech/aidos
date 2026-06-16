package main

// materialise_hono.go — L'EXÉCUTEUR DE LA VOIE HONO/TS PROPRE (3 conteneurs câblés).
//
// Intention (utilisatrice, 2026-06-14) : « déployer l'app ÉMISE DEPUIS LES SPECS, voie Hono/TS PROPRE
// — serveur Hono émis + SIDECAR INTERPRÉTEUR Go + postgres ». Materialise (gold) et MaterialiseApp
// (générique aidos-app) déploient l'AUTRE voie (un serveur Go générique). CELLE-CI matérialise les
// TROIS conteneurs CÂBLÉS via honoemit.EmitPulumiStackHono : le Hono émis route vers le sidecar, le
// sidecar exécute operation.Interpret sur postgres.
//
// `aidospulumi up --project X --env dev --hono [--entities f.json [--seed s.sql]]` :
//   - sans --entities : la topologie câblée par défaut, DB initialisée vide (le schema arrive par
//     migration) ;
//   - avec --entities : émet le schema du projet (appdata.EmitProjectData) dans le dir du stack, puis
//     le programme Pulumi câblé AVEC le montage du schema (01-schema.sql, le GOLD form).
//
// DÉTERMINISME-FIRST. L'émission (EmitProjectData + EmitPulumiStackHono) est PURE ; l'exécuteur
// (écriture disque puis pulumi up) est le geste GATÉ. Il n'écrit AUCUNE vérité (anti-overwrite §9 :
// Materialise/MaterialiseApp restent intouchés — la voie Hono est PUREMENT ADDITIVE).

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/appdata"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

// webBuildDir is the relative path (inside the server image) where the BUILT React view lands — the
// path server.ts's serveStatic resolves and the server Dockerfile's web stage copies dist/ to. One
// source of truth shared by the server spec (WebDir) and the emitted Dockerfile.
const webBuildDir = "./web/dist"

// honoDefaultManifest returns the clean-Hono-path 3-container topology for a project×env: the emitted
// Hono server (role=server) + the Go interpreter sidecar (role=interpreter) + postgres (role=datastore),
// a pgdata volume, on the EXTERNAL traefik_default network. The placeholder images are rewritten to the
// clean images (aidos-hono / aidos-interpreter) by the emitter. (When the DP02 kernel `stack_manifest`
// kind lands, the executor reads the project's manifest from the truth-store instead; today it
// materialises this clean-path default. A below-the-line projection input, never a truth write.)
func honoDefaultManifest(project string) honoemit.StackManifest {
	return honoemit.StackManifest{
		App: project,
		Services: []honoemit.Service{
			// Placeholder images — EmitPulumiStackHono REWRITES them by role (opts.HonoImage /
			// InterpreterImage). MaterialiseHono sets opts.HonoImage to the per-project CONTENT-ADDRESSED
			// tag (<project>-hono:<hash12>) so the server runs THIS project's routes (and a code change
			// yields a new tag → Pulumi recreates the container), never the generic image.
			{Name: "server", Role: honoemit.RoleServer, Image: "aidos-hono:latest", InternalPort: 3000},
			{Name: "interpreter", Role: honoemit.RoleInterpreter, Image: "aidos-interpreter:latest", InternalPort: 8080},
			{Name: "db", Role: honoemit.RoleDatastore, Image: "postgres:16-alpine", InternalPort: 5432},
		},
		Volumes: []honoemit.Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	}
}

// honoServerImageTag is the deterministic, CONTENT-ADDRESSED per-project server image tag the scaffold
// builds into and the manifest references: `<project>-hono:<hash[:12]>`. The pure formatter; the `hash`
// it receives is the EMITTED-OUTPUT content address (honoOutputHash — the bytes the docker build actually
// compiles), so a change to ANY emitter (a new instrumentation.ts/Dockerfile/web view, even under the
// same spec) yields a NEW tag — an IMMUTABLE content address, never the mutable `:latest`.
//
// Why this is the fix (S02 content-addressing): Pulumi keys the `server` container on this tag STRING.
// With `:latest` the string never changes, so a code change leaves the input unchanged — `up` reports
// "replaced" yet keeps the stale image (the container never runs the new code). A tag content-addressed
// over the EMITTED OUTPUT changes whenever the built bytes change, so Pulumi sees a changed input and
// RECREATES the container with the new code (no manual `pulumi refresh` after an emitter change).
//
// PURE function of (project, hash): same inputs → same tag (reproducibility), distinct hashes → distinct
// tags (content-addressing). The mirror imagetag_hono_test.go seals both. The truncation length (12 hex)
// matches the S02/honoemit convention (hash[:12]); a SHORTER hash is used verbatim (never padded).
func honoServerImageTag(project, hash string) string {
	ref := hash
	if len(ref) > 12 {
		ref = ref[:12]
	}
	return project + "-hono:" + ref
}

// honoOutputHash content-addresses the EMITTED OUTPUT of the per-project server image — the bytes the
// docker build over serverDir ACTUALLY compiles: the Hono server scaffold (EmitServerScaffold(server))
// PLUS the served React view (EmitWebApp(web)) when the server serves a view (server.WebDir != ""). It is
// the FIX for the emitter-staleness gap: hashing the SPEC (ServerSourceHash) left the tag unchanged when
// an EMITTER changed under the same spec (a new instrumentation.ts/Dockerfile/web view), so Pulumi kept
// the stale image and a manual `pulumi refresh` was needed. Hashing the OUTPUT BYTES instead means any
// emitter change → new bytes → new hash → new tag → Pulumi recreates the container.
//
// The bytes are folded path-sorted (the emitters already return path-sorted slices; we re-sort the
// concatenation so server⊕web order never leaks) with a collision-safe encoding (path ⊕ \x00 ⊕ bytes ⊕
// \x00) so a byte moving between a path and its content can never collide. DETERMINISM-FIRST: a PURE
// function of the emitted bytes — same emitted output → same hash, a one-byte change → a new hash.
//
// An emitter REFUSAL (a malformed cut) returns "" so the caller falls back to the mutable `:latest`; the
// spec validation upstream already refuses a malformed cut before deploy, so this is unreachable on the
// happy path (the staleness on that degenerate path is the lesser evil).
func honoOutputHash(server honoemit.ServerSpec, web honoemit.WebAppSpec, overrides []honoemit.ScreenOverride) string {
	scaffold, br := honoemit.EmitServerScaffold(server)
	if br != nil {
		return ""
	}
	arts := append([]honoemit.Artifact(nil), scaffold...)

	// The served React view is part of the BUILT scaffold (MaterialiseHono lands the view under
	// serverDir/web/ and the server Dockerfile's web stage compiles it). Hash it too — so a change to the
	// WEB emitter (a new view byte) OR a captured ScreenDesign override (a new fond/section class) also
	// moves the tag (a new design → new bytes → new tag → Pulumi recreates the container, the permanence
	// of the "red"). It hashes the SAME bytes the materialiser lands (emitProjectWebView with overrides),
	// so the tag ≡ what is built. Folded ONLY when the server serves a view (server.WebDir != "").
	if server.WebDir != "" {
		webArts, br := emitWebViewArtifacts(web, overrides)
		if br != nil {
			return ""
		}
		arts = append(arts, webArts...)
	}

	sort.SliceStable(arts, func(i, j int) bool { return arts[i].Path < arts[j].Path })
	var buf bytes.Buffer
	for _, a := range arts {
		buf.WriteString(a.Path)
		buf.WriteByte(0)
		buf.Write(a.Bytes)
		buf.WriteByte(0)
	}
	return records.Hash(buf.Bytes())
}

// serverSpecImageTag content-addresses the per-project server image tag from the EMITTED OUTPUT: it hashes
// the bytes EmitServerScaffold(server) ⊕ EmitWebApp(web) actually produce (honoOutputHash — the SAME bytes
// BuildHonoServerImage docker-builds) and tags `<project>-hono:<hash12>`. It is the ONE source of truth for
// the tag, called by both the project-cut path (projectServerImageTag, the materialiser) and the genome
// path (found.go's recompile), so the materialised program and the recompiled program reference byte-
// identical tags. An emitter refusal falls back to the mutable `:latest` so the deploy still proceeds (the
// spec validation upstream already refuses a malformed cut, so this is unreachable on the happy path).
// DETERMINISM-FIRST: a pure projection of the EMITTED OUTPUT — a change to ANY emitter (same spec) yields a
// new tag, so Pulumi recreates the container instead of keeping the stale image.
func serverSpecImageTag(project string, server honoemit.ServerSpec, web honoemit.WebAppSpec, overrides []honoemit.ScreenOverride) string {
	hash := honoOutputHash(server, web, overrides)
	if hash == "" {
		return project + "-hono:latest"
	}
	return honoServerImageTag(project, hash)
}

// projectServerImageTag is the per-project server image tag the materialiser/executor propagate: it
// content-addresses the tag from the project's EMITTED OUTPUT (the SAME projectServerSpec scaffold +
// projectWebSpec view the materialiser lands in serverDir, for the SAME entity cut `ents`). One source of
// truth shared by MaterialiseHono (which sets opts.HonoImage so the Pulumi program references it) and
// BuildHonoServerImage (which builds that scaffold under this tag) — they never drift: the tag IS the hash
// of the bytes that are built. Because the entities flow into BOTH specs, a change to the project's entity
// cut moves the tag (a Page-cut app gets a different tag from the gold Order cut → Pulumi recreates the
// container with the project's own view). DETERMINISM-FIRST: a pure projection of the emitted output.
func projectServerImageTag(project string, ents []entities.Entity, overrides []honoemit.ScreenOverride) string {
	return serverSpecImageTag(project, projectServerSpec(project, ents), projectWebSpec(project, ents), overrides)
}

// interpreterImageTag is the shared sidecar interpreter image tag. The manifest references it and the
// ensure-image gesture builds it (from cmd/aidosinterpreter/Dockerfile). One source of truth.
const interpreterImageTag = "aidos-interpreter:latest"

// moduleRoot walks up from the current working directory to the Go module root (the dir holding go.mod).
// It is the docker build CONTEXT for the interpreter image (its Dockerfile copies the whole module). It
// is deterministic (no absolute path baked) and bounded (≤ 8 levels). A miss is an actionable error.
func moduleRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("moduleRoot: getwd: %w", err)
	}
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return "", errors.New("moduleRoot: go.mod not found walking up from CWD — run aidospulumi from inside the back/ module")
}

// dockerImageExists reports whether a docker image tag is present locally (`docker image inspect`). It is
// the GATED probe the ensure-gesture uses to stay idempotent — a warm image skips the build. A docker
// error (daemon down / not installed) returns false so the caller attempts the build and surfaces the
// real cause there, never a silent skip.
func dockerImageExists(tag string) bool {
	cmd := exec.Command("docker", "image", "inspect", tag)
	return cmd.Run() == nil
}

// EnsureInterpreterImage is the GATED docker gesture that guarantees the sidecar interpreter image
// (aidos-interpreter:latest) exists before `pulumi up` references it: if absent it runs
// `docker build -f cmd/aidosinterpreter/Dockerfile -t aidos-interpreter:latest <moduleRoot>` (the build
// context is the Go module root, what the interpreter Dockerfile copies). It JUDGES nothing — it builds
// exactly the committed Dockerfile. Idempotent: a warm image skips the build. Invoked by the executor
// (PulumiUpHono), never by the pure materialiser, so the unit mirror stays docker-free.
func EnsureInterpreterImage() (string, error) {
	if dockerImageExists(interpreterImageTag) {
		return interpreterImageTag, nil // already built — idempotent skip.
	}
	root, err := moduleRoot()
	if err != nil {
		return "", err
	}
	dockerfile := filepath.Join("cmd", "aidosinterpreter", "Dockerfile")
	cmd := exec.Command("docker", "build", "-f", dockerfile, "-t", interpreterImageTag, ".")
	cmd.Dir = root // build context = the module root (the Dockerfile copies the whole module).
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("docker build %s (-f %s): %w\n%s", interpreterImageTag, dockerfile, err, out)
	}
	return interpreterImageTag, nil
}

// MaterialiseHono renders the clean Hono-path stack for (project, env): with entitiesPath set it first
// emits the project's schema.sql (+ optional seed.sql) into the stack dir (what postgres mounts), then
// renders the WIRED Pulumi program (honoemit.EmitPulumiStackHono) and lands the three Pulumi files
// byte-identically. Without entitiesPath it renders the wired topology with no data mount (the DB boots
// empty). It is the clean-path twin of Materialise/MaterialiseApp; both are untouched (anti-overwrite).
func MaterialiseHono(root, project, env, entitiesPath, seedPath, screenDesignPath string) (Materialised, error) {
	if project == "" {
		return Materialised{}, errors.New("--project is required")
	}
	if env == "" {
		return Materialised{}, errors.New("--env is required")
	}

	// (0) Optional captured ScreenDesign overrides (ADR 0071, the PERMANENCE of the validated "red"):
	// when --screen-design is passed, the validated per-coordinate style tokens are RE-APPLIED to the
	// emitted web view (via EmitWebChildAdapted) so the design survives a redeploy. Without it the web
	// view is byte-identical to the canonical EmitWebApp (anti-overwrite §9). Loaded once, shared by the
	// scaffold hash + the materialised view, so the content-addressed tag matches the bytes built.
	overrides, err := loadScreenOverrides(screenDesignPath)
	if err != nil {
		return Materialised{}, err
	}

	stack := project + "-" + env
	dir := filepath.Join(root, ".deploy-pulumi", stack)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Materialised{}, fmt.Errorf("create %s: %w", dir, err)
	}

	// (0b) Load the project's ENTITIES (the --entities catalogue) ONCE, up front — they drive the WHOLE
	// projection: the web list views (one per entity), the server read routes (GET /entities/<e>), AND the
	// content-addressed image tag. Converted from the schema-source shape (generators.EntitySource) to the
	// kernel entity AST (entities.Entity) via entitySourceToEntity (the FORWARD twin of entitiesToSchemaSource).
	// EMPTY (no --entities) → the gold/zero-entities demo cut is restored downstream (Order + checkout).
	var srcEnts []generators.EntitySource
	if entitiesPath != "" {
		srcEnts, err = loadEntities(entitiesPath)
		if err != nil {
			return Materialised{}, err
		}
	}
	ents := entitySourcesToEntities(srcEnts)

	// The server runs the PER-PROJECT, CONTENT-ADDRESSED image (<project>-hono:<hash12>), built from the
	// emitted scaffold below. EmitPulumiStackHono rewrites the role=server image to this, so the wired
	// Pulumi program references the project's own routes — never the generic aidos-hono:latest placeholder,
	// and never the mutable :latest tag (so a code change → a new hash → a new tag → Pulumi RECREATES the
	// container, closing the staleness gap the `:latest` tag caused).
	// The content-addressed tag folds the project's ENTITIES (so a Page-cut app gets a different tag from
	// the gold Order cut → Pulumi recreates the container with the project's own view) AND the captured
	// ScreenDesign overrides (so a validated design → new web bytes → a new tag). Computed ONCE here and
	// stored in Materialised so BuildHonoServerImage builds under the SAME tag (no drift).
	imageTag := projectServerImageTag(project, ents, overrides)
	opts := honoemit.StackHonoOpts{HonoImage: imageTag}

	// (a) Optional project DATA: emit the schema (+ seed) into the stack dir — what postgres mounts.
	if entitiesPath != "" {
		schema, _, err := appdata.EmitProjectData(project, srcEnts)
		if err != nil {
			return Materialised{}, err
		}
		if err := os.WriteFile(filepath.Join(dir, "schema.sql"), schema, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write schema.sql: %w", err)
		}
		opts.DataDir = dir

		if seedPath != "" {
			seed, err := os.ReadFile(seedPath)
			if err != nil {
				return Materialised{}, fmt.Errorf("read --seed %q: %w", seedPath, err)
			}
			if err := os.WriteFile(filepath.Join(dir, "seed.sql"), seed, 0o644); err != nil {
				return Materialised{}, fmt.Errorf("write seed.sql: %w", err)
			}
			opts.SeedPresent = true
		}
	}

	// (a2) Emit the PER-PROJECT Hono SERVER SCAFFOLD into <dir>/server/ (server.ts/index.ts/
	// package.json/Dockerfile). This is the project's OWN routes (one POST per operation → the
	// sidecar), the bootable image the `server` container runs — NOT the generic aidos-hono:latest
	// placeholder. Emission is PURE + deterministic (EmitServerScaffold); building the image from it
	// is the gated docker gesture (BuildHonoServerImage, run by the executor, never here). A malformed
	// cut is a typed refusal — never a partial scaffold.
	serverDir := filepath.Join(dir, "server")
	if err := os.MkdirAll(serverDir, 0o755); err != nil {
		return Materialised{}, fmt.Errorf("create %s: %w", serverDir, err)
	}
	scaffold, br := honoemit.EmitServerScaffold(projectServerSpec(project, ents))
	if br != nil {
		return Materialised{}, fmt.Errorf("emitter refused the Hono server scaffold (%s): %s", br.Code, br.Explanation)
	}

	// (a3) Emit the React VIEW into <serverDir>/web/ — INSIDE the server's docker build context, so the
	// server Dockerfile's `web` stage runs `vite build` over it and the runtime serves the built dist/
	// (server.ts's serveStatic). This is the project's OWN view DERIVED from its entities (S35) +
	// controls→actions (S11) — the app SERVES it on GET /, not a placeholder. Emission is PURE +
	// deterministic. A malformed cut is a typed refusal, never a partial.
	//
	// With captured ScreenDesign overrides (--screen-design, ADR 0071) the view is emitted via
	// EmitWebChildAdapted (the SAME shared render body) so the validated per-coordinate ADR-0010 token
	// classes are RE-APPLIED on the matching data-aidos-* elements — the design SURVIVES the redeploy
	// (the permanence of the "red"). Without overrides it is byte-identical to EmitWebApp (anti-overwrite §9).
	web, br := emitProjectWebView(project, ents, overrides)
	if br != nil {
		return Materialised{}, fmt.Errorf("emitter refused the React view (%s): %s", br.Code, br.Explanation)
	}
	webDir := filepath.Join(serverDir, "web")
	if err := os.MkdirAll(webDir, 0o755); err != nil {
		return Materialised{}, fmt.Errorf("create %s: %w", webDir, err)
	}

	// (b) Emit the WIRED Pulumi program (3 containers) and land the three files byte-identically.
	arts, br := honoemit.EmitPulumiStackHono(project, env, honoDefaultManifest(project), opts)
	if br != nil {
		return Materialised{}, fmt.Errorf("emitter refused the clean Hono stack (%s): %s", br.Code, br.Explanation)
	}

	files := make(map[string]string, len(arts)+len(scaffold))
	url := ""
	for _, a := range arts {
		name := filepath.Base(a.Path)
		if err := os.WriteFile(filepath.Join(dir, name), a.Bytes, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write %s: %w", name, err)
		}
		files[name] = a.OutputHash
		if a.Target == honoemit.TargetPulumiProgram {
			url = urlFromProgram(a.Bytes)
		}
	}

	// Land the per-project server scaffold under <dir>/server/ (byte-stable). The files key them as
	// "server/<base>" so the result inventory is unambiguous and the idempotence mirror covers them.
	for _, a := range scaffold {
		name := filepath.Base(a.Path)
		if err := os.WriteFile(filepath.Join(serverDir, name), a.Bytes, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write server/%s: %w", name, err)
		}
		files["server/"+name] = a.OutputHash
	}

	// Land the React VIEW under <serverDir>/web/ (byte-stable). Keyed "server/web/<base>" so the result
	// inventory is unambiguous and the idempotence mirror covers it. The server Dockerfile builds it.
	for _, a := range web {
		name := filepath.Base(a.Path)
		if err := os.WriteFile(filepath.Join(webDir, name), a.Bytes, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write server/web/%s: %w", name, err)
		}
		files["server/web/"+name] = a.OutputHash
	}

	return Materialised{
		Project:   project,
		Env:       env,
		Stack:     stack,
		Dir:       dir,
		ServerDir: serverDir,
		ImageTag:  imageTag,
		URL:       url,
		Files:     files,
	}, nil
}

// projectServerSpec builds the Hono ServerSpec from the project's ENTITIES (ents) + the operation cut.
// The served VIEW's entity names drive the READ routes (GET /entities/<e>) and the WebDir serves the
// static React build (GET /). The entities are the SAME cut projectWebSpec(project, ents) lists — ONE
// SOURCE, the server reads exactly what the view lists (no Order/Page mismatch — THE FIX: a Page app's
// server reads /entities/page, not /entities/order, so the sidecar queries the table that EXISTS).
//
// The OPERATIONS cut (the POST /<op> WRITE routes) stays the demo createOrder anchor for now: the Hono
// server emitter (EmitServerScaffold) is a FROZEN contract that REFUSES a spec with zero operations
// (validateServer → ErrNoOps — a server with no verb is not projectable), so a generic project cannot
// emit a truly op-less server until the kernel.operation projection (S17/S31, OpenQuestion) feeds the
// project's own operations. The op cut is HARMLESS on a generic project — the read-only view never calls
// the POST route (projectWebSpec carries NO demo button on a non-empty entity cut), so no checkout button
// reaches a Page app; the mismatch the user reported was the READ side (/entities/order on Page data),
// and THAT now follows the project. A below-the-line projection INPUT, never a truth write.
func projectServerSpec(project string, ents []entities.Entity) honoemit.ServerSpec {
	web := projectWebSpec(project, ents)

	// Operations: resolved by the SINGLE per-project ops seam (projectOps) — the documented wiring point
	// for the operation projector. Today kernel.operation carries no project ops (0 ops in prod; per-project
	// op authoring is the S17/S31 OpenQuestion), so the seam returns the createOrder anchor and this spec is
	// byte-identical to the pre-wiring form (every existing mirror stays green). When the op source lands,
	// projectOps returns the project's OWN operations and the emitted server carries their routes — no other
	// line in this materialiser changes.
	view := projectOps(project)

	entNames := make([]string, 0, len(web.Entities))
	for _, e := range web.Entities {
		entNames = append(entNames, strings.ToLower(e.Name))
	}
	return honoemit.ServerSpec{Project: project, Ops: view, Entities: entNames, WebDir: webBuildDir}
}

// projectOps is the SINGLE SEAM that resolves a project's OPERATION cut (the POST /<op> write routes the
// emitted server carries). It is THE wiring point the operation projector reaches the per-project emission
// path through (appdata.EmitProjectServer / honoemit.EmitServer under the hood — no second projector, ADR
// 0007 reuse).
//
// IT NOW CONSUMES kernel.operation (the rebranchement). When a kernel DSN is available (the env
// AIDOS_KERNEL_DSN — the agent's SELECT-only grant, the wall §2), it READS the project's own operations
// from kernel.operation (appdata.ReadProjectOps: SELECT-only, decode the JSONB AST, PURE map → honoemit.Op
// with Name + Async + Trigger). The emitted server then carries each project op's route (and the worker
// its async dispatchers). It writes NO truth — reading kernel.operation is SELECT-only and the mapping is
// a below-the-line projection.
//
// THE DOCUMENTED FALLBACK (additivity, anti-overwrite §9). When NO DSN is set, OR the read fails (e.g. the
// kernel.operation table not yet migrated — S17/S31 forward-dep), OR the read yields ZERO ops, the seam
// falls back to the createOrder ANCHOR. This is required for two reasons: (1) the gold/demoshop/techstore
// deploy path carries no DSN, so it stays BYTE-IDENTICAL to the pre-rebranchement form (every existing
// mirror green); (2) the Hono server emitter REFUSES a spec with zero operations (validateServer →
// ErrNoOps — a server with no verb is not projectable), so an empty cut would break emission — the anchor
// is the minimal projectable cut, an unused endpoint a read-only view binds no button to.
//
// DETERMINISM-FIRST (§6/§8): the mapping inside ReadProjectOps is a PURE function of the decoded AST (no
// LLM, no clock, no RNG); only the SELECT touches the world, isolated behind the appdata OpSource seam
// (the unit mirror drives it with a MOCK source, never the DB).
func projectOps(project string) []honoemit.Op {
	if dsn := os.Getenv("AIDOS_KERNEL_DSN"); dsn != "" {
		// Read the project's OWN operations from kernel.operation (SELECT-only, the wall §2). A read error
		// or a zero-op cut falls back to the anchor below — the read NEVER breaks the deploy (the gold
		// path stays projectable, the forward-dep table-absent case degrades to the anchor cleanly).
		if ops, err := appdata.ReadProjectOps(context.Background(), dsn, project); err == nil && len(ops) > 0 {
			return ops
		}
	}
	// Fallback: the createOrder anchor (no DSN / read error / zero ops). Byte-identical to the
	// pre-rebranchement form, so the gold/demoshop/techstore deploys are untouched (additive).
	ops := []operation.Operation{operation.CreateOrder()}
	view := make([]honoemit.Op, 0, len(ops))
	for _, op := range ops {
		view = append(view, honoemit.Op{Name: op.Name})
	}
	return view
}

// projectWebSpec builds the React VIEW spec from the project's ENTITIES (S35) — one read-only list view
// per entity, the columns being the entity's attributes in source order (entities.AttributeSet). It is a
// below-the-line projection INPUT, never a truth write; EmitWebApp renders exactly what it pins.
//
// FALLBACK (retro-compat, the gold/zero-entities path): when ents is EMPTY the canonical demo cut is
// restored — the Order entity + the checkout button (control→action → the createOrder anchor) — so the
// gold demo and any zero-entity deploy keep their proven view byte-for-byte (anti-overwrite §9). This is
// the LEAST-SURPRISING fallback: the gold form is what every existing mirror (imagetag/found/materialise)
// already pins, and an empty WebAppSpec would be refused by EmitWebApp (validateWebApp: no entity ∧ no
// button). With ents non-empty the view lists the PROJECT'S entities and carries NO demo button (Buttons
// nil) — a generic project declares no operations/controls yet, so its view is read-only (the listing
// views only; no headless checkout button on data that has no checkout op).
func projectWebSpec(project string, ents []entities.Entity) honoemit.WebAppSpec {
	if len(ents) == 0 {
		// The gold/zero-entities cut: Order + the checkout button → createOrder (byte-identical to the
		// pre-S35-fix form, so every existing mirror stays green).
		return honoemit.WebAppSpec{
			Project:  project,
			Entities: []entities.Entity{entities.Order()},
			Buttons:  []honoemit.ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
		}
	}
	// The generic project cut: the project's OWN entities, read-only (no demo button).
	return honoemit.WebAppSpec{
		Project:  project,
		Entities: append([]entities.Entity(nil), ents...),
		Buttons:  nil,
	}
}

// emitWebViewArtifacts is the SINGLE source the materialiser AND the content-addressed tag use to render
// the web view, applying the captured ScreenDesign overrides (ADR 0071). With NO overrides it is
// byte-identical to honoemit.EmitWebApp (anti-overwrite §9); with overrides it routes through
// EmitWebChildAdapted (re-styling the matching data-aidos-* elements). One function so the tag hashes
// EXACTLY the bytes the materialiser lands (tag ≡ what is built). PURE, TOTAL, byte-stable.
func emitWebViewArtifacts(web honoemit.WebAppSpec, overrides []honoemit.ScreenOverride) ([]honoemit.Artifact, *blockreason.BlockReason) {
	return honoemit.EmitWebAppWithScreenOverrides(web, overrides)
}

// emitProjectWebView renders the project's web view (projectWebSpec for the SAME entity cut `ents`)
// applying the captured ScreenDesign overrides. The thin project-cut wrapper over emitWebViewArtifacts.
// PURE, TOTAL — the view lists the project's entities (or the gold demo cut when ents is empty).
func emitProjectWebView(project string, ents []entities.Entity, overrides []honoemit.ScreenOverride) ([]honoemit.Artifact, *blockreason.BlockReason) {
	return emitWebViewArtifacts(projectWebSpec(project, ents), overrides)
}

// loadScreenOverrides reads the optional --screen-design file into the captured per-coordinate overrides
// (ADR 0071, the permanence of the validated "red"). The file is EITHER a JSON []honoemit.ScreenOverride
// (the per-coordinate overrides directly) OR a JSON []honoemit.ScreenDesign (the captured designs — their
// overrides are folded out). An empty path → nil (no override; the web view is byte-identical to
// EmitWebApp). Detection is deterministic + fail-closed: a []ScreenDesign element carries a child_target
// / overrides shape, a []ScreenOverride element carries a coord shape; a file that decodes to NEITHER is
// an actionable error (never a silent empty). The overrides are returned in input order (the emitter
// sorts them canonically downstream, sortedScreenOverrides — so the bytes are stable regardless of order).
func loadScreenOverrides(path string) ([]honoemit.ScreenOverride, error) {
	if path == "" {
		return nil, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read --screen-design %q: %w", path, err)
	}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "[]" || trimmed == "null" {
		return nil, nil // an empty design file is the no-override case (byte-identical web view).
	}

	// First try the []ScreenDesign shape (the captured designs) — fold every design's overrides out. A
	// design carries a "child_target"/"overrides" shape; a bare []ScreenOverride does not unmarshal a
	// non-empty Overrides slice, so an empty result here means the file is NOT a []ScreenDesign.
	var designs []honoemit.ScreenDesign
	if err := json.Unmarshal(raw, &designs); err == nil {
		var folded []honoemit.ScreenOverride
		for _, d := range designs {
			folded = append(folded, d.Overrides...)
		}
		if len(folded) > 0 {
			return folded, nil
		}
	}

	// Else the []ScreenOverride shape (the per-coordinate overrides directly).
	var overrides []honoemit.ScreenOverride
	if err := json.Unmarshal(raw, &overrides); err == nil && len(overrides) > 0 {
		return overrides, nil
	}

	return nil, fmt.Errorf("--screen-design %q: the file decoded to neither a non-empty []honoemit.ScreenOverride nor a []honoemit.ScreenDesign with overrides", path)
}

// BuildHonoServerImage is the GATED docker gesture (the side-effecting half of "build the per-project
// Hono image"): it runs `docker build -t <tag> <serverDir>` over the emitted scaffold so the `server`
// container runs the PROJECT'S OWN routes, not the generic aidos-hono:latest. It JUDGES nothing — it
// builds exactly the deterministic scaffold MaterialiseHono landed under the tag MaterialiseHono already
// computed (mat.ImageTag — content-addressed over the SAME built bytes, INCLUDING any captured
// ScreenDesign overrides, the SAME tag the wired Pulumi program references via opts.HonoImage). Passing
// the resolved tag (rather than recomputing it) means the build + the program NEVER drift, even when an
// override changed the web bytes. An empty tag falls back to the no-override project tag (compat). It is
// invoked by the executor (PulumiUpHono), never by the pure materialiser, so the unit mirror stays docker-free.
func BuildHonoServerImage(project, serverDir, tag string) (string, error) {
	if serverDir == "" {
		return "", errors.New("BuildHonoServerImage: no scaffold dir (run MaterialiseHono first)")
	}
	if tag == "" {
		// Compat fallback only (the executor always passes mat.ImageTag): the gold/zero-entities tag.
		tag = projectServerImageTag(project, nil, nil)
	}
	cmd := exec.Command("docker", "build", "-t", tag, serverDir)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("docker build %s: %w\n%s", tag, err, out)
	}
	return tag, nil
}

// honoContainers returns the container names the clean Hono stack runs (the wired three), for the
// up/preview result. <stack>-server, <stack>-interpreter, <stack>-db.
func honoContainers(stack string) []string {
	return []string{stack + "-server", stack + "-interpreter", stack + "-db"}
}

// PulumiUpHono runs the full lifecycle over the materialised CLEAN Hono stack (npm install if needed,
// pulumi login, stack select --create, pulumi up --yes), then reports the THREE wired container names.
// It JUDGES nothing — it executes the pure program EmitPulumiStackHono produced. It reuses the same
// gated pulumi helpers as PulumiUp (no fork); only the reported container set differs (3, not 2).
func PulumiUpHono(mat Materialised) (UpResult, error) {
	// Build the PER-PROJECT Hono server image from the emitted scaffold FIRST, so the wired Pulumi
	// program (which references <project>-hono:latest) finds it. The gated docker gesture; the image
	// carries this project's routes (gap closed: the server is no longer the generic placeholder).
	if mat.ServerDir != "" {
		if _, err := BuildHonoServerImage(mat.Project, mat.ServerDir, mat.ImageTag); err != nil {
			return UpResult{}, err
		}
	}
	// Guarantee the sidecar interpreter image exists too (build from cmd/aidosinterpreter/Dockerfile if
	// absent) — the wired program references aidos-interpreter:latest, so `pulumi up` would otherwise fail
	// to pull it on a cold box. The gated docker gesture; idempotent (a warm image skips the build).
	if _, err := EnsureInterpreterImage(); err != nil {
		return UpResult{}, err
	}
	if err := npmInstallIfNeeded(mat.Dir); err != nil {
		return UpResult{}, err
	}
	if err := pulumi(mat.Dir, "login", loginBackend()); err != nil {
		return UpResult{}, err
	}
	if err := pulumi(mat.Dir, "stack", "select", "--create", mat.Stack); err != nil {
		return UpResult{}, err
	}
	if err := pulumi(mat.Dir, "up", "--yes", "--stack", mat.Stack); err != nil {
		return UpResult{}, err
	}
	return UpResult{
		Status:     "up",
		Stack:      mat.Stack,
		Dir:        mat.Dir,
		URL:        mat.URL,
		Containers: honoContainers(mat.Stack),
	}, nil
}
