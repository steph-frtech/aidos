// Command aidospulumi is the REAL gated EXECUTOR of the per-project×env Pulumi stack — the
// side-effecting counterpart of the PURE emitter honoemit.EmitPulumiStack.
//
// Intention (utilisatrice, 2026-06-13): « du Pulumi qui fait les docker par projet » — chaque
// projet = sa propre full-stack, déployée POUR DE VRAI par Pulumi (@pulumi/docker), un stack
// par projet×env, déployable partout (Docker maintenant, cloud demain).
//
// THE TWO HALVES (determinism-first, CLAUDE.md §2/§6/§8):
//
//   - The EMITTER (honoemit.EmitPulumiStack) is a PURE, TOTAL, byte-stable projection of
//     (project, env, manifest) → the Pulumi program + scaffold. It JUDGES, it writes no truth.
//   - The EXECUTOR (this command) is the GATED SIDE-EFFECT — exactly like
//     ai-lab/actions.ts:deployStack runs `docker compose up -d` today. It judges NOTHING: it
//     materialises the emitted artifacts to disk, then drives `pulumi up`/`pulumi destroy` over
//     the emitted program. The program is the truth of WHAT runs; the executor only MAKES it run.
//
// `aidospulumi up   --project <p> --env <e>` :
//
//	(a) materialise the emitter artifacts (index.ts + Pulumi.yaml + package.json) into
//	    .deploy-pulumi/<project>-<env>/ — byte-identical to the emitter output;
//	(b) `npm install` if node_modules is absent;
//	(c) `pulumi login file://$HOME/.pulumi-aidos-state`;
//	(d) `pulumi stack select --create <project>-<env>`;
//	(e) `pulumi up --yes`;
//	then print {url, containers, stack, dir} as JSON.
//
// `aidospulumi down --project <p> --env <e>` : `pulumi destroy --yes` on the stack.
//
// `aidospulumi emit --project <p> --env <e>` : the READ-ONLY half — emit the per-project×env
// Pulumi PROGRAM + scaffold IN MEMORY (no disk write, no pulumi) and print {program, url,
// containers, stack, path} as JSON. This is the front's deterministic preview source (the
// /deploy « programme Pulumi émis » panel reads it) — a pure projection, never a side effect.
//
// PULUMI_CONFIG_PASSPHRASE=aidos and PATH is augmented with ~/.pulumi/bin so the pulumi binary
// (v3.246, installed there) is found. A missing pulumi binary is an ACTIONABLE error (the S13
// honesty shape), never a panic.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/steph-frtech/aidos/back/runtime/honoemit"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	sub := os.Args[1]

	fs := flag.NewFlagSet(sub, flag.ExitOnError)
	project := fs.String("project", "", "the project name (the per-project namespace)")
	env := fs.String("env", "", "the environment (dev|staging|prod)")
	root := fs.String("root", defaultRoot(), "the repo root that holds .deploy-pulumi/")
	entities := fs.String("entities", "", "path to a JSON []EntitySource file — deploys the project's OWN data (opt-in; omit for the gold default)")
	seed := fs.String("seed", "", "optional path to a seed.sql mounted as 02-seed.sql (only with --entities)")
	appName := fs.String("app-name", "", "the human APP_NAME baked into the deployed app (only with --entities; defaults to the project)")
	_ = fs.Parse(os.Args[2:])

	switch sub {
	case "up":
		runUp(*root, *project, *env, *entities, *seed, *appName)
	case "down":
		runDown(*root, *project, *env)
	case "emit":
		runEmit(*project, *env)
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: aidospulumi <up|down|emit> --project <p> --env <e> [--root <repo>] [--entities <f.json> [--seed <f.sql>] [--app-name <name>]]")
	fmt.Fprintln(os.Stderr, "  up   : materialise the emitted Pulumi stack + pulumi up --yes (prints {url, containers} JSON)")
	fmt.Fprintln(os.Stderr, "         with --entities: deploy the project's OWN data (schema+entities[+seed] emitted, mounted by Pulumi)")
	fmt.Fprintln(os.Stderr, "  down : pulumi destroy --yes")
	fmt.Fprintln(os.Stderr, "  emit : print the emitted Pulumi program (in-memory, no pulumi) as JSON — the front preview source")
}

