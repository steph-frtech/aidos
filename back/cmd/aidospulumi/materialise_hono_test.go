package main

// materialise_hono_test.go — le MIROIR de l'exécuteur de la voie HONO/TS PROPRE (déterministe ;
// pulumi non lancé). MaterialiseHono matérialise les TROIS conteneurs câblés (Hono émis + sidecar Go
// + postgres) ; avec --entities il émet AUSSI le schema du projet. On prouve le demi DÉTERMINISTE :
// les fichiers Pulumi câblés (+ schema) sont sur disque, byte-stable, sans jamais exécuter pulumi.

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// TestMaterialiseHono_WiresThreeContainers — MaterialiseHono lands a Pulumi program that wires the
// three containers: the server points the sidecar by name (INTERPRETER_URL), the sidecar points the
// DB (DATABASE_URL), postgres carries POSTGRES_* + healthcheck. No --entities → no schema mount.
func TestMaterialiseHono_WiresThreeContainers(t *testing.T) {
	root := t.TempDir()

	mat, err := MaterialiseHono(root, "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono: %v", err)
	}
	dir := filepath.Join(root, ".deploy-pulumi", "shop-dev")
	if mat.Dir != dir {
		t.Fatalf("dir = %q, want %q", mat.Dir, dir)
	}
	idx, err := os.ReadFile(filepath.Join(dir, "index.ts"))
	if err != nil {
		t.Fatalf("read index.ts: %v", err)
	}
	// The server runs the PER-PROJECT, CONTENT-ADDRESSED image (<project>-hono:<hash12>), built from the
	// emitted scaffold — never the generic image, never the mutable :latest tag. A code change → a new
	// source hash → a new tag → Pulumi recreates the container (the staleness fix). The tag is computed
	// from the SAME source-of-truth function the materialiser/build gesture use, so the test never drifts.
	wantServerTag := projectServerImageTag("shop", nil, nil)
	for _, want := range []string{
		`name: "shop-dev-server"`,
		`name: "shop-dev-interpreter"`,
		`name: "shop-dev-db"`,
		"INTERPRETER_URL=http://shop-dev-interpreter:8080",
		"DATABASE_URL=postgres://app:shop@shop-dev-db:5432/shop?sslmode=disable",
		wantServerTag,
		"aidos-interpreter:latest",
		"pg_isready",
	} {
		if !contains(string(idx), want) {
			t.Fatalf("index.ts missing %q:\n%s", want, string(idx))
		}
	}
	// The server tag is content-addressed: <project>-hono:<12 hex>, NOT the mutable :latest.
	if contains(wantServerTag, ":latest") {
		t.Fatalf("the per-project server tag is still :latest (mutable): %q", wantServerTag)
	}
	if !contains(wantServerTag, "shop-hono:") {
		t.Fatalf("the per-project server tag is not <project>-hono:<hash>: %q", wantServerTag)
	}
	// The generic placeholder must NOT appear — the per-project image replaced it (gap #3 closed).
	if contains(string(idx), "aidos-hono:latest") {
		t.Fatalf("the generic aidos-hono:latest leaked into the program; expected %s:\n%s", wantServerTag, string(idx))
	}
	// The per-project server scaffold landed under server/ (server.ts/index.ts/package.json/Dockerfile).
	for _, base := range []string{"server.ts", "index.ts", "package.json", "Dockerfile"} {
		if _, err := os.Stat(filepath.Join(mat.ServerDir, base)); err != nil {
			t.Fatalf("server scaffold missing %s: %v", base, err)
		}
	}
	// No --entities → no schema mount, no schema.sql file on disk.
	if contains(string(idx), "01-schema.sql") {
		t.Fatalf("a schema mount appeared though no --entities was passed")
	}
	if _, err := os.Stat(filepath.Join(dir, "schema.sql")); err == nil {
		t.Fatalf("schema.sql landed though no --entities was passed")
	}
	if mat.URL != "https://shop-dev.sagedesk.fr" {
		t.Fatalf("url = %q, want the gold domain", mat.URL)
	}
}

// TestMaterialiseHono_WithEntities — with --entities MaterialiseHono emits the project's schema and the
// Pulumi program mounts it (01-schema.sql), still wiring the three containers.
func TestMaterialiseHono_WithEntities(t *testing.T) {
	root := t.TempDir()
	entFile := writeEntitiesFile(t, t.TempDir())

	mat, err := MaterialiseHono(root, "library", "dev", entFile, "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono(entities): %v", err)
	}
	schema, err := os.ReadFile(filepath.Join(mat.Dir, "schema.sql"))
	if err != nil {
		t.Fatalf("read schema.sql: %v", err)
	}
	if !contains(string(schema), "book") || !contains(string(schema), "loan") {
		t.Fatalf("schema.sql missing the project's tables:\n%s", string(schema))
	}
	idx, _ := os.ReadFile(filepath.Join(mat.Dir, "index.ts"))
	for _, want := range []string{
		"/docker-entrypoint-initdb.d/01-schema.sql",
		"INTERPRETER_URL=http://library-dev-interpreter:8080",
	} {
		if !contains(string(idx), want) {
			t.Fatalf("index.ts missing %q:\n%s", want, string(idx))
		}
	}
	if contains(string(idx), "02-seed.sql") {
		t.Fatalf("a seed mount appeared though no --seed was passed")
	}
}

