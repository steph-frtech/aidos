package honoemit

// THE GENERALISED PER-PROJECT×ENV PULUMI EMITTER (the GOLD form).
//
// Intention (utilisatrice, 2026-06-13): « du Pulumi qui fait les docker par projet » — chaque
// projet = sa propre full-stack complète, déployée POUR DE VRAI par Pulumi (@pulumi/docker),
// un stack par projet×env, déployable partout (Docker maintenant, cloud demain).
//
// EmitPulumiStack(project, env, manifest) generalises the HAND-PROVEN GOLD
// .deploy-pulumi/demoshop-dev/index.ts — a real demoshop-dev stack (postgres healthy + whoami)
// on the EXTERNAL traefik_default network, routed at https://demoshop-dev.sagedesk.fr with a
// real Let's-Encrypt cert. It produces EXACTLY that mechanism, generalised:
//
//   - RemoteImage{keepLocally:true} per distinct image (never prune the shared base images);
//   - the EXTERNAL network is ATTACHED (networksAdvanced name=…), NEVER created (no docker.Network)
//     when Network.External; an internal network IS created (new docker.Network);
//   - one docker.Volume <stack>-<vol> + the mount on the datastore;
//   - the datastore with POSTGRES_* envs + a pg_isready healthcheck;
//   - the server with DATABASE_URL pointing the datastore by its container name <stack>-<db>:5432,
//     and the COMPLETE Traefik label set: Host(`<stack>.sagedesk.fr`), websecure, tls,
//     tls.certresolver=le, priority=1000 (to SUPERSEDE the *-dev wildcard placeholder), and the
//     loadbalancer.server.port;
//   - PER project×env naming: containers <project>-<env>-<service>, volume <project>-<env>-<vol>,
//     stack <project>-<env>.
//
// It ALSO emits the Pulumi scaffold so `pulumi up` boots: Pulumi.yaml + package.json, all under
// gen/<project>/infra/.
//
// DETERMINISM-FIRST (the wall, §2/§6/§8). EmitPulumiStack is a PURE, TOTAL, byte-stable function
// of (project, env, Canonicalize(manifest)) — same input → byte-identical artifacts (the
// reproducibility mirror, pulumi_stack_test.go). The EXECUTOR (pulumi up/destroy) is the GATED
// side-effecting gesture (like `docker compose up -d` is today in ai-lab/actions.ts:deployStack);
// it judges nothing, it executes the emitted program. The emitter writes NO truth (a below-the-
// line projection). It reuses records.Hash (S02) and the honoemit Artifact + BlockReason shapes
// — it forks none of them; the StackManifest stays the single SOURCE; the compose-emit stays a
// derivable projection (anti-overwrite §9).

