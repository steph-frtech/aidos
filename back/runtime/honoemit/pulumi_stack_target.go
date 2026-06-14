package honoemit

// DP33 — PORTABILITÉ FUTURE-CLOUD : le MÊME StackManifest, deux CIBLES, zéro réécriture.
//
// L'intention (DP33, clôture EPIC G + la piste DP) : prouver que le MÊME StackManifest se projette
// vers future_cloud SANS réécrire la déclaration. Le self-hosted (@pulumi/docker) et le cloud
// (provider managé) sont deux PROJECTIONS de la même source ; aucune divergence de déclaration.
// « Une source → N projections » (ADR 0043 amendé, EPIC G).
//
// LA CIBLE EST UNE DIMENSION, PAS UNE NOUVELLE SOURCE (le mur, §2). EmitPulumiStackTarget ajoute un
// paramètre Target ∈ {self_hosted, future_cloud} à l'émetteur PROUVÉ EmitPulumiStack :
//
//   - TargetSelfHosted → délègue VERBATIM à EmitPulumiStack (le @pulumi/docker prouvé en or par
//     demoshop-dev). Byte-identique : la cible cloud est PUREMENT ADDITIVE (anti-overwrite §9) ;
//   - TargetFutureCloud (env scope.EnvFutureCloud, DP06) → projette une variante CLOUD : les
//     services MANAGÉS (datastore, bus, cache, pooler, workflow) se résolvent en managed_url
//     (RÉUTILISE connresolve.ResolveConnection, DP07) au lieu d'un docker.Container ; les services
//     APPLICATIFS (server, interpreter) deviennent une ressource cloud représentative.
//
// LA MATRICE kind×target EST CLOSE (Targets2()) : un service porte un rôle du jeu fermé DP02, une
// cible un membre du jeu fermé {self_hosted, future_cloud} — une cible inconnue est un BlockReason,
// jamais devinée (l'honnêteté, comme un rôle inconnu).
//
// DÉTERMINISME-FIRST (§6/§8). EmitPulumiStackTarget est une FONCTION PURE, TOTALE, byte-stable de
// (project, env, Canonicalize(manifest), target) — aucune horloge, aucun RNG, ordre de service
// canonique. La SOURCE StackManifest n'est JAMAIS mutée : la projection la LIT seulement (le miroir
// de source-invariance, pulumi_stack_target_test.go, le scelle). Jamais un LLM : la résolution
// managed_url est la table DP07, le mapping rôle→managé est une appartenance close. L'émetteur
// n'écrit AUCUNE vérité (une projection below-the-line) et RÉUTILISE EmitPulumiStack/DP06/DP07 —
// il ne forke rien.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/connresolve"
)

// Target is the CLOSED deployment-target dimension DP33 adds to the Pulumi stack emitter: the same
// StackManifest projects to EITHER target without a re-declaration. An unknown target is refused
// (the honesty rule), never guessed.
type Target string

const (
	// TargetSelfHosted — the @pulumi/docker self-hosted projection (the demoshop-dev GOLD). It is
	// the CURRENT EmitPulumiStack, delegated verbatim (byte-identical, anti-overwrite §9).
	TargetSelfHosted Target = "self_hosted"
	// TargetFutureCloud — the managed-cloud projection (scope.EnvFutureCloud, DP06). The managed
	// services resolve to managed_url (DP07); the app services become representative cloud resources.
	TargetFutureCloud Target = "future_cloud"
)

// targetSetOrder is the closed target set in canonical order (declared, never from map iteration).
var targetSetOrder = []Target{TargetSelfHosted, TargetFutureCloud}

// Targets2 returns the closed deployment-target set in canonical order. (Named Targets2 so it does
// not collide with the existing emit-target enumeration Targets() in honoemit.go — a different,
// orthogonal closed set: emit-targets are FILE kinds, Targets2 are DEPLOYMENT targets.)
func Targets2() []Target {
	out := make([]Target, len(targetSetOrder))
	copy(out, targetSetOrder)
	return out
}

// IsTarget reports whether t is a member of the closed deployment-target set.
func IsTarget(t Target) bool {
	for _, k := range targetSetOrder {
		if k == t {
			return true
		}
	}
	return false
}

// ErrUnknownTarget is the cause folded into the BlockReason explanation for a target outside the
// closed set (the S13 shape reused — never a new prison code).
var ErrUnknownTarget = fmt.Errorf("honoemit: deployment target is outside the closed set (want %v)", targetSetOrder)

