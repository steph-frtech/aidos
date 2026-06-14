package honoemit

// pulumi_stack_hono.go — LE DÉPLOIEMENT 3-CONTENEURS DE LA VOIE HONO/TS PROPRE (ADR 0040).
//
// Intention (utilisatrice, 2026-06-14) : « déployer l'app ÉMISE DEPUIS LES SPECS, voie Hono/TS PROPRE
// — serveur Hono émis (operations→routes) + SIDECAR INTERPRÉTEUR Go (exécute les operations sur la DB)
// + postgres (schema émis) ». EmitPulumiStackApp (pulumi_stack_app.go) déploie le serveur GÉNÉRIQUE
// aidos-app:latest (storefront/admin Go, lit ENTITIES_PATH) — c'est l'AUTRE voie. CELLE-CI est la voie
// PROPRE : trois conteneurs CÂBLÉS, où le serveur est le HONO ÉMIS (qui route chaque operation vers le
// sidecar) et le sidecar est l'INTERPRÉTEUR Go (qui exécute operation.Interpret sur la DB).
//
// EmitPulumiStackHono(project, env, manifest, opts) calque le GOLD demoshop (priority=1000, certle,
// réseau traefik_default external) ET CÂBLE les trois rôles du jeu fermé :
//
//   - RoleServer       (le HONO ÉMIS) → image HonoImage (aidos-hono:latest par défaut), env
//                      INTERPRETER_URL=http://<stack>-<interpreter>:<port> (le sidecar par NOM de
//                      conteneur) + DATABASE_URL (informatif), le jeu COMPLET de labels Traefik
//                      (Host, websecure, tls, certresolver=le, priority=1000, loadbalancer port) ;
//   - RoleInterpreter  (le SIDECAR Go) → image InterpreterImage (aidos-interpreter:latest), env
//                      DATABASE_URL=postgres://…@<stack>-<db>:5432/<project> + PORT, AUCUN label
//                      Traefik (interne, jamais public — il ne parle qu'au serveur) ;
//   - RoleDatastore    (postgres) → POSTGRES_* + le volume pgdata + (opt-in) le montage du schema
//                      émis (01-schema.sql) + healthcheck pg_isready — exactement le GOLD.
//
// LE MUR (§2). EmitPulumiStackHono est une PROJECTION below-the-line : elle LIT le StackManifest +
// les opts, elle n'écrit AUCUNE vérité. L'exécuteur (aidospulumi up) est le geste GATÉ side-effectant.
//
// DÉTERMINISME-FIRST (§6/§8). FONCTION PURE, TOTALE, byte-stable de (project, env, Canonicalize(
// manifest), opts) — aucune horloge, aucun RNG, ordre de service canonique (le miroir
// pulumi_stack_hono_test.go le scelle). Elle RÉUTILISE le hash de source, les helpers d'image/volume/
// network de pulumi_stack.go — elle ne forke RIEN (anti-overwrite §9). Une cible inconnue / un manifest
// malformé est un BlockReason typé, jamais un render partiel ni un rôle deviné.