import (
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// The frozen deployment constants the GOLD proves (the /data/dockers + Traefik convention).
const (
	// stackDomainSuffix — every per-project×env stack is routed at <stack>.sagedesk.fr.
	stackDomainSuffix = "sagedesk.fr"
	// certResolver — the Traefik ACME resolver name (Let's-Encrypt) the gold cert used.
	certResolver = "le"
	// serverRouterPriority — the exact-host router PRIMES the *-dev wildcard placeholder
	// (HostRegexp `*-dev.sagedesk.fr`): Traefik priority = rule length by default, so a long
	// regex would otherwise win; a high explicit priority makes the real per-project deploy win.
	serverRouterPriority = "1000"
	// the canonical Postgres credentials baked into the datastore + the DATABASE_URL (a dev
	// default; a per-environment secret projection — EPIC B — supersedes it later, no fork here).
	pgUser = "app"
)

// Errors for the stack emitter boundary (folded into the existing block() explanation; no new
// BlockReason code — honesty rule reused, never a new prison code).
// (ErrNoProject is reused for an empty project; we add an env sentinel below.)

// EmitPulumiStack renders the per-project×env Pulumi program + scaffold for the manifest. It is
// the generalised, gold-proven counterpart of EmitPulumiProgram (which stays byte-stable for the
// preview/DP25 callers). Returns the artifacts in a FIXED order (Pulumi.yaml, index.ts,
// package.json — path-sorted) so the slice is byte-stable. A malformed input is a typed
// BlockReason, never a partial render.
func EmitPulumiStack(project, env string, m StackManifest) ([]Artifact, *blockreason.BlockReason) {
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
	sourceHash, err := stackSourceHash(project, env, m)
	if err != nil {
		br := block(err)
		return nil, &br
	}

	program := emitStackProgram(stack, sourceHash, m)
	scaffoldYAML := emitPulumiYAML(stack, sourceHash)
	scaffoldPkg := emitPulumiPackageJSON(sourceHash)

	dir := "gen/" + project + "/infra/"
	arts := []Artifact{
		artifact(dir+"Pulumi.yaml", TargetPulumiScaffold, scaffoldYAML, sourceHash),
		artifact(dir+"index.ts", TargetPulumiProgram, program, sourceHash),
		artifact(dir+"package.json", TargetPulumiScaffold, scaffoldPkg, sourceHash),
	}
	// FIXED, path-sorted order so the artifact slice is itself byte-stable.
	sort.SliceStable(arts, func(i, j int) bool { return arts[i].Path < arts[j].Path })
	return arts, nil
}

// stackSourceHash is the content address of a (project, env, manifest) triple. Any byte change
// (a new service, a retargeted image, a different env) yields a new hash. Reuses S02 Hash +
// Canonicalize over the same canonical manifest body, prefixed by the stack identity.
func stackSourceHash(project, env string, m StackManifest) (string, error) {
	mb, err := manifestBody(m)
	if err != nil {
		return "", err
	}
	body, err := records.Canonicalize(mustJSON(map[string]any{
		"project":  project,
		"env":      env,
		"manifest": string(mb),
	}))
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

// datastoreOf returns the (canonically-first) datastore service, or false if the manifest pins
// none. The server's DATABASE_URL and the volume mount target it.
func datastoreOf(m StackManifest) (Service, bool) {
	for _, s := range canonicalServices(m) {
		if s.Role == RoleDatastore {
			return s, true
		}
	}
	return Service{}, false
}

// emitStackProgram renders the GOLD-form Pulumi/TS program for the stack: RemoteImages, the
// network (attached if external, created otherwise), the volume, and one docker.Container per
// service with the per-role wiring (datastore envs+healthcheck+mount ; server DATABASE_URL+full
// Traefik labels). FN02-pure: declared inside an exported program() factory, no module-scope
// mutable binding; the scaffold index.ts calls program().
func emitStackProgram(stack, sourceHash string, m StackManifest) []byte {
	svcs := canonicalServices(m)
	ds, hasDS := datastoreOf(m)
	domain := stack + "." + stackDomainSuffix

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// Per-project×env infra program (Pulumi/functional TS, ADR 0043). StackManifest →\n")
	b.WriteString("// one docker.Container per service on the shared Traefik network, routed at\n")
	fmt.Fprintf(&b, "// https://%s. One program → all targets (Docker today, cloud tomorrow).\n", domain)
	b.WriteString("import * as docker from \"@pulumi/docker\";\n\n")

	// program() — a PURE FACTORY of the resource graph. No module-scope mutable binding (FN02).
	b.WriteString("export function program() {\n")

	// RemoteImage per DISTINCT image (canonical order), kept locally on destroy.
	imageVar := emitImages(&b, svcs)

	// The network: ATTACH (external) — never created — or CREATE (internal). Either way the
	// containers reference it by name inline (the gold form), so the attach is verbatim.
	if m.Network.External {
		b.WriteString("\t// External network (the /data/dockers convention): ATTACH to it, never create it.\n\n")
	} else {
		b.WriteString("\t// Internal network: this stack OWNS it.\n")
		fmt.Fprintf(&b, "\tconst network = new docker.Network(%s, { name: %s });\n\n", jsStr(m.Network.Name), jsStr(m.Network.Name))
	}

	// The per-stack data volume(s) (isolated per project×env).
	volVar := emitVolumes(&b, stack, m.Volumes)

	// The inline network attach the gold proves: networksAdvanced name=<network> (a string
	// literal, resolved — never invented). External nets are attached, never created.
	netAttach := fmt.Sprintf("networksAdvanced: [{ name: %s }],", jsStr(m.Network.Name))

	// One docker.Container per service (canonical order).
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
			emitDatastoreBody(&b, projectOf(stack), volVar, m.Volumes, netAttach, s)
		case RoleServer:
			emitServerBody(&b, stack, domain, netAttach, s, ds, hasDS)
		default:
			fmt.Fprintf(&b, "\t\t%s\n", netAttach)
		}
		b.WriteString("\t});\n\n")
	}

	// program() returns the resource graph (containers + the volume map).
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

	// The scaffold entrypoint: `pulumi up` runs index.ts, which calls the pure factory and
	// exports the stack outputs. A `const` (not let/var) keeps the module FN02-pure.
	b.WriteString("// The Pulumi entrypoint: instantiate the resource graph + export the stack outputs.\n")
	b.WriteString("export const resources = program();\n")
	fmt.Fprintf(&b, "export const url = %s;\n", jsStr("https://"+domain))

	return []byte(strings.TrimRight(b.String(), "\n") + "\n")
}

