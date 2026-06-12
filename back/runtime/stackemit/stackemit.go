// Package stackemit is the DP05 emitter: the COMPLETE, deterministic stack
// emission from a content-addressed DAG phase (S23) — the function the
// preview (DP25) and the deploy (DP26) REUSE: they never choose between
// artifacts, they re-emit.
//
//	EmitStack(phase, manifest, ledger, disk) →
//	    {docker-compose.yml, .env.example, start.sh, start_with_rebuild.sh,
//	     traefik.dynamic.yml}
//
// COMPOSITION, NEVER REINVENTION (CLAUDE.md §3, ADR 0007): the compose is
// composeemit.Emit (DP03) verbatim; the env bundle is envemit.Emit (DP04)
// verbatim; the hand-edit gate reuses the S78 regen ledger/disk shapes and
// drift law (records.Hash inequality); the phase verdict reuses phases (S23,
// IsStable computed, never declared); the content addresses reuse records
// (S02, never forked). Only the traefik dynamic config target is NEW here —
// the file-provider projection of the SAME declared topology the DP03 labels
// encode (no new business rule: routers/middleware/service URLs are derived
// from the manifest's declared servers, hosts stay ${VAR} references).
//
// THE CORNERSTONE MIRROR (the whole epic's): EmitStack is a PURE function of
// the phase's content address — same phase → same bytes, N times, on every
// machine (the rapid property pins ∀×2 + Example×100). No clock, no RNG, no
// map-order leak, no I/O.
//
// THE INTERPRETER SIDECAR (ADR 0040 Décision 7, fork E → recommandation A):
// the Go interpreter rides the StackManifest as a role=interpreter service,
// profile core (it always runs), joignable docker_internal — the emission
// carries it into the compose and its port into the .env.example;
// InterpreterSidecar is the pure lookup the Workbench surfaces.
//
// THE WALL (CLAUDE.md §2): re-emission is below-the-line — the phase (source)
// is AUTHORITATIVE, the emitted code regenerable, never the reverse. The
// emitter refuses, fail-closed:
//   - an UNSTABLE phase (PHASE_NOT_STABLE — S23 reused, stability computed);
//   - a manifest NOT PINNED in the phase cut (OUT_OF_SCOPE — EmitStack never
//     emits from an unpinned manifest: the phase decides what is emitted);
//   - a HAND-EDITED gen/ file (EMITTED_FILE_HAND_EDITED — the S78 drift law:
//     the first drift in sorted-path order blocks the WHOLE bundle; no
//     partial re-emission silently overwrites a human edit, §9).
package stackemit

import (
	"sort"
	"strconv"
	"strings"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/composeemit"
	"github.com/steph-frtech/aidos/back/runtime/envemit"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/regen"
)

// TargetTraefikDynamic — the DP05 additive target of the closed kind × target
// matrix: kind stack_manifest × target traefik-dynamic (the file-provider
// projection of the DP03 label topology). Declared, never invented ad hoc.
const TargetTraefikDynamic = "traefik-dynamic"

// KindStackManifest — the source kind this emitter reads (DP02, verbatim).
const KindStackManifest = stackmanifest.KindStackManifest

// targetOrder is the canonical enumeration order of this package's closed
// target set (declared, never derived from map iteration) — DP03/DP04 own
// docker-compose and env-example/start-scripts; stackemit owns only the NEW
// traefik-dynamic target and COMPOSES the rest.
var targetOrder = []string{TargetTraefikDynamic}

// Targets returns every stackemit target in canonical order.
func Targets() []string {
	out := make([]string, len(targetOrder))
	copy(out, targetOrder)
	return out
}

// Bundle is the DP05 emission: the complete deployable stack of ONE phase —
// five byte-stable artifacts (the DP03 compose, the DP04 env bundle, the DP05
// traefik dynamic config), triple-addressed: the phase content address
// (PhaseVersion, S23), the manifest content address (SourceHash, S02) and the
// bundle's own output address (BundleHash — Hash over the canonical artifact
// summary, the «ré-émettre deux fois, hash égaux» proof).
type Bundle struct {
	PhaseVersion     string               `json:"phase_version"`
	SourceHash       string               `json:"source_hash"`
	BundleHash       string               `json:"bundle_hash"`
	Compose          composeemit.Artifact `json:"compose"`
	EnvExample       composeemit.Artifact `json:"env_example"`
	StartSh          composeemit.Artifact `json:"start_sh"`
	StartWithRebuild composeemit.Artifact `json:"start_with_rebuild_sh"`
	TraefikDynamic   composeemit.Artifact `json:"traefik_dynamic"`
}