import (
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// The default images the clean Hono path mounts. Overridable via StackHonoOpts (a per-project build
// may retag them); the manifest's per-service Image is REWRITTEN to these by role so the topology is
// the clean path regardless of the placeholder images the manifest pinned.
const (
	// defaultHonoImage — the emitted Hono server image (the EmitServerScaffold Dockerfile builds it).
	defaultHonoImage = "aidos-hono:latest"
	// defaultInterpreterImage — the Go sidecar interpreter image (cmd/aidosinterpreter/Dockerfile).
	defaultInterpreterImage = "aidos-interpreter:latest"
)

// The sidecar's internal listen port (the cmd/aidosinterpreter default). The server's INTERPRETER_URL
// targets the interpreter container by name on this port. Declared, never guessed.
const interpreterInternalPort = 8080

// StackHonoOpts is the OPT-IN data-mount + image dimension EmitPulumiStackHono adds. The ZERO value
// renders the wired 3-container topology with the default images and NO data mounts (a valid, runnable
// stack against an empty-but-initialised DB). With DataDir set, the datastore mounts the emitted
// schema (+ optional seed) exactly like the GOLD; with HonoImage/InterpreterImage set, the per-role
// images are overridden (a per-project retag).
type StackHonoOpts struct {
	// DataDir is the host dir holding the emitted schema.sql (+ optional seed.sql) the datastore mounts
	// as initdb 01/02. Empty ⇒ no data mounts (the DB boots empty; the schema arrives via a migration).
	DataDir string
	// SeedPresent reports whether <DataDir>/seed.sql exists and must mount as 02-seed.sql.
	SeedPresent bool
	// HonoImage overrides the emitted-server image. Empty ⇒ aidos-hono:latest.
	HonoImage string
	// InterpreterImage overrides the sidecar image. Empty ⇒ aidos-interpreter:latest.
	InterpreterImage string
}

// EmitPulumiStackHono is the clean Hono-path 3-container stack emitter: the emitted Hono server +
// the Go interpreter sidecar + postgres, wired (server→sidecar via INTERPRETER_URL, sidecar→db via
// DATABASE_URL). It renders the GOLD topology (external traefik_default, priority 1000, certle) with
// the per-role wiring. A malformed input is a typed BlockReason, never a partial render. The artifacts
// come back path-sorted (byte-stable slice).
func EmitPulumiStackHono(project, env string, m StackManifest, opts StackHonoOpts) ([]Artifact, *blockreason.BlockReason) {
	if project == "" {
		br := block(ErrNoProject)
		return nil, &br
	}
	if env == "" {
		br := block(ErrNoEnv)
		return nil, &br
	}
	if err := validateManifest(m); err != nil {
		br := block(err)
		return nil, &br
	}
	if err := validateHonoManifest(m); err != nil {
		br := block(err)
		return nil, &br
	}

	stack := project + "-" + env
	sourceHash, err := stackHonoSourceHash(project, env, m, opts)
	if err != nil {
		br := block(err)
		return nil, &br
	}

	program := emitStackHonoProgram(stack, sourceHash, m, opts)
	scaffoldYAML := emitPulumiYAML(stack, sourceHash)
	scaffoldPkg := emitPulumiPackageJSON(sourceHash)

	dir := "gen/" + project + "/infra/"
	arts := []Artifact{
		artifact(dir+"Pulumi.yaml", TargetPulumiScaffold, scaffoldYAML, sourceHash),
		artifact(dir+"index.ts", TargetPulumiProgram, program, sourceHash),
		artifact(dir+"package.json", TargetPulumiScaffold, scaffoldPkg, sourceHash),
	}
	sortArtifacts(arts)
	return arts, nil
}

// validateHonoManifest checks the manifest declares the clean Hono path's THREE wired roles: a server
// (the Hono server), an interpreter (the Go sidecar) and a datastore (postgres). The server→sidecar
// wiring is meaningless without the interpreter; a clean-path stack with no sidecar is refused (the
// honesty rule — never silently fall back to the generic path). The base validateManifest already
// guarantees a server + closed roles + unique ports.
func validateHonoManifest(m StackManifest) error {
	hasInterpreter := false
	hasDatastore := false
	for _, s := range m.Services {
		switch s.Role {
		case RoleInterpreter:
			hasInterpreter = true
		case RoleDatastore:
			hasDatastore = true
		}
	}
	if !hasInterpreter {
		return ErrNoInterpreter
	}
	if !hasDatastore {
		return ErrNoDatastore
	}
	return nil
}

// ErrNoInterpreter / ErrNoDatastore are the clean-Hono-path causes folded into the block() explanation
// (the S13 shape reused — never a new prison code). The Hono path NEEDS the sidecar + the DB.
var (
	ErrNoInterpreter = fmt.Errorf("honoemit: clean Hono stack declares no service role=interpreter (the sidecar)")
	ErrNoDatastore   = fmt.Errorf("honoemit: clean Hono stack declares no service role=datastore (postgres)")
)

// interpreterOf returns the (canonically-first) interpreter service, or false if none. The server's
// INTERPRETER_URL targets it by container name.
func interpreterOf(m StackManifest) (Service, bool) {
	for _, s := range canonicalServices(m) {
		if s.Role == RoleInterpreter {
			return s, true
		}
	}
	return Service{}, false
}

// stackHonoSourceHash is the content address of a (project, env, manifest, opts) quadruple for the
// clean Hono path. Any byte change (a new image, a data dir appearing) yields a new hash. Reuses S02
// Hash + Canonicalize over the canonical manifest body, prefixed by the stack identity + the opts.
func stackHonoSourceHash(project, env string, m StackManifest, opts StackHonoOpts) (string, error) {
	mb, err := manifestBody(m)
	if err != nil {
		return "", err
	}
	body, err := records.Canonicalize(mustJSON(map[string]any{
		"project":  project,
		"env":      env,
		"manifest": string(mb),
		"path":     "hono", // distinguishes the clean-path hash from the generic stack/app hash.
		"opts": map[string]any{
			"data_dir":          opts.DataDir,
			"seed_present":      opts.SeedPresent,
			"hono_image":        opts.HonoImage,
			"interpreter_image": opts.InterpreterImage,
		},
	}))
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// emitStackHonoProgram renders the GOLD-form Pulumi/TS program for the WIRED 3-container clean Hono
// stack: RemoteImages (the per-role default/overridden images), the external network attach, the
// volume, and one docker.Container per service with the per-role wiring (server: INTERPRETER_URL +
// DATABASE_URL + full Traefik labels ; interpreter: DATABASE_URL + PORT, no labels ; datastore:
// POSTGRES_* + schema mount + healthcheck). FN02-pure: declared inside the exported program() factory.
func emitStackHonoProgram(stack, sourceHash string, m StackManifest, opts StackHonoOpts) []byte {
	// Rewrite the per-role images to the clean-path images (the manifest's placeholder images are
	// superseded by the emitted Hono server + the Go sidecar).
	svcs := rewriteHonoImages(canonicalServices(m), opts)
	ds, hasDS := datastoreOf(m)
	interp, _ := interpreterOf(m)
	domain := stack + "." + stackDomainSuffix

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// Clean Hono-path infra program (Pulumi/functional TS, ADR 0040/0043): the EMITTED Hono\n")
	b.WriteString("// server routes each operation to the Go interpreter SIDECAR, which executes it on postgres.\n")
	fmt.Fprintf(&b, "// Three wired containers, routed at https://%s. One program → all targets.\n", domain)
	b.WriteString("import * as docker from \"@pulumi/docker\";\n\n")

	b.WriteString("export function program() {\n")
	if opts.DataDir != "" {
		// `here` — the host dir holding schema.sql (+ seed.sql) (the GOLD's process.cwd()).
		b.WriteString("\tconst here = process.cwd();\n\n")
	}

	imageVar := emitImages(&b, svcs)

	if m.Network.External {
		b.WriteString("\t// External network (the /data/dockers convention): ATTACH to it, never create it.\n\n")
	} else {
		b.WriteString("\t// Internal network: this stack OWNS it.\n")
		fmt.Fprintf(&b, "\tconst network = new docker.Network(%s, { name: %s });\n\n", jsStr(m.Network.Name), jsStr(m.Network.Name))
	}

	volVar := emitVolumes(&b, stack, m.Volumes)
	netAttach := fmt.Sprintf("networksAdvanced: [{ name: %s }],", jsStr(m.Network.Name))

	containers := make([]string, 0, len(svcs))
	for _, s := range svcs {
		varName := tsIdent(s.Name)
		containers = append(containers, varName)
		cname := stack + "-" + s.Name
		fmt.Fprintf(&b, "\tconst %s = new docker.Container(%s, {\n", varName, jsStr(s.Name))
		fmt.Fprintf(&b, "\t\timage: %s.imageId,\n", imageVar[s.Image])
		fmt.Fprintf(&b, "\t\tname: %s,\n", jsStr(cname))
		b.WriteString("\t\trestart: \"unless-stopped\",\n")

		switch s.Role {
		case RoleDatastore:
			emitDatastoreBodyHono(&b, projectOf(stack), volVar, m.Volumes, netAttach, opts)
		case RoleInterpreter:
			emitInterpreterBody(&b, stack, netAttach, s, ds, hasDS)
		case RoleServer:
			emitServerBodyHono(&b, stack, domain, netAttach, s, ds, hasDS, interp)
		default:
			fmt.Fprintf(&b, "\t\t%s\n", netAttach)
		}
		b.WriteString("\t});\n\n")
	}

	b.WriteString("\treturn { containers: { ")
	b.WriteString(strings.Join(containers, ", "))
	b.WriteString(" }")
	if len(volVar) > 0 {
		vols := make([]string, 0, len(volVar))
		for _, v := range sortedVolNames(volVar) {
			vols = append(vols, volVar[v])
		}
		b.WriteString(", volumes: { ")
		b.WriteString(strings.Join(vols, ", "))
		b.WriteString(" }")
	}
	b.WriteString(" };\n")
	b.WriteString("}\n\n")

	b.WriteString("// The Pulumi entrypoint: instantiate the resource graph + export the stack outputs.\n")
	b.WriteString("export const resources = program();\n")
	fmt.Fprintf(&b, "export const url = %s;\n", jsStr("https://"+domain))

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// rewriteHonoImages returns a copy of svcs with the role=server image set to the Hono image and the
// role=interpreter image set to the interpreter image (defaults or the opts overrides). Pure: it
// copies, never mutates the caller's slice. The datastore/other images are left as the manifest pins.
func rewriteHonoImages(svcs []Service, opts StackHonoOpts) []Service {
	honoImg := opts.HonoImage
	if honoImg == "" {
		honoImg = defaultHonoImage
	}
	interpImg := opts.InterpreterImage
	if interpImg == "" {
		interpImg = defaultInterpreterImage
	}
	out := make([]Service, len(svcs))
	copy(out, svcs)
	for i := range out {
		switch out[i].Role {
		case RoleServer:
			out[i].Image = honoImg
		case RoleInterpreter:
			out[i].Image = interpImg
		}
	}
	return out
}

// emitDatastoreBodyHono renders the datastore body for the clean Hono path: POSTGRES_* envs, the data
// volume, the (opt-in) emitted-schema initdb mounts (01-schema, + 02-seed if present), networking,
// and the pg_isready healthcheck. Identical mount form to the GOLD; the schema is a HOST bind resolved
// from `here` (process.cwd()) only when DataDir is set.
func emitDatastoreBodyHono(b *strings.Builder, dbName string, volVar map[string]string, vols []Volume, netAttach string, opts StackHonoOpts) {
	b.WriteString("\t\tenvs: [\n")
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_DB="+dbName))
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_USER="+pgUser))
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_PASSWORD="+dbName))
	b.WriteString("\t\t],\n")

	b.WriteString("\t\tvolumes: [\n")
	if v, mountPath, ok := firstVolume(volVar, vols); ok {
		fmt.Fprintf(b, "\t\t\t{ volumeName: %s.name, containerPath: %s },\n", v, jsStr(mountPath))
	}
	if opts.DataDir != "" {
		fmt.Fprintf(b, "\t\t\t{ hostPath: `${here}/schema.sql`, containerPath: %s, readOnly: true },\n", jsStr(schemaMountTarget))
		if opts.SeedPresent {
			fmt.Fprintf(b, "\t\t\t{ hostPath: `${here}/seed.sql`, containerPath: %s, readOnly: true },\n", jsStr(seedMountTarget))
		}
	}
	b.WriteString("\t\t],\n")

	fmt.Fprintf(b, "\t\t%s\n", netAttach)
	b.WriteString("\t\thealthcheck: {\n")
	fmt.Fprintf(b, "\t\t\ttests: [\"CMD-SHELL\", %s],\n", jsStr(fmt.Sprintf("pg_isready -U %s -d %s", pgUser, dbName)))
	b.WriteString("\t\t\tinterval: \"3s\",\n")
	b.WriteString("\t\t\ttimeout: \"3s\",\n")
	b.WriteString("\t\t\tretries: 20,\n")
	b.WriteString("\t\t},\n")
}

// emitInterpreterBody renders the Go sidecar interpreter body: the DATABASE_URL env (pointing the
// datastore by its container name <stack>-<db>:5432) + the PORT env, networking, and NO Traefik labels
// (the sidecar is internal — only the Hono server talks to it). It is the runtime that executes
// operation.Interpret on the emitted schema (ADR 0040 Déc.7).
func emitInterpreterBody(b *strings.Builder, stack, netAttach string, s, ds Service, hasDS bool) {
	port := s.InternalPort
	if port == 0 {
		port = interpreterInternalPort
	}
	b.WriteString("\t\tenvs: [\n")
	if hasDS {
		dbName := projectOf(stack)
		dbHost := stack + "-" + ds.Name
		url := fmt.Sprintf("DATABASE_URL=postgres://%s:%s@%s:5432/%s?sslmode=disable", pgUser, dbName, dbHost, dbName)
		fmt.Fprintf(b, "\t\t\t%s,\n", jsStr(url))
	}
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr(fmt.Sprintf("PORT=%d", port)))
	b.WriteString("\t\t],\n")
	fmt.Fprintf(b, "\t\t%s\n", netAttach)
	// No Traefik labels: the sidecar is internal (docker_internal), never public-facing.
}

// emitServerBodyHono renders the emitted Hono server body: the INTERPRETER_URL env (pointing the
// sidecar by its container name <stack>-<interpreter>:<port> — the wiring), a DATABASE_URL env (so
// the server can surface read models if needed), networking, and the COMPLETE Traefik label set
// (the only public-facing service). It calques the GOLD server container, adding the sidecar wiring.
func emitServerBodyHono(b *strings.Builder, stack, domain, netAttach string, s, ds Service, hasDS bool, interp Service) {
	interpHost := stack + "-" + interp.Name
	interpPort := interp.InternalPort
	if interpPort == 0 {
		interpPort = interpreterInternalPort
	}
	b.WriteString("\t\tenvs: [\n")
	// THE WIRING: the server routes every operation to the sidecar at this URL.
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr(fmt.Sprintf("INTERPRETER_URL=http://%s:%d", interpHost, interpPort)))
	if hasDS {
		dbName := projectOf(stack)
		dbHost := stack + "-" + ds.Name
		url := fmt.Sprintf("DATABASE_URL=postgres://%s:%s@%s:5432/%s?sslmode=disable", pgUser, dbName, dbHost, dbName)
		fmt.Fprintf(b, "\t\t\t%s,\n", jsStr(url))
	}
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr(fmt.Sprintf("PORT=%d", s.InternalPort)))
	b.WriteString("\t\t],\n")

	fmt.Fprintf(b, "\t\t%s\n", netAttach)
	b.WriteString("\t\tlabels: [\n")
	b.WriteString("\t\t\t{ label: \"traefik.enable\", value: \"true\" },\n")
	fmt.Fprintf(b, "\t\t\t{ label: %s, value: %s },\n",
		jsStr("traefik.http.routers."+stack+".rule"), hostRuleLiteral(domain))
	fmt.Fprintf(b, "\t\t\t{ label: %s, value: %s },\n",
		jsStr("traefik.http.routers."+stack+".priority"), jsStr(serverRouterPriority))
	fmt.Fprintf(b, "\t\t\t{ label: %s, value: \"websecure\" },\n",
		jsStr("traefik.http.routers."+stack+".entrypoints"))
	fmt.Fprintf(b, "\t\t\t{ label: %s, value: \"true\" },\n",
		jsStr("traefik.http.routers."+stack+".tls"))
	fmt.Fprintf(b, "\t\t\t{ label: %s, value: %s },\n",
		jsStr("traefik.http.routers."+stack+".tls.certresolver"), jsStr(certResolver))
	fmt.Fprintf(b, "\t\t\t{ label: %s, value: %s },\n",
		jsStr("traefik.http.services."+stack+".loadbalancer.server.port"), jsStr(fmt.Sprintf("%d", s.InternalPort)))
	b.WriteString("\t\t],\n")
}