// TestMaterialiseHono_WithSeed — a seed file mounts as 02-seed.sql alongside the schema.
func TestMaterialiseHono_WithSeed(t *testing.T) {
	root := t.TempDir()
	src := t.TempDir()
	entFile := writeEntitiesFile(t, src)
	seedFile := filepath.Join(src, "seed.sql")
	if err := os.WriteFile(seedFile, []byte("INSERT INTO book VALUES ('x','y');\n"), 0o644); err != nil {
		t.Fatalf("write seed: %v", err)
	}

	mat, err := MaterialiseHono(root, "library", "prod", entFile, seedFile, "")
	if err != nil {
		t.Fatalf("MaterialiseHono(seed): %v", err)
	}
	if _, err := os.Stat(filepath.Join(mat.Dir, "seed.sql")); err != nil {
		t.Fatalf("seed.sql not landed: %v", err)
	}
	idx, _ := os.ReadFile(filepath.Join(mat.Dir, "index.ts"))
	if !contains(string(idx), "02-seed.sql") {
		t.Fatalf("seed mount missing though --seed was passed:\n%s", string(idx))
	}
}

// TestMaterialiseHono_Idempotent — same inputs → byte-identical Pulumi file hashes across runs.
func TestMaterialiseHono_Idempotent(t *testing.T) {
	root := t.TempDir()
	a, err := MaterialiseHono(root, "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono #1: %v", err)
	}
	b, err := MaterialiseHono(root, "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono #2: %v", err)
	}
	for name, h1 := range a.Files {
		if h2, ok := b.Files[name]; !ok || h1 != h2 {
			t.Fatalf("file %s hash drifted between runs (%q vs %q)", name, h1, h2)
		}
	}
}

// TestMaterialiseHono_EmitsPerProjectServerScaffold — the per-project Hono server scaffold lands under
// server/ (server.ts carries this project's routes, the Dockerfile boots it), and it is byte-stable
// across runs. This is the deterministic half of gap #3 (the docker build is the gated half).
func TestMaterialiseHono_EmitsPerProjectServerScaffold(t *testing.T) {
	root := t.TempDir()
	mat, err := MaterialiseHono(root, "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono: %v", err)
	}
	// server.ts carries the createOrder route (the project's operation cut) and the interpreter port.
	serverTS, err := os.ReadFile(filepath.Join(mat.ServerDir, "server.ts"))
	if err != nil {
		t.Fatalf("read server/server.ts: %v", err)
	}
	for _, want := range []string{`app.post("/createorder"`, "OperationInterpreter", "deps.interpret"} {
		if !contains(string(serverTS), want) {
			t.Fatalf("server.ts missing %q:\n%s", want, string(serverTS))
		}
	}
	// The boot index.ts forwards auth to the sidecar (gap #2 closed end to end).
	indexTS, _ := os.ReadFile(filepath.Join(mat.ServerDir, "index.ts"))
	if !contains(string(indexTS), "auth: auth ?? {}") {
		t.Fatalf("boot index.ts does not forward auth to the sidecar:\n%s", string(indexTS))
	}
	// Byte-stable: the scaffold file hashes match across a second materialisation.
	again, err := MaterialiseHono(t.TempDir(), "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono #2: %v", err)
	}
	for name, h := range mat.Files {
		if name[:7] != "server/" {
			continue
		}
		if h2, ok := again.Files[name]; !ok || h2 != h {
			t.Fatalf("scaffold file %s hash drifted (%q vs %q)", name, h, h2)
		}
	}
}