// cloudManagedRoles is the CLOSED set of roles that resolve to a MANAGED cloud resource in
// future_cloud (datastore→RDS-like, bus→managed bus, cache→managed cache, pooler/workflow→managed).
// Declared, never learned (§8). A role NOT in this set is an APP service (server, interpreter) and
// is projected as a representative cloud compute resource.
var cloudManagedRoles = map[ServiceRole]bool{
	RoleDatastore: true,
	RoleBus:       true,
	RoleCache:     true,
	RolePooler:    true,
	RoleWorkflow:  true,
}

// isCloudManaged reports whether a service is MANAGED in the future_cloud projection.
func isCloudManaged(role ServiceRole) bool { return cloudManagedRoles[role] }

// EmitPulumiStackTarget is the DP33 target-dimensioned stack emitter: the SAME StackManifest →
// the requested deployment target, deterministically, WITHOUT modifying the source. For
// TargetSelfHosted it delegates verbatim to EmitPulumiStack (byte-identical); for TargetFutureCloud
// it renders the managed-cloud projection (managed services → managed_url, DP07 reused; app services
// → representative cloud resources). A malformed input or an unknown target is a typed BlockReason.
func EmitPulumiStackTarget(project, env string, m StackManifest, target Target) ([]Artifact, *blockreason.BlockReason) {
	if !IsTarget(target) {
		br := block(ErrUnknownTarget)
		return nil, &br
	}
	if target == TargetSelfHosted {
		// The proven self-hosted emitter, untouched (anti-overwrite §9): the cloud variant is ADDITIVE.
		return EmitPulumiStack(project, env, m)
	}

	// --- TargetFutureCloud: the managed-cloud projection of the SAME source. ---
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
	// The source hash is computed over the SAME (project, env, manifest) triple — the source is read,
	// never re-declared. (The cloud program's bytes differ; the source content address is identical
	// to the self-hosted projection's, which is exactly the source-invariance the mirror pins.)
	sourceHash, err := stackSourceHash(project, env, m)
	if err != nil {
		br := block(err)
		return nil, &br
	}

	program, err := emitFutureCloudProgram(stack, sourceHash, m)
	if err != nil {
		br := block(err)
		return nil, &br
	}
	scaffoldYAML := emitPulumiYAML(stack, sourceHash)
	scaffoldPkg := emitCloudPackageJSON(sourceHash)

	dir := "gen/" + project + "/infra/"
	arts := []Artifact{
		artifact(dir+"Pulumi.yaml", TargetPulumiScaffold, scaffoldYAML, sourceHash),
		artifact(dir+"index.ts", TargetPulumiProgram, program, sourceHash),
		artifact(dir+"package.json", TargetPulumiScaffold, scaffoldPkg, sourceHash),
	}
	sort.SliceStable(arts, func(i, j int) bool { return arts[i].Path < arts[j].Path })
	return arts, nil
}