// Artifacts returns the bundle's five artifacts in canonical order
// (compose, env, start, rebuild, traefik) — the order BundleHash folds over.
func (b Bundle) Artifacts() []composeemit.Artifact {
	return []composeemit.Artifact{
		b.Compose, b.EnvExample, b.StartSh, b.StartWithRebuild, b.TraefikDynamic,
	}
}

// InterpreterSidecar returns the manifest's Go interpreter sidecar service
// (ADR 0040 Décision 7: role=interpreter) and whether one is declared — a
// pure lookup in sorted-name order (deterministic when several are declared).
func InterpreterSidecar(m stackmanifest.StackManifest) (stackmanifest.Service, bool) {
	sorted := make([]stackmanifest.Service, len(m.Services))
	copy(sorted, m.Services)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Name < sorted[j].Name })
	for _, s := range sorted {
		if s.Role == stackmanifest.RoleInterpreter {
			return s, true
		}
	}
	return stackmanifest.Service{}, false
}

// PhaseFor builds the MINIMAL S23 stable phase pinning a manifest: a
// one-constraint cut («stack_manifest/<app>» → the manifest's content
// address), no links, no sensors — vacuously stable (the §43 base case). It
// is the deterministic seed the Workbench and the mirror use; a real build's
// phase comes from the DAG (S23/S96) and carries its full cut — EmitStack
// accepts any stable phase that PINS the manifest.
func PhaseFor(m stackmanifest.StackManifest) (phases.StablePhase, error) {
	h, err := stackmanifest.HashManifest(m)
	if err != nil {
		return phases.StablePhase{}, err
	}
	cut := phases.Cut{KindStackManifest + "/" + m.AppName: h}
	return phases.IsStable(cut, nil, nil, nil), nil
}

// manifestPinned reports whether the manifest's content address appears as a
// pinned version of the phase cut — the phase is the AUTHORITATIVE selection:
// EmitStack never emits from a manifest the phase did not pin.
func manifestPinned(phase phases.StablePhase, manifestHash string) bool {
	for _, v := range phase.Cut {
		if v == manifestHash {
			return true
		}
	}
	return false
}

// blockUnpinned renders the refusal of a manifest the phase cut does not pin
// (the closed OUT_OF_SCOPE code — the DP03/DP04 refusal discipline — with the
// DP05 phase-authority explanation).
func blockUnpinned(phaseVersion, manifestHash string) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission refusée : le StackManifest (" + manifestHash + ") n'est PAS épinglé dans la coupe " +
			"de la phase (" + phaseVersion + "). La phase est la source AUTORITATIVE de l'émission (DP05, KRD §43) : " +
			"EmitStack ré-émet exactement ce que la phase a sélectionné — jamais un manifest hors-coupe (honnêteté ; " +
			"S96 « ré-émet depuis la phase »).",
		HowToFix: []string{
			"pin_the_manifest_in_the_phase : faites entrer le manifest dans la coupe — gravez sa version dans le Kernel (idée → miroir → /goal → approbation) puis recalculez la phase stable (S23, phases.IsStable).",
			"emit_from_the_pinned_version : si la phase épingle une AUTRE version du manifest, émettez CELLE-LÀ — la coupe décide, pas l'appelant.",
			"re_emit : relancez EmitStack une fois le manifest épinglé ; même phase content-adressée → mêmes octets sur toute machine.",
		},
	}
}

// envVarName folds a service name to its env-var stem (the DP04 fold,
// duplicated as a 4-line pure function because envemit keeps it unexported —
// coherence is proven by the crossed property mirror, not by import).
func envVarName(serviceName string) string {
	up := strings.ToUpper(serviceName)
	return strings.Map(func(r rune) rune {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return '_'
	}, up)
}