// runUp materialises the emitted artifacts then drives the pulumi lifecycle, printing the result as
// JSON. With --entities it deploys the project's OWN data (schema.sql + entities.json [+ seed.sql]
// emitted by aidosappemit, mounted by the Pulumi program) — the per-project deploy; without it, the
// gold-default topology (byte-identical to the existing executor). Any error is actionable on stderr.
func runUp(root, project, env, entities, seed, appName string) {
	var mat Materialised
	var err error
	if entities != "" {
		// Per-project DATA deploy: emit the project's data + the data-aware Pulumi program AVANT pulumi up.
		mat, err = MaterialiseApp(root, project, env, entities, seed, appName)
	} else {
		mat, err = Materialise(root, project, env)
	}
	if err != nil {
		fail(err)
	}
	res, err := PulumiUp(mat)
	if err != nil {
		fail(err)
	}
	printJSON(res)
}

// runDown destroys the stack.
func runDown(root, project, env string) {
	mat, err := Materialise(root, project, env)
	if err != nil {
		// Even for down we need the program on disk (pulumi reads it); materialise first.
		fail(err)
	}
	res, err := PulumiDown(mat)
	if err != nil {
		fail(err)
	}
	printJSON(res)
}

// runEmit prints the emitted Pulumi program for (project, env) as JSON — the READ-ONLY half. It
// runs NO pulumi and writes NOTHING to disk (a pure projection): the /deploy « programme Pulumi
// émis » panel reads this exact program text. Same input → byte-identical output (the emitter is
// pure, byte-stable).
func runEmit(project, env string) {
	res, err := EmitOnly(project, env)
	if err != nil {
		fail(err)
	}
	printJSON(res)
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "aidospulumi: "+err.Error())
	os.Exit(1)
}

func printJSON(v any) {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		fail(err)
	}
	fmt.Println(string(b))
}

// defaultRoot is the repo root holding .deploy-pulumi/. Overridable with --root (the test pins
// a temp dir so it never touches the real deploy tree).
func defaultRoot() string {
	if r := os.Getenv("AIDOS_REPO"); r != "" {
		return r
	}
	return "/data/dev/aidos"
}

// Materialised is the result of writing the emitter artifacts to disk: the stack identity, the
// working directory, and the URL the emitter computed (so the executor never re-derives it).
type Materialised struct {
	Project string `json:"project"`
	Env     string `json:"env"`
	Stack   string `json:"stack"`
	Dir     string `json:"dir"`
	URL     string `json:"url"`
	// Files maps the materialised filename → its content hash (the byte-stable proof).
	Files map[string]string `json:"files"`
}

// defaultManifest returns the GOLD-proven topology for a project×env: the emitted app server
// (aidos-app:latest, the generic AIDOS shop server) + a postgres datastore, a pgdata volume on
// the datastore, on the EXTERNAL traefik_default network. This is exactly the hand-proven
// .deploy-pulumi/demoshop-dev shape, parameterised by project — one Pulumi stack per project×env.
// (When the DP02 kernel `stack_manifest` kind lands, the executor reads the project's manifest
// from the truth-store instead; today it materialises the gold-proven default. The wall is
// unchanged: this is a below-the-line projection input, never a truth write.)
func defaultManifest(project string) honoemit.StackManifest {
	return honoemit.StackManifest{
		App: project,
		Services: []honoemit.Service{
			{Name: "app", Role: honoemit.RoleServer, Image: "aidos-app:latest", InternalPort: 8080},
			{Name: "db", Role: honoemit.RoleDatastore, Image: "postgres:16-alpine", InternalPort: 5432},
		},
		Volumes: []honoemit.Volume{{Name: "pgdata", Path: "/var/lib/postgresql/data"}},
		Network: honoemit.Network{Name: "traefik_default", External: true},
	}
}

