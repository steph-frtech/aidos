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
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/appdata"
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
			// InterpreterImage). MaterialiseHono sets opts.HonoImage to the per-project tag
			// (<project>-hono:latest) so the server runs THIS project's routes, not the generic image.
			{Name: "server", Role: honoemit.RoleServer, Image: "aidos-hono:latest", InternalPort: 3000},
			{Name: "interpreter", Role: honoemit.RoleInterpreter, Image: "aidos-interpreter:latest", InternalPort: 8080},
			{Name: "db", Role: honoemit.RoleDatastore, Image: "postgres:16-alpine", InternalPort: 5432},
		},
		Volumes: []honoemit.Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	}
}

// honoServerImageTag is the deterministic per-project server image tag (<project>-hono:latest) the
// scaffold builds into and the manifest references. One source of truth shared by the manifest and
// the build gesture so they never drift.
func honoServerImageTag(project string) string { return project + "-hono:latest" }

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
func MaterialiseHono(root, project, env, entitiesPath, seedPath string) (Materialised, error) {
	if project == "" {
		return Materialised{}, errors.New("--project is required")
	}
	if env == "" {
		return Materialised{}, errors.New("--env is required")
	}

	stack := project + "-" + env
	dir := filepath.Join(root, ".deploy-pulumi", stack)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Materialised{}, fmt.Errorf("create %s: %w", dir, err)
	}

	// The server runs the PER-PROJECT image (<project>-hono:latest), built from the emitted scaffold
	// below. EmitPulumiStackHono rewrites the role=server image to this, so the wired Pulumi program
	// references the project's own routes — never the generic aidos-hono:latest placeholder.
	opts := honoemit.StackHonoOpts{HonoImage: honoServerImageTag(project)}

	// (a) Optional project DATA: emit the schema (+ seed) into the stack dir — what postgres mounts.
	if entitiesPath != "" {
		entities, err := loadEntities(entitiesPath)
		if err != nil {
			return Materialised{}, err
		}
		schema, _, err := appdata.EmitProjectData(project, entities)
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
	scaffold, br := honoemit.EmitServerScaffold(projectServerSpec(project))
	if br != nil {
		return Materialised{}, fmt.Errorf("emitter refused the Hono server scaffold (%s): %s", br.Code, br.Explanation)
	}

	// (a3) Emit the React VIEW (EmitWebApp) into <serverDir>/web/ — INSIDE the server's docker build
	// context, so the server Dockerfile's `web` stage runs `vite build` over it and the runtime serves
	// the built dist/ (server.ts's serveStatic). This is the project's OWN view DERIVED from its
	// entities (S35) + controls→actions (S11) — the app SERVES it on GET /, not a placeholder. Emission
	// is PURE + deterministic (EmitWebApp, S38-bis). A malformed cut is a typed refusal, never a partial.
	web, br := honoemit.EmitWebApp(projectWebSpec(project))
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
		URL:       url,
		Files:     files,
	}, nil
}

// projectServerSpec builds the Hono ServerSpec from the project's operation cut — the SAME cut the
// sidecar registers (today the createOrder anchor; when the kernel.operation projection lands, the
// executor reads the project's operations from the truth-store). It is a below-the-line projection
// INPUT, never a truth write; the emitter renders exactly the ops it pins (one POST route per op).
//
// It ALSO carries the served VIEW: the entity names the list views read (so the server emits the read
// route GET /entities/<e>) and the WebDir (so the server serves the static React build on GET /). The
// entities are the SAME cut projectWebSpec lists — one source, the server reads what the view lists.
func projectServerSpec(project string) honoemit.ServerSpec {
	ops := []operation.Operation{operation.CreateOrder()}
	view := make([]honoemit.Op, 0, len(ops))
	for _, op := range ops {
		view = append(view, honoemit.Op{Name: op.Name})
	}
	web := projectWebSpec(project)
	ents := make([]string, 0, len(web.Entities))
	for _, e := range web.Entities {
		ents = append(ents, strings.ToLower(e.Name))
	}
	return honoemit.ServerSpec{Project: project, Ops: view, Entities: ents, WebDir: webBuildDir}
}

// projectWebSpec builds the React VIEW spec from the project's entities (S35) + control→action cut
// (S11) — the SAME tree the server serves. Today the demo cut (Order + the checkout button → createOrder
// anchor); when the kernel projections land, the executor reads the project's entities/controls from the
// truth-store. It is a below-the-line projection INPUT, never a truth write; EmitWebApp renders exactly
// what it pins (one list view per entity, one button per control→action).
func projectWebSpec(project string) honoemit.WebAppSpec {
	return honoemit.WebAppSpec{
		Project:  project,
		Entities: []entities.Entity{entities.Order()},
		Buttons:  []honoemit.ControlAction{{Control: control.CheckoutButton(), Action: action.CheckoutSubmit()}},
	}
}

// BuildHonoServerImage is the GATED docker gesture (the side-effecting half of "build the per-project
// Hono image"): it runs `docker build -t <project>-hono:latest <serverDir>` over the emitted scaffold
// so the `server` container runs the PROJECT'S OWN routes, not the generic aidos-hono:latest. It
// JUDGES nothing — it builds exactly the deterministic scaffold MaterialiseHono landed. It is invoked
// by the executor (PulumiUpHono), never by the pure materialiser, so the unit mirror stays docker-free.
// The image tag is deterministic (<project>-hono:latest); the build is the gated effect.
func BuildHonoServerImage(project, serverDir string) (string, error) {
	if serverDir == "" {
		return "", errors.New("BuildHonoServerImage: no scaffold dir (run MaterialiseHono first)")
	}
	tag := honoServerImageTag(project)
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
		if _, err := BuildHonoServerImage(mat.Project, mat.ServerDir); err != nil {
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