// renderTraefikDynamic renders the traefik DYNAMIC config (file provider) —
// the projection of the SAME declared topology the DP03 labels encode: one
// HTTPS router (websecure + certresolver reference) + one HTTP→HTTPS redirect
// router per role=server service, the shared redirect middleware, and the
// docker_internal service URLs (http://<container>:<internal_port> — the
// container name is the ${APP_NAME} reference, never a hardcoded host).
// Hosts, names and the cert resolver stay ${VAR} REFERENCES resolved at
// deploy time (SPEC-stack-2026: no hardcoded URL/secret). Servers render in
// stable (sorted) order; newlines are "\n".
func renderTraefikDynamic(m stackmanifest.StackManifest, sourceHash string) []byte {
	sorted := make([]stackmanifest.Service, len(m.Services))
	copy(sorted, m.Services)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Name < sorted[j].Name })
	primary := ""
	servers := []stackmanifest.Service{}
	for _, s := range sorted {
		if s.Role == stackmanifest.RoleServer {
			if primary == "" {
				primary = s.Name
			}
			servers = append(servers, s)
		}
	}

	routers := []string{}
	services := []string{}
	for _, svc := range servers {
		router := "${APP_NAME}"
		host := "${APP_SUBDOMAIN}.${DOMAIN}"
		container := "${APP_NAME}"
		if svc.Name != primary {
			router = "${APP_NAME}-" + svc.Name
			host = svc.Name + ".${APP_SUBDOMAIN}.${DOMAIN}"
			container = "${APP_NAME}-" + svc.Name
		}
		routers = append(routers,
			"    "+router+":",
			"      rule: Host(`"+host+"`)",
			"      entryPoints:",
			"        - websecure",
			"      service: "+router,
			"      tls:",
			"        certResolver: ${CERT_RESOLVER_NAME}",
			"    "+router+"-http:",
			"      rule: Host(`"+host+"`)",
			"      entryPoints:",
			"        - web",
			"      middlewares:",
			"        - ${APP_NAME}-https-redirect",
			"      service: "+router,
		)
		services = append(services,
			"    "+router+":",
			"      loadBalancer:",
			"        servers:",
			// docker_internal: the container name on the shared network.
			"          - url: http://"+container+":"+strconv.Itoa(svc.InternalPort),
		)
	}

	lines := []string{
		"# " + generators.ProtectedMarker + ". source: " + sourceHash,
		"# Config dynamique Traefik (file provider) — projection des labels DP03 du même manifest.",
		"# Toutes les valeurs sont des références d'environnement résolues au déploiement — jamais en dur.",
		"http:",
		"  routers:",
	}
	lines = append(lines, routers...)
	lines = append(lines,
		"  middlewares:",
		"    ${APP_NAME}-https-redirect:",
		"      redirectScheme:",
		"        scheme: https",
		"  services:",
	)
	lines = append(lines, services...)
	return []byte(strings.Join(lines, "\n") + "\n")
}

// firstHandEdit refuses on the FIRST ledger-tracked disk file whose bytes no
// longer hash to the recorded output_hash — sorted-path order (deterministic:
// the same drifted set always refuses on the same path), generators.Drifted
// (S34/S78 law) as the single drift definition. An untracked file is not a
// drift (the emitter never recorded it).
func firstHandEdit(disk []regen.DiskFile, ledger []regen.LedgerEntry) *blockreason.BlockReason {
	byPath := make(map[string]regen.LedgerEntry, len(ledger))
	for _, e := range ledger {
		byPath[e.Path] = e // duplicate paths: the LAST wins (append-only head)
	}
	sorted := make([]regen.DiskFile, len(disk))
	copy(sorted, disk)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Path < sorted[j].Path })
	for _, f := range sorted {
		entry, tracked := byPath[f.Path]
		if !tracked {
			continue
		}
		if generators.Drifted(entry.OutputHash, f.Bytes) {
			br := blockreason.For(blockreason.CodeEmittedFileHandEdited)
			return &br
		}
	}
	return nil
}