// TestMaterialiseHono_MaterialisesWebView — the WEB half: MaterialiseHono ALSO materialises the React
// view (EmitWebApp) under server/web/ (next to the server scaffold, in the server's docker build
// context), the server.ts serves it (serveStatic) and reads the entities (GET /entities/<e>), and the
// server Dockerfile builds the web app. The view is SERVED by the app — not a placeholder.
func TestMaterialiseHono_MaterialisesWebView(t *testing.T) {
	root := t.TempDir()
	mat, err := MaterialiseHono(root, "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono: %v", err)
	}
	webDir := filepath.Join(mat.ServerDir, "web")
	// The emitted React view lands under server/web/ (the server's docker build context): the app
	// composition, the React mount, the HTML shell, the buildable Vite scaffold, and ≥1 list view.
	for _, base := range []string{"app.tsx", "main.tsx", "index.html", "package.json", "vite.config.ts", "OrderList.tsx", "CheckoutButton.tsx"} {
		if _, err := os.Stat(filepath.Join(webDir, base)); err != nil {
			t.Fatalf("web view missing %s under server/web/: %v", base, err)
		}
	}
	// The server SERVES the view: server.ts mounts the static React build + reads the entity.
	serverTS, err := os.ReadFile(filepath.Join(mat.ServerDir, "server.ts"))
	if err != nil {
		t.Fatalf("read server/server.ts: %v", err)
	}
	for _, want := range []string{`serveStatic({ root: "./web/dist" })`, `app.get("/entities/order"`} {
		if !contains(string(serverTS), want) {
			t.Fatalf("server.ts does not serve the view (%q):\n%s", want, string(serverTS))
		}
	}
	// The server Dockerfile builds the React view (vite build) and copies dist/ into the image.
	df, _ := os.ReadFile(filepath.Join(mat.ServerDir, "Dockerfile"))
	for _, want := range []string{"AS web", "run build", "/app/web/dist"} {
		if !contains(string(df), want) {
			t.Fatalf("server Dockerfile does not build/serve the view (%q):\n%s", want, string(df))
		}
	}
	// The web files are tracked in the result inventory (keyed server/web/<base>) and byte-stable.
	again, err := MaterialiseHono(t.TempDir(), "shop", "dev", "", "", "")
	if err != nil {
		t.Fatalf("MaterialiseHono #2: %v", err)
	}
	webKeys := 0
	for name, h := range mat.Files {
		if len(name) >= 11 && name[:11] == "server/web/" {
			webKeys++
			if h2, ok := again.Files[name]; !ok || h2 != h {
				t.Fatalf("web file %s hash drifted (%q vs %q)", name, h, h2)
			}
		}
	}
	if webKeys == 0 {
		t.Fatalf("no server/web/ files were tracked in the result inventory")
	}
}

// TestBuildHonoServerImage_RefusesEmptyDir — the gated docker gesture refuses an empty scaffold dir
// (the honesty rule: never `docker build` an absent context). The actual build is docker-gated and
// not exercised in the unit mirror.
func TestBuildHonoServerImage_RefusesEmptyDir(t *testing.T) {
	if _, err := BuildHonoServerImage("shop", "", ""); err == nil {
		t.Fatalf("BuildHonoServerImage with no scaffold dir was NOT refused")
	}
}

// TestModuleRoot_FindsGoMod — moduleRoot walks up from the test's CWD (cmd/aidospulumi/) to the module
// root (back/, the dir holding go.mod). It is the docker build context for the interpreter image. Pure,
// docker-free — it only stats go.mod.
func TestModuleRoot_FindsGoMod(t *testing.T) {
	root, err := moduleRoot()
	if err != nil {
		t.Fatalf("moduleRoot: %v", err)
	}
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		t.Fatalf("moduleRoot %q does not hold go.mod: %v", root, err)
	}
	// The interpreter Dockerfile must live under that root (the ensure-gesture builds -f against it).
	if _, err := os.Stat(filepath.Join(root, "cmd", "aidosinterpreter", "Dockerfile")); err != nil {
		t.Fatalf("interpreter Dockerfile not under module root %q: %v", root, err)
	}
}

// TestEnsureInterpreterImage_Idempotent — when the interpreter image already exists locally, the gated
// ensure-gesture returns the tag WITHOUT building (idempotent skip). Docker-gated: skipped when docker
// is absent so the rest of the unit mirror stays docker-free. The actual cold build is the gated effect.
func TestEnsureInterpreterImage_Idempotent(t *testing.T) {
	if _, err := exec.LookPath("docker"); err != nil {
		t.Skip("docker not on PATH — the interpreter ensure-gesture is docker-gated")
	}
	if !dockerImageExists(interpreterImageTag) {
		t.Skipf("%s not pre-built — the cold-build half is the gated effect (not exercised here)", interpreterImageTag)
	}
	tag, err := EnsureInterpreterImage()
	if err != nil {
		t.Fatalf("EnsureInterpreterImage (warm): %v", err)
	}
	if tag != interpreterImageTag {
		t.Fatalf("ensure tag = %q, want %q", tag, interpreterImageTag)
	}
}

// TestMaterialiseHono_MissingArgs — an empty project/env is refused (the honesty rule).
func TestMaterialiseHono_MissingArgs(t *testing.T) {
	root := t.TempDir()
	if _, err := MaterialiseHono(root, "", "dev", "", "", ""); err == nil {
		t.Fatalf("missing --project was NOT refused")
	}
	if _, err := MaterialiseHono(root, "p", "", "", "", ""); err == nil {
		t.Fatalf("missing --env was NOT refused")
	}
}
