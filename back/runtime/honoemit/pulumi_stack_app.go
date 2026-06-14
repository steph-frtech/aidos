package honoemit

// pulumi_stack_app.go — L'ÉMISSION PAR PROJET, OPT-IN (la généralisation de la PREUVE EN OR).
//
// Intention (utilisatrice, 2026-06-14) : « aidospulumi up --project X déploie la VRAIE app de X avec
// les PROPRES entités de X — plus le seed Alpha Shop hardwiré ». Pulumi reste LE moteur (il monte les
// conteneurs) ; aidosappemit n'émet que les DONNÉES (schema.sql + entities.json) que Pulumi MONTE. La
// forme cible est prouvée par .deploy-pulumi/demoshop-dev/index.ts (le GOLD) : le datastore monte
// schema.sql → /docker-entrypoint-initdb.d/01-schema.sql (+ 02-seed.sql), l'app monte entities.json →
// /app/entities.json + env ENTITIES_PATH + APP_NAME + image aidos-app:latest, priority 1000, certle.
//
// EmitPulumiStackApp(project, env, manifest, opts) ÉTEND EmitPulumiStack de façon STRICTEMENT
// ADDITIVE (anti-overwrite §9) :
//
//   - opts ZÉRO (DataDir == "") ⇒ AUCUN montage de données, AUCUN APP_NAME, l'image reste celle du
//     manifest : la sortie est BYTE-IDENTIQUE à EmitPulumiStack (le miroir le scelle, les tests
//     honoemit existants restent verts) ;
//   - opts.DataDir != "" ⇒ EN PLUS de la topologie GOLD, les MONTAGES de données : le datastore monte
//     <DataDir>/schema.sql → 01-schema.sql (+ <DataDir>/seed.sql → 02-seed.sql si SeedPresent) ; le
//     serveur monte <DataDir>/entities.json → /app/entities.json, porte ENTITIES_PATH + APP_NAME, et
//     son image devient AppImage (aidos-app:latest par défaut) — exactement le GOLD demoshop index.ts.
//
// DÉTERMINISME-FIRST (le mur, §2/§6/§8). EmitPulumiStackApp est une FONCTION PURE, TOTALE, byte-stable
// de (project, env, Canonicalize(manifest), opts) — aucune horloge, aucun RNG, ordre de service
// canonique. Elle n'écrit AUCUNE vérité (une projection below-the-line). L'EXÉCUTEUR (aidospulumi up,
// aidosappemit run) est le geste GATÉ side-effectant. Elle RÉUTILISE EmitPulumiStack/le hash de source
// — elle ne forke rien : un manifest sans données reste la projection GOLD inchangée.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// defaultAppImage is the generic AIDOS app server image the GOLD mounts (the storefront/admin server
// reading DATABASE_URL + APP_NAME + ENTITIES_PATH). Overridable via StackAppOpts.AppImage.
const defaultAppImage = "aidos-app:latest"

// The mount targets the GOLD proves (the /data/dockers + postgres initdb convention).
const (
	// schemaMountTarget — the datastore mounts the emitted schema as initdb 01 (runs first).
	schemaMountTarget = "/docker-entrypoint-initdb.d/01-schema.sql"
	// seedMountTarget — the optional seed mounts as initdb 02 (runs AFTER the schema).
	seedMountTarget = "/docker-entrypoint-initdb.d/02-seed.sql"
	// entitiesMountTarget — the app server mounts the emitted entities.json here.
	entitiesMountTarget = "/app/entities.json"
)

// StackAppOpts is the OPT-IN data-mount dimension EmitPulumiStackApp adds to the proven stack
// emitter. The ZERO value (DataDir == "") reproduces EmitPulumiStack byte-for-byte (anti-overwrite).
// When DataDir is set, the emitter mounts the per-project data aidosappemit produced.
type StackAppOpts struct {
	// DataDir is the host directory holding the emitted schema.sql + entities.json (+ optional
	// seed.sql). It is the working directory the executor materialises into (the Pulumi project dir);
	// the GOLD used process.cwd(). Empty ⇒ no data mounts (byte-identical to EmitPulumiStack).
	DataDir string
	// AppName is the human app name baked into the server's APP_NAME env (the GOLD title-cased the
	// project). Empty + DataDir set ⇒ defaults to the project name.
	AppName string
	// SeedPresent reports whether <DataDir>/seed.sql exists and must be mounted as 02-seed.sql.
	SeedPresent bool
	// AppImage overrides the server image (the generic AIDOS app server). Empty + DataDir set ⇒
	// defaults to aidos-app:latest (the GOLD image). Ignored when DataDir == "".
	AppImage string
}