// bundleHash folds the bundle's identity into ONE output content address:
// records.Hash over the canonical "phase\npath:output_hash\n…" summary (S02
// reused — never a forked hash scheme). Same phase → same artifacts → same
// BundleHash: the «ré-émettre deux fois, hash égaux» proof is one comparison.
func bundleHash(phaseVersion string, arts []composeemit.Artifact) string {
	lines := []string{"phase:" + phaseVersion}
	for _, a := range arts {
		lines = append(lines, a.Path+":"+a.OutputHash)
	}
	return records.Hash([]byte(strings.Join(lines, "\n") + "\n"))
}

// EmitStack is the DP05 composition — the COMPLETE stack emission of a phase:
//
//  1. the phase must be STABLE (S23 computed verdict; PHASE_NOT_STABLE
//     otherwise — deploy/preview are keyed on stable phases only);
//  2. the manifest must be PINNED in the phase cut (the phase is the
//     authoritative source; OUT_OF_SCOPE otherwise);
//  3. NO tracked gen/ file may be hand-edited (the S78 drift law; the first
//     drift refuses the WHOLE bundle with EMITTED_FILE_HAND_EDITED,
//     fail-closed BEFORE any emission — §9 anti-overwrite);
//  4. then it COMPOSES composeemit.Emit (DP03) + envemit.Emit (DP04) + the
//     traefik dynamic projection, and triple-addresses the result
//     (PhaseVersion S23 · SourceHash S02 · BundleHash).
//
// PURE: no DB, no clock, no RNG, no I/O — ledger and disk are explicit inputs
// (the MCP/CLI seam reads the files, the S78 pattern). Same phase → same
// bytes on every machine: the cornerstone mirror of the provisioning epic.
func EmitStack(
	phase phases.StablePhase,
	m stackmanifest.StackManifest,
	ledger []regen.LedgerEntry,
	disk []regen.DiskFile,
) (Bundle, *blockreason.BlockReason) {
	// (1) stable phases only — the verdict is COMPUTED (S23), never declared.
	if !phase.Stable {
		br := blockreason.For(blockreason.CodePhaseNotStable)
		return Bundle{}, &br
	}

	// (2) the phase pins the manifest — an invalid manifest refuses with the
	// DP02 closed code via the DP03 emitter below; here we address it first.
	manifestHash, err := stackmanifest.HashManifest(m)
	if err != nil {
		// Reuse the DP03 refusal verbatim: emit and let it carry the DP02 code.
		_, br := composeemit.Emit(m)
		return Bundle{}, br
	}
	phaseVersion, verr := phase.Version()
	if verr != nil {
		// A phase that cannot canonicalize is not a source (defensive: phases
		// built by IsStable always canonicalize).
		br := blockreason.For(blockreason.CodePhaseNotStable)
		return Bundle{}, &br
	}
	if !manifestPinned(phase, manifestHash) {
		br := blockUnpinned(phaseVersion, manifestHash)
		return Bundle{}, &br
	}

	// (3) the hand-edit gate, BEFORE any emission (fail-closed, §9).
	if br := firstHandEdit(disk, ledger); br != nil {
		return Bundle{}, br
	}

	// (4) compose DP03 + DP04 + the traefik dynamic projection.
	compose, br := composeemit.Emit(m)
	if br != nil {
		return Bundle{}, br
	}
	env, br := envemit.Emit(m)
	if br != nil {
		return Bundle{}, br
	}
	traefikBytes := renderTraefikDynamic(m, manifestHash)
	traefik := composeemit.Artifact{
		Path:       "back/gen/" + m.AppName + "/traefik.dynamic.yml",
		Target:     TargetTraefikDynamic,
		Kind:       KindStackManifest,
		Bytes:      traefikBytes,
		SourceHash: manifestHash,
		OutputHash: records.Hash(traefikBytes),
		Protected:  true,
	}

	b := Bundle{
		PhaseVersion:     phaseVersion,
		SourceHash:       manifestHash,
		Compose:          compose,
		EnvExample:       env.EnvExample,
		StartSh:          env.StartSh,
		StartWithRebuild: env.StartWithRebuild,
		TraefikDynamic:   traefik,
	}
	b.BundleHash = bundleHash(phaseVersion, b.Artifacts())
	return b, nil
}