// Materialise renders the emitter artifacts for (project, env) and writes them byte-identically
// into <root>/.deploy-pulumi/<project>-<env>/. It runs NO pulumi (no network, no side effect on
// docker) — purely the deterministic projection landed on disk. The unit test asserts the right
// files are written, byte-stable, without ever executing pulumi.
func Materialise(root, project, env string) (Materialised, error) {
	if project == "" {
		return Materialised{}, errors.New("--project is required")
	}
	if env == "" {
		return Materialised{}, errors.New("--env is required")
	}

	m := defaultManifest(project)
	arts, br := honoemit.EmitPulumiStack(project, env, m)
	if br != nil {
		return Materialised{}, fmt.Errorf("emitter refused the stack (%s): %s", br.Code, br.Explanation)
	}

	stack := project + "-" + env
	dir := filepath.Join(root, ".deploy-pulumi", stack)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Materialised{}, fmt.Errorf("create %s: %w", dir, err)
	}

	files := make(map[string]string, len(arts))
	url := ""
	for _, a := range arts {
		// The emitter Path is gen/<project>/infra/<file>; we land each file by its BASENAME in
		// the stack dir (a Pulumi project is a flat dir: Pulumi.yaml + index.ts + package.json).
		name := filepath.Base(a.Path)
		dst := filepath.Join(dir, name)
		if err := os.WriteFile(dst, a.Bytes, 0o644); err != nil {
			return Materialised{}, fmt.Errorf("write %s: %w", dst, err)
		}
		files[name] = a.OutputHash
		if a.Target == honoemit.TargetPulumiProgram {
			url = urlFromProgram(a.Bytes)
		}
	}

	return Materialised{
		Project: project,
		Env:     env,
		Stack:   stack,
		Dir:     dir,
		URL:     url,
		Files:   files,
	}, nil
}

// EmitResult is the JSON the `emit` gesture prints: the emitted Pulumi PROGRAM text (the
// index.ts), the live URL the program pins, the container names the stack will run, the stack
// identity, and the emitter Path (gen/<project>/infra/index.ts). It is a PURE projection — no
// pulumi, no disk write.
type EmitResult struct {
	Project    string   `json:"project"`
	Env        string   `json:"env"`
	Stack      string   `json:"stack"`
	Path       string   `json:"path"`
	URL        string   `json:"url"`
	Containers []string `json:"containers"`
	// Program is the emitted index.ts text (the Pulumi program the executor would run verbatim).
	Program string `json:"program"`
}

// EmitOnly renders the emitter artifacts for (project, env) IN MEMORY and returns the program
// text + the URL + the container names — running NO pulumi, writing NOTHING to disk. It is the
// READ-ONLY twin of Materialise: same emitter, no side effect. The front's program-preview panel
// reads this. The container names mirror PulumiUp's (<stack>-app, <stack>-db) so the preview
// LISTS the exact containers the deploy will create.
func EmitOnly(project, env string) (EmitResult, error) {
	if project == "" {
		return EmitResult{}, errors.New("--project is required")
	}
	if env == "" {
		return EmitResult{}, errors.New("--env is required")
	}

	m := defaultManifest(project)
	arts, br := honoemit.EmitPulumiStack(project, env, m)
	if br != nil {
		return EmitResult{}, fmt.Errorf("emitter refused the stack (%s): %s", br.Code, br.Explanation)
	}

	stack := project + "-" + env
	res := EmitResult{
		Project:    project,
		Env:        env,
		Stack:      stack,
		Containers: []string{stack + "-app", stack + "-db"},
	}
	for _, a := range arts {
		if a.Target == honoemit.TargetPulumiProgram {
			res.Program = string(a.Bytes)
			res.Path = a.Path
			res.URL = urlFromProgram(a.Bytes)
		}
	}
	return res, nil
}

// urlFromProgram reads the `export const url = "…";` the emitter pins (so the executor never
// re-derives the URL — single source). Empty if the marker is absent.
func urlFromProgram(b []byte) string {
	const marker = "export const url = "
	s := string(b)
	i := strings.Index(s, marker)
	if i < 0 {
		return ""
	}
	rest := s[i+len(marker):]
	// the value is a JSON-quoted string literal terminated by `;`
	j := strings.IndexByte(rest, ';')
	if j < 0 {
		return ""
	}
	var url string
	if err := json.Unmarshal([]byte(strings.TrimSpace(rest[:j])), &url); err != nil {
		return ""
	}
	return url
}

// UpResult is the JSON the `up` gesture prints: the live URL + the container names of the
// running stack + the stack identity + the working dir.
type UpResult struct {
	Status     string   `json:"status"`
	Stack      string   `json:"stack"`
	Dir        string   `json:"dir"`
	URL        string   `json:"url"`
	Containers []string `json:"containers"`
}