// hasData reports whether the opts request the per-project data mounts (DataDir set).
func (o StackAppOpts) hasData() bool { return o.DataDir != "" }

// EmitPulumiStackApp is the OPT-IN per-project data-aware stack emitter. With a ZERO StackAppOpts it
// delegates VERBATIM to EmitPulumiStack (byte-identical — the anti-overwrite guarantee). With
// DataDir set it renders the SAME topology PLUS the GOLD data mounts (schema/seed on the datastore,
// entities.json on the server) + the APP_NAME env + the aidos-app:latest image. A malformed input is
// a typed BlockReason (the honesty rule), never a partial render.
func EmitPulumiStackApp(project, env string, m StackManifest, opts StackAppOpts) ([]Artifact, *blockreason.BlockReason) {
	if !opts.hasData() {
		// No data requested ⇒ the proven emitter, untouched (anti-overwrite §9). Byte-identical.
		return EmitPulumiStack(project, env, m)
	}
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

	stack := project + "-" + env
	// The source hash folds the opts in (a different DataDir/AppName/seed ⇒ a different program), so
	// the data-aware program is content-addressed to (project, env, manifest, opts) — never collides
	// with the no-data projection's hash.
	sourceHash, err := stackAppSourceHash(project, env, m, opts)
	if err != nil {
		br := block(err)
		return nil, &br
	}

	program := emitStackAppProgram(stack, sourceHash, m, opts)
	scaffoldYAML := emitPulumiYAML(stack, sourceHash)
	scaffoldPkg := emitPulumiPackageJSON(sourceHash)

	dir := "gen/" + project + "/infra/"
	arts := []Artifact{
		artifact(dir+"Pulumi.yaml", TargetPulumiScaffold, scaffoldYAML, sourceHash),
		artifact(dir+"index.ts", TargetPulumiProgram, program, sourceHash),
		artifact(dir+"package.json", TargetPulumiScaffold, scaffoldPkg, sourceHash),
	}
	sort.SliceStable(arts, func(i, j int) bool { return arts[i].Path < arts[j].Path })
	return arts, nil
}