// emitImages renders a docker.RemoteImage{keepLocally:true} per DISTINCT image (canonical order)
// and returns the image→variable map so each container references its image var by .imageId.
func emitImages(b *strings.Builder, svcs []Service) map[string]string {
	seen := map[string]string{}
	images := make([]string, 0, len(svcs))
	for _, s := range svcs {
		if _, ok := seen[s.Image]; ok {
			continue
		}
		seen[s.Image] = "" // placeholder; assign below in canonical (image) order
		images = append(images, s.Image)
	}
	sort.Strings(images)
	for i, img := range images {
		v := fmt.Sprintf("image%d", i)
		seen[img] = v
		fmt.Fprintf(b, "\tconst %s = new docker.RemoteImage(%s, { name: %s, keepLocally: true });\n",
			v, jsStr(v), jsStr(img))
	}
	if len(images) > 0 {
		b.WriteString("\n")
	}
	return seen
}

// emitVolumes renders a docker.Volume <stack>-<vol> per declared volume (canonical name order)
// and returns the volume-name→variable map (so the datastore mount references it by .name).
func emitVolumes(b *strings.Builder, stack string, vols []Volume) map[string]string {
	out := map[string]string{}
	sorted := append([]Volume(nil), vols...)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].Name < sorted[j].Name })
	for i, v := range sorted {
		varName := fmt.Sprintf("vol%d", i)
		out[v.Name] = varName
		vname := stack + "-" + v.Name
		fmt.Fprintf(b, "\tconst %s = new docker.Volume(%s, { name: %s });\n", varName, jsStr(vname), jsStr(vname))
	}
	if len(sorted) > 0 {
		b.WriteString("\n")
	}
	return out
}

// emitDatastoreBody renders the datastore container body: the POSTGRES_* envs, the volume mount
// (the first declared volume, if any), networking, and the pg_isready healthcheck.
func emitDatastoreBody(b *strings.Builder, dbName string, volVar map[string]string, vols []Volume, netAttach string, s Service) {
	b.WriteString("\t\tenvs: [\n")
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_DB="+dbName))
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_USER="+pgUser))
	fmt.Fprintf(b, "\t\t\t%s,\n", jsStr("POSTGRES_PASSWORD="+dbName))
	b.WriteString("\t\t],\n")
	if v, mountPath, ok := firstVolume(volVar, vols); ok {
		b.WriteString("\t\tvolumes: [\n")
		fmt.Fprintf(b, "\t\t\t{ volumeName: %s.name, containerPath: %s },\n", v, jsStr(mountPath))
		b.WriteString("\t\t],\n")
	}
	fmt.Fprintf(b, "\t\t%s\n", netAttach)
	b.WriteString("\t\thealthcheck: {\n")
	fmt.Fprintf(b, "\t\t\ttests: [\"CMD-SHELL\", %s],\n", jsStr(fmt.Sprintf("pg_isready -U %s -d %s", pgUser, dbName)))
	b.WriteString("\t\t\tinterval: \"3s\",\n")
	b.WriteString("\t\t\ttimeout: \"3s\",\n")
	b.WriteString("\t\t\tretries: 20,\n")
	b.WriteString("\t\t},\n")
}