// PulumiUp runs the full lifecycle over the materialised stack: npm install (if needed),
// pulumi login, stack select --create, pulumi up --yes. It JUDGES nothing — it executes the
// pure program the emitter produced. Returns the URL + the running container names.
func PulumiUp(mat Materialised) (UpResult, error) {
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
		Containers: []string{mat.Stack + "-app", mat.Stack + "-db"},
	}, nil
}

// PulumiDown destroys the stack (pulumi destroy --yes). It logs in + selects the stack first.
func PulumiDown(mat Materialised) (UpResult, error) {
	if err := pulumi(mat.Dir, "login", loginBackend()); err != nil {
		return UpResult{}, err
	}
	if err := pulumi(mat.Dir, "stack", "select", mat.Stack); err != nil {
		return UpResult{}, err
	}
	if err := pulumi(mat.Dir, "destroy", "--yes", "--stack", mat.Stack); err != nil {
		return UpResult{}, err
	}
	return UpResult{Status: "down", Stack: mat.Stack, Dir: mat.Dir, URL: mat.URL}, nil
}

// loginBackend is the local file backend the build uses (file://$HOME/.pulumi-aidos-state).
func loginBackend() string {
	home, _ := os.UserHomeDir()
	return "file://" + filepath.Join(home, ".pulumi-aidos-state")
}

// npmInstallIfNeeded runs `npm install` in dir iff node_modules is absent (idempotent — a warm
// dir skips the install).
func npmInstallIfNeeded(dir string) error {
	if _, err := os.Stat(filepath.Join(dir, "node_modules")); err == nil {
		return nil // already installed
	}
	cmd := exec.Command("npm", "install")
	cmd.Dir = dir
	cmd.Stdout = os.Stderr // npm chatter to stderr; stdout stays clean for the JSON result
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return actionable("npm", err)
	}
	return nil
}

// pulumi runs the pulumi CLI in dir with the build env (the passphrase + ~/.pulumi/bin on PATH).
// A missing binary surfaces an actionable message (install it / put it on PATH), never a panic.
func pulumi(dir string, args ...string) error {
	bin, err := pulumiBin()
	if err != nil {
		return err
	}
	cmd := exec.Command(bin, args...)
	cmd.Dir = dir
	cmd.Env = pulumiEnv()
	cmd.Stdout = os.Stderr // pulumi chatter to stderr; stdout stays clean for the JSON result
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return actionable("pulumi "+strings.Join(args, " "), err)
	}
	return nil
}

// pulumiBin resolves the pulumi binary: ~/.pulumi/bin/pulumi first (the install location), then
// the PATH. A miss is an actionable error.
func pulumiBin() (string, error) {
	home, _ := os.UserHomeDir()
	cand := filepath.Join(home, ".pulumi", "bin", "pulumi")
	if _, err := os.Stat(cand); err == nil {
		return cand, nil
	}
	if p, err := exec.LookPath("pulumi"); err == nil {
		return p, nil
	}
	return "", errors.New("pulumi binary not found — install it (https://www.pulumi.com/docs/install/) or put it on PATH / at ~/.pulumi/bin/pulumi")
}

// pulumiEnv builds the child env: the build passphrase + ~/.pulumi/bin prepended to PATH so the
// pulumi language plugins resolve.
func pulumiEnv() []string {
	home, _ := os.UserHomeDir()
	env := os.Environ()
	out := make([]string, 0, len(env)+1)
	pathSet := false
	for _, kv := range env {
		if strings.HasPrefix(kv, "PATH=") {
			out = append(out, "PATH="+filepath.Join(home, ".pulumi", "bin")+string(os.PathListSeparator)+kv[len("PATH="):])
			pathSet = true
			continue
		}
		if strings.HasPrefix(kv, "PULUMI_CONFIG_PASSPHRASE=") {
			continue // override below
		}
		out = append(out, kv)
	}
	if !pathSet {
		out = append(out, "PATH="+filepath.Join(home, ".pulumi", "bin"))
	}
	out = append(out, "PULUMI_CONFIG_PASSPHRASE=aidos")
	return out
}

// actionable wraps a command error with the captured output so the operator sees WHY.
func actionable(what string, err error) error {
	return fmt.Errorf("%s failed: %w", what, err)
}