// emitFutureCloudProgram renders the managed-cloud Pulumi/TS program for the stack: each MANAGED
// service (datastore/bus/cache/pooler/workflow) is a managed-URL reference (DP07 resolveConnection,
// the closed mode set), each APP service (server/interpreter) a representative cloud resource. The
// MANAGED services are NOT docker.Container — they are external, resolved at boot from the secret
// store (S91) via their ${<NAME>_MANAGED_URL} reference. FN02-pure: declared inside program().
func emitFutureCloudProgram(stack, sourceHash string, m StackManifest) ([]byte, error) {
	svcs := canonicalServices(m)
	domain := stack + "." + stackDomainSuffix

	var b strings.Builder
	b.WriteString(header("//", sourceHash))
	b.WriteString("// DP33 future_cloud infra program (Pulumi/functional TS, ADR 0043 amended). The SAME\n")
	b.WriteString("// StackManifest as the self-hosted target — projected to the managed cloud: MANAGED\n")
	b.WriteString("// services (datastore/bus/cache/pooler/workflow) resolve to managed_url (DP07); APP\n")
	fmt.Fprintf(&b, "// services become representative cloud resources, routed at https://%s.\n", domain)
	b.WriteString("// PORTABILITY BY PROJECTION, NEVER BY REWRITE — one source, N targets.\n")
	b.WriteString("import * as cloud from \"@pulumi/cloud\";\n\n")

	b.WriteString("export function program() {\n")

	// MANAGED services first (canonical order): each a managed_url reference resolved at boot (DP07).
	managedVars := make([]string, 0, len(svcs))
	for _, s := range svcs {
		if !isCloudManaged(s.Role) {
			continue
		}
		res, err := resolveManaged(s, m.Network)
		if err != nil {
			return nil, err
		}
		varName := tsIdent(s.Name)
		managedVars = append(managedVars, varName)
		fmt.Fprintf(&b, "\t// %s (role %s) is MANAGED in future_cloud: resolved to %s (DP07).\n", s.Name, s.Role, res.Mode)
		fmt.Fprintf(&b, "\tconst %s = { service: %s, mode: %s, url: process.env[%s] };\n",
			varName, jsStr(s.Name), jsStr(string(res.Mode)), jsStr(res.EnvVars))
	}
	if len(managedVars) > 0 {
		b.WriteString("\n")
	}

	// APP services (canonical order): a representative cloud compute resource. The server carries the
	// public route (the cloud provider's HTTPS endpoint); every other app service is internal compute.
	appVars := make([]string, 0, len(svcs))
	for _, s := range svcs {
		if isCloudManaged(s.Role) {
			continue
		}
		varName := tsIdent(s.Name)
		appVars = append(appVars, varName)
		cname := stack + "-" + s.Name
		fmt.Fprintf(&b, "\tconst %s = new cloud.Service(%s, {\n", varName, jsStr(s.Name))
		fmt.Fprintf(&b, "\t\timage: %s,\n", jsStr(s.Image))
		fmt.Fprintf(&b, "\t\tname: %s,\n", jsStr(cname))
		if s.Role == RoleServer {
			// The public exposure: the cloud provider's managed HTTPS endpoint for the app domain.
			fmt.Fprintf(&b, "\t\tport: %d,\n", s.InternalPort)
			fmt.Fprintf(&b, "\t\tdomain: %s,\n", jsStr(domain))
		} else {
			fmt.Fprintf(&b, "\t\tport: %d,\n", s.InternalPort)
		}
		b.WriteString("\t});\n")
	}
	if len(appVars) > 0 {
		b.WriteString("\n")
	}

	// program() returns the resource graph: the app resources + the managed-URL references.
	b.WriteString("\treturn { resources: { ")
	b.WriteString(strings.Join(appVars, ", "))
	b.WriteString(" }, managed: { ")
	b.WriteString(strings.Join(managedVars, ", "))
	b.WriteString(" } };\n")
	b.WriteString("}\n\n")

	b.WriteString("// The Pulumi entrypoint: instantiate the resource graph + export the stack outputs.\n")
	b.WriteString("export const resources = program();\n")
	fmt.Fprintf(&b, "export const url = %s;\n", jsStr("https://"+domain))

	return []byte(strings.TrimRight(b.String(), "\n") + "\n"), nil
}

// resolveManaged resolves a managed service to its DP07 connection mode in the future_cloud
// environment — RÉUTILISE connresolve.ResolveConnection (the published DP07 contract), mapping the
// honoemit.Service to its kernel/stackmanifest.Service counterpart (same role string, same name).
// In future_cloud the binding is Managed, so every service resolves to managed_url — the resolver is
// the SINGLE owner of that rule (§8, declared never learned); honoemit never re-implements it.
func resolveManaged(s Service, net Network) (connresolve.Resolution, error) {
	svc := stackmanifest.Service{
		Name:         s.Name,
		Role:         stackmanifest.Role(s.Role),
		Image:        s.Image,
		InternalPort: s.InternalPort,
	}
	return connresolve.ResolveConnection(svc, scope.EnvFutureCloud)
}

// emitCloudPackageJSON renders the scaffold package.json for the future_cloud program: the
// @pulumi/cloud dep the cloud program imports. Pinned, deterministic, content-addressed — the cloud
// counterpart of emitPulumiPackageJSON (the self-hosted @pulumi/docker scaffold), not a fork of it.
func emitCloudPackageJSON(sourceHash string) []byte {
	var b strings.Builder
	b.WriteString("{\n")
	fmt.Fprintf(&b, "\t\"_aidos\": %s,\n", jsStr(protectedMarker))
	fmt.Fprintf(&b, "\t\"_source\": %s,\n", jsStr(sourceHash))
	b.WriteString("\t\"name\": \"aidos-infra\",\n")
	b.WriteString("\t\"private\": true,\n")
	b.WriteString("\t\"main\": \"index.ts\",\n")
	b.WriteString("\t\"dependencies\": {\n")
	b.WriteString("\t\t\"@pulumi/cloud\": \"^0.30.0\",\n")
	b.WriteString("\t\t\"@pulumi/pulumi\": \"^3.140.0\"\n")
	b.WriteString("\t}\n")
	b.WriteString("}\n")
	return []byte(b.String())
}