// emitServerBody renders the server container body: the DATABASE_URL env (pointing the datastore
// by its container name <stack>-<db>:5432), networking, and the COMPLETE Traefik label set.
func emitServerBody(b *strings.Builder, stack, domain, netAttach string, s, ds Service, hasDS bool) {
	if hasDS {
		dbName := projectOf(stack)
		dbHost := stack + "-" + ds.Name
		url := fmt.Sprintf("DATABASE_URL=postgres://%s:%s@%s:5432/%s?sslmode=disable", pgUser, dbName, dbHost, dbName)
		b.WriteString("\t\tenvs: [\n")
		fmt.Fprintf(b, "\t\t\t%s,\n", jsStr(url))
		b.WriteString("\t\t],\n")
	}
	fmt.Fprintf(b, "\t\t%s\n", netAttach)
	b.WriteString("\t\tlabels: [\n")
	b.WriteString("\t\t\t{ label: \"traefik.enable\", value: \"true\" },\n")
	// The Host rule — backticks inside the TS value, rendered as a JS template-style literal.
	fmt.Fprintf(b, "\t\t\t{ label: %s, value: %s },\n",
		jsStr("traefik.http.routers."+stack+".rule"), hostRuleLiteral(domain))
	// priority — SUPERSEDE the *-dev wildcard placeholder.
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

// hostRuleLiteral renders the Traefik Host rule as a JS literal carrying backticks (Host(`d`)).
// We render it as a double-quoted JS string with the literal backticks inside (Traefik reads the
// label value verbatim), so the bytes are deterministic and JSON-escaped.
func hostRuleLiteral(domain string) string {
	return jsStr("Host(`" + domain + "`)")
}

// firstVolume returns the canonically-first volume variable + its mount path (the datastore data
// dir). honoemit's Volume carries the in-container Path; we default to the Postgres data dir when
// the declared path is unset so the gold mount is always present for a datastore.
func firstVolume(volVar map[string]string, vols []Volume) (string, string, bool) {
	names := sortedVolNames(volVar)
	if len(names) == 0 {
		return "", "", false
	}
	first := names[0]
	mountPath := "/var/lib/postgresql/data"
	for _, v := range vols {
		if v.Name == first && v.Path != "" {
			mountPath = v.Path
			break
		}
	}
	return volVar[first], mountPath, true
}

func sortedVolNames(volVar map[string]string) []string {
	names := make([]string, 0, len(volVar))
	for n := range volVar {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// projectOf returns the project portion of a <project>-<env> stack id (everything before the
// LAST "-"). Used for the POSTGRES_DB / DATABASE_URL database name (the gold used the project).
func projectOf(stack string) string {
	if i := strings.LastIndex(stack, "-"); i >= 0 {
		return stack[:i]
	}
	return stack
}

// emitPulumiYAML renders the Pulumi project manifest (Pulumi.yaml): project name = the stack id,
// runtime nodejs. Deterministic, content-addressed by the same sourceHash.
func emitPulumiYAML(stack, sourceHash string) []byte {
	var b strings.Builder
	b.WriteString(header("#", sourceHash))
	fmt.Fprintf(&b, "name: %s\n", stack)
	b.WriteString("runtime: nodejs\n")
	fmt.Fprintf(&b, "description: AIDOS-emitted per-project×env infra for %s (Pulumi @pulumi/docker).\n", stack)
	return []byte(b.String())
}

// emitPulumiPackageJSON renders the scaffold package.json with the @pulumi deps the program
// imports. Pinned, deterministic versions (no clock, no resolver), content-addressed.
func emitPulumiPackageJSON(sourceHash string) []byte {
	// A protected header inside a leading JSON comment-free file is impossible (JSON has no
	// comments); we carry the source hash as a "_source" field so the artifact stays content-
	// addressed AND the file is valid JSON.
	var b strings.Builder
	b.WriteString("{\n")
	fmt.Fprintf(&b, "\t\"_aidos\": %s,\n", jsStr(protectedMarker))
	fmt.Fprintf(&b, "\t\"_source\": %s,\n", jsStr(sourceHash))
	b.WriteString("\t\"name\": \"aidos-infra\",\n")
	b.WriteString("\t\"private\": true,\n")
	b.WriteString("\t\"main\": \"index.ts\",\n")
	b.WriteString("\t\"dependencies\": {\n")
	b.WriteString("\t\t\"@pulumi/docker\": \"^4.5.0\",\n")
	b.WriteString("\t\t\"@pulumi/pulumi\": \"^3.140.0\"\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")
	return []byte(b.String())
}