// stackAppSourceHash is the content address of a (project, env, manifest, opts) quadruple. Any byte
// change (a new DataDir, a different AppName, a seed appearing) yields a new hash. Reuses S02 Hash +
// Canonicalize over the same canonical manifest body, prefixed by the stack identity + the opts body.
func stackAppSourceHash(project, env string, m StackManifest, opts StackAppOpts) (string, error) {
	mb, err := manifestBody(m)
	if err != nil {
		return "", err
	}
	body, err := records.Canonicalize(mustJSON(map[string]any{
		"project":  project,
		"env":      env,
		"manifest": string(mb),
		"opts": map[string]any{
			"data_dir":     opts.DataDir,
			"app_name":     opts.AppName,
			"seed_present": opts.SeedPresent,
			"app_image":    opts.AppImage,
		},
	}))
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// emitStackAppProgram renders the GOLD-form Pulumi/TS program WITH the per-project data mounts. It
// mirrors emitStackProgram exactly, threading the data opts into the datastore + server bodies. The
// `here` binding (process.cwd()) resolves the host data dir at run-time — the GOLD form verbatim.
// FN02-pure: declared inside the exported program() factory, no module-scope mutable binding.
func emitStackAppProgram(stack, sourceHash string, m StackManifest, opts StackAppOpts) []byte {
	svcs := canonicalServices(m)
	ds, hasDS := datastoreOf(m)
	domain := stack + "." + stackDomainSuffix

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// Per-project×env infra program (Pulumi/functional TS, ADR 0043) WITH the project's\n")
	b.WriteString("// OWN data: the datastore mounts the emitted schema (+ seed), the app mounts the emitted\n")
	fmt.Fprintf(&b, "// entities.json + carries APP_NAME. Routed at https://%s. One program → all targets.\n", domain)
	b.WriteString("import * as docker from \"@pulumi/docker\";\n\n")

	b.WriteString("export function program() {\n")
	// `here` — the host dir holding schema.sql / entities.json / seed.sql (the GOLD's process.cwd()).
	b.WriteString("\tconst here = process.cwd();\n\n")

	// RemoteImage per DISTINCT image (canonical order), kept locally on destroy. The server image is
	// REWRITTEN to the generic app image before computing the distinct-image set, so the app boots
	// the aidos-app server (the GOLD), not the manifest's placeholder image.
	appImage := opts.AppImage
	if appImage == "" {
		appImage = defaultAppImage
	}
	svcs = rewriteServerImage(svcs, appImage)
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
			emitDatastoreBodyApp(&b, projectOf(stack), volVar, m.Volumes, netAttach, opts)
		case RoleServer:
			emitServerBodyApp(&b, stack, domain, netAttach, s, ds, hasDS, opts)
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

// rewriteServerImage returns a copy of svcs with every role=server service's Image set to appImage
// (the generic AIDOS app server). Pure: it copies, never mutates the caller's slice.
func rewriteServerImage(svcs []Service, appImage string) []Service {
	out := make([]Service, len(svcs))
	copy(out, svcs)
	for i := range out {
		if out[i].Role == RoleServer {
			out[i].Image = appImage
		}
	}
	return out
}

// emitDatastoreBodyApp renders the datastore body WITH the data mounts: the POSTGRES_* envs, the data
// volume mount, then the GOLD initdb mounts (schema.sql → 01-schema.sql, + seed.sql → 02-seed.sql if
// present), networking, and the pg_isready healthcheck. The schema/seed are HOST binds resolved from
// `here` (process.cwd()) — the GOLD form verbatim.
func emitDatastoreBodyApp(b *strings.Builder, dbName string, volVar map[string]string, vols []Volume, netAttach string, opts StackAppOpts) {
	b.WriteString("\t\tenvs: [\n")
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_DB="+dbName))
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_USER="+pgUser))
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_PASSWORD="+dbName))
	b.WriteString("\t\t],\n")

	// The data volume + the initdb mounts (schema, then optional seed) — the GOLD mount set.
	b.WriteString("\t\tvolumes: [\n")
	if v, mountPath, ok := firstVolume(volVar, vols); ok {
		fmt.Fprintf(b, "\t\t\t{ volumeName: %s.name, containerPath: %s },\n", v, jsStr(mountPath))
	}
	fmt.Fprintf(b, "\t\t\t{ hostPath: `${here}/schema.sql`, containerPath: %s, readOnly: true },\n", jsStr(schemaMountTarget))
	if opts.SeedPresent {
		fmt.Fprintf(b, "\t\t\t{ hostPath: `${here}/seed.sql`, containerPath: %s, readOnly: true },\n", jsStr(seedMountTarget))
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

// emitServerBodyApp renders the server body WITH the data wiring: the DATABASE_URL env, the
// ENTITIES_PATH env, the APP_NAME env (the human app title), the entities.json HOST mount, networking,
// and the COMPLETE Traefik label set. It calques the GOLD demoshop index.ts server container.
func emitServerBodyApp(b *strings.Builder, stack, domain, netAttach string, s, ds Service, hasDS bool, opts StackAppOpts) {
	appName := opts.AppName
	if appName == "" {
		appName = projectOf(stack)
	}
	b.WriteString("\t\tenvs: [\n")
	if hasDS {
		dbName := projectOf(stack)
		dbHost := stack + "-" + ds.Name
		url := fmt.Sprintf("DATABASE_URL=postgres://%s:%s@%s:5432/%s?sslmode=disable", pgUser, dbName, dbHost, dbName)
		fmt.Fprintf(b, "\t\t\t%s,\n", jsStr(url))
	}
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("ENTITIES_PATH="+entitiesMountTarget))
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("APP_NAME="+appName))
	b.WriteString("\t\t],\n")

	// The entities.json HOST mount (the GOLD form) — the generic app server reads it at boot.
	b.WriteString("\t\tvolumes: [\n")
	fmt.Fprintf(b, "\t\t\t{ hostPath: `${here}/entities.json`, containerPath: %s, readOnly: true },\n", jsStr(entitiesMountTarget))
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
