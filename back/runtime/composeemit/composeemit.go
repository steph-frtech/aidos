// Package composeemit is the DP03 emitter: the additive Target
// `TargetDockerCompose` of the closed kind × target matrix —
// Emit(stack_manifest) renders a deterministic docker-compose.yml reproducing
// the /data/dockers conventions EXACTLY (the alphashop model,
// boilerplates/{nodejs,payload}):
//
//   - container_name ${APP_NAME} (the primary server; the other services are
//     ${APP_NAME}-<service>), env_file .env, restart: unless-stopped;
//   - NO published ports — every service rides the external `traefik_default`
//     network, exposure is Traefik labels only;
//   - a role=server service emits the HTTPS router (entrypoint websecure,
//     tls + certresolver ${CERT_RESOLVER_NAME}) AND the HTTP→HTTPS redirect
//     middleware (${APP_NAME}-https-redirect);
//   - named bind volumes via driver_opts {type: none, device: ${<DEVICE_VAR>},
//     o: bind} — env-var references, never a hardcoded path (SPEC-stack-2026:
//     no hardcoded URL/secret — everything by environment variable);
//   - healthchecks per service (the boilerplate cadence 30s/3s/3/10s).
//
// THE CONTRACT IS DETERMINISM (CLAUDE.md §6, ADR 0036 EMITTED_FUNCTION_PURE):
//
//	Emit(m) is a PURE, TOTAL function of Canonicalize(manifest) — no clock,
//	no RNG, no map-iteration-order leak, no absolute path; services and
//	volumes render in stable (sorted) order, newlines are "\n". Same
//	manifest → byte-identical compose, 100 % of the time (the DP03 mirror).
//
// THE WALL (CLAUDE.md §2): the emitter only READS the StackManifest AST (the
// DP02 kernel source — SELECT-only on `kernel`) and returns the projection's
// bytes for back/gen/<app>/ (below the line). It writes no truth. An invalid
// manifest is a typed BlockReason (the S13 shape) carrying the DP02 closed
// validation code — never a panic, never a guessed compose.
//
// ADR 0043 (the IaC decision): the PRIMARY infra artifact of the emitted app
// is the Pulumi/TS program (honoemit.TargetPulumiProgram); this compose is the
// /data/dockers-convention PROJECTION of the same StackManifest — the directly
// deployable artefact today, regenerable, never the source of truth.
//
// OpenQuestion OQ-DP03-emitted-image: a service with an EMPTY image is an
// EMITTED service (built from the app's own phase, DP05+). The manifest pins
// no registry reference yet, so the emitter renders the env-var reference
// `image: ${<SERVICE>_IMAGE}` — resolved at deploy time, never invented here.
package composeemit

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// TargetDockerCompose — the DP03 additive target of the closed emitter
// matrix: kind stack_manifest × target docker-compose. Declared, never
// invented ad hoc; the matrix stays enumerable.
const TargetDockerCompose = "docker-compose"

// KindStackManifest — the source kind this emitter reads (the DP02 kernel
// record kind, reused verbatim — never re-coined).
const KindStackManifest = stackmanifest.KindStackManifest

// targetOrder is the canonical enumeration order of this package's closed
// target set (declared, never derived from map iteration) — the same additive
// pattern as honoemit/apisurface/frontemit: each emitter package OWNS its
// targets; the global matrix is the union of the declared orders.
var targetOrder = []string{TargetDockerCompose}

// Targets returns every composeemit target in canonical order.
func Targets() []string {
	out := make([]string, len(targetOrder))
	copy(out, targetOrder)
	return out
}

// Artifact is one emitted projection, double content-addressed: by its SOURCE
// (source_hash == stackmanifest.HashManifest — the kernel head address, S02
// reused) and by its OUTPUT (output_hash == records.Hash(bytes) — the
// byte-identical re-emission proof). Same shape as the S34 generators
// artifact; the path lands below the line.
type Artifact struct {
	Path       string `json:"path"`        // back/gen/<app>/docker-compose.yml
	Target     string `json:"target"`      // TargetDockerCompose
	Kind       string `json:"kind"`        // stack_manifest
	Bytes      []byte `json:"bytes"`       // the rendered compose (starts with the protected header)
	SourceHash string `json:"source_hash"` // Hash(Canonicalize(manifest body)) — S02 reused
	OutputHash string `json:"output_hash"` // Hash(bytes)
	Protected  bool   `json:"protected"`   // always true: gen/ is never hand-edited
}

// blockInvalid renders the canonical BlockReason for an invalid manifest. It
// folds the DP02 closed validation code into the explanation (the S13 shape:
// actionable, with how_to_fix — never a prison).
func blockInvalid(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission refusée : le StackManifest est invalide (" + cause.Error() +
			"). L'émetteur docker-compose REND exactement la topologie déclarée par la source ; " +
			"il ne devine jamais un rôle, un port ou un service (honnêteté). " +
			"Un manifest qui échoue au validateur pur DP02 n'est pas projetable.",
		HowToFix: []string{
			"fix_the_manifest : corrigez le StackManifest pour passer stackmanifest.Validate — nom d'app requis, ≥1 service role=server, ports internes uniques, rôles et profils dans leurs ensembles clos.",
			"engrave_via_goal : un manifest est une vérité au-dessus de la ligne — gravez-le par idée → miroir → /goal → approbation, jamais en passant.",
			"re_emit : relancez Emit une fois le manifest valide ; l'émission est byte-identique à chaque run.",
		},
	}
}

// sortedServices returns the manifest's services in STABLE (name) order, so
// the rendered compose never depends on the order services were declared in.
// It copies — never mutates the caller's slice.
func sortedServices(m stackmanifest.StackManifest) []stackmanifest.Service {
	out := make([]stackmanifest.Service, len(m.Services))
	copy(out, m.Services)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// sortedVolumes returns the manifest's volumes in STABLE (name) order.
func sortedVolumes(m stackmanifest.StackManifest) []stackmanifest.Volume {
	out := make([]stackmanifest.Volume, len(m.Volumes))
	copy(out, m.Volumes)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// primaryServer returns the name of the PRIMARY server: the first role=server
// service in sorted order. It carries the bare ${APP_NAME} container/router
// (the single-service boilerplate convention); additional servers are
// suffixed (the boilerplate's api sub-subdomain pattern). Deterministic — a
// validated manifest always has one.
func primaryServer(sorted []stackmanifest.Service) string {
	for _, s := range sorted {
		if s.Role == stackmanifest.RoleServer {
			return s.Name
		}
	}
	return ""
}

// envVarImage renders the env-var image reference of an EMITTED service
// (empty image — OQ-DP03-emitted-image): ${<SERVICE>_IMAGE}, the service name
// upper-cased with non-alphanumerics folded to '_'.
func envVarImage(serviceName string) string {
	up := strings.ToUpper(serviceName)
	mapped := strings.Map(func(r rune) rune {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return '_'
	}, up)
	return "${" + mapped + "_IMAGE}"
}

// TraefikLabel is ONE structured Traefik docker label — a key and its value,
// the canonical /data/dockers HTTPS-routing vocabulary, rendered (never
// hand-authored). The SINGLE source of the Traefik label set: this package's
// compose YAML rendering AND the DP27 custom-domain binding (domainbind) both
// derive from TraefikHTTPSLabels, so the two emitters can never drift.
type TraefikLabel struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// TraefikHTTPSLabels is the PURE, CANONICAL Traefik HTTPS label set for ONE
// reverse-proxied service/route (DP03, the /data/dockers convention): a
// websecure HTTPS router on Host(`host`) with tls + an ACME certresolver, the
// loadbalancer's server port, and a companion HTTP→HTTPS redirect router +
// middleware. It is the SINGLE SOURCE of the HTTPS label vocabulary — the
// compose YAML rendering (renderTraefikLabels) and the DP27 custom-domain
// binding (domainbind.ResolveInEnvironment) both consume it, so there is never
// a second divergent label jeu.
//
// Parameters are REFERENCES or values supplied by the caller: `router` the
// Traefik router name (e.g. ${APP_NAME} for the compose env-var form, or
// "app-<domain>" for a concrete custom-domain binding), `host` the Host(`…`)
// rule body (e.g. ${APP_SUBDOMAIN}.${DOMAIN} or a literal custom domain),
// `certResolver` the ACME certresolver, `redirectMiddleware` the shared
// HTTP→HTTPS redirect middleware name (${APP_NAME}-https-redirect in compose),
// and `port` the loadbalancer server port (≤0 ⇒ the port label is omitted, e.g.
// a custom-domain binding that routes to an already-declared service). PURE —
// no clock, no rng; same inputs ⇒ the same labels in the same canonical order.
func TraefikHTTPSLabels(router, host, certResolver, redirectMiddleware string, port int) []TraefikLabel {
	labels := []TraefikLabel{
		{Key: "traefik.enable", Value: "true"},
		{Key: "traefik.http.routers." + router + ".rule", Value: "Host(`" + host + "`)"},
		{Key: "traefik.http.routers." + router + ".entrypoints", Value: "websecure"},
		{Key: "traefik.http.routers." + router + ".tls", Value: "true"},
		{Key: "traefik.http.routers." + router + ".tls.certresolver", Value: certResolver},
	}
	if port > 0 {
		labels = append(labels, TraefikLabel{
			Key:   "traefik.http.services." + router + ".loadbalancer.server.port",
			Value: strconv.Itoa(port),
		})
	}
	return append(labels,
		TraefikLabel{Key: "traefik.http.routers." + router + "-http.rule", Value: "Host(`" + host + "`)"},
		TraefikLabel{Key: "traefik.http.routers." + router + "-http.entrypoints", Value: "web"},
		TraefikLabel{Key: "traefik.http.routers." + router + "-http.middlewares", Value: redirectMiddleware},
		TraefikLabel{Key: "traefik.http.middlewares." + redirectMiddleware + ".redirectscheme.scheme", Value: "https"},
	)
}

// renderTraefikLabels renders the /data/dockers Traefik label block of a
// role=server service: the HTTPS router (websecure + tls + certresolver) on
// the loadbalancer's internal port, and the HTTP→HTTPS redirect middleware.
// The primary server routes Host(`${APP_SUBDOMAIN}.${DOMAIN}`) under router
// ${APP_NAME}; an additional server routes the boilerplate's sub-subdomain
// Host(`<svc>.${APP_SUBDOMAIN}.${DOMAIN}`) under router ${APP_NAME}-<svc>. It
// renders the canonical TraefikHTTPSLabels set (the SINGLE source) into the
// compose YAML lines — byte-identical to the prior hand-written block.
func renderTraefikLabels(svc stackmanifest.Service, primary string) []string {
	router := "${APP_NAME}"
	host := "${APP_SUBDOMAIN}.${DOMAIN}"
	if svc.Name != primary {
		router = "${APP_NAME}-" + svc.Name
		host = svc.Name + ".${APP_SUBDOMAIN}.${DOMAIN}"
	}
	labels := TraefikHTTPSLabels(router, host, "${CERT_RESOLVER_NAME}", "${APP_NAME}-https-redirect", svc.InternalPort)
	lines := []string{`    labels:`}
	for _, l := range labels {
		lines = append(lines, `      - "`+l.Key+`=`+l.Value+`"`)
	}
	return lines
}

// renderHealthcheck renders the per-service healthcheck block with the
// boilerplate cadence (interval 30s, timeout 3s, retries 3, start_period 10s).
func renderHealthcheck(cmd string) []string {
	return []string{
		`    healthcheck:`,
		`      test: ["CMD-SHELL", ` + strconv.Quote(cmd) + `]`,
		`      interval: 30s`,
		`      timeout: 3s`,
		`      retries: 3`,
		`      start_period: 10s`,
	}
}

// renderService renders ONE service block (a pure map over the declared
// fields — nothing invented): container_name, image (or the env-var reference
// of an emitted service), env_file, restart, compose profile (core services
// always run, so only a non-core profile is rendered), depends_on (verbatim —
// pinned content), the shared reverse-proxy network, healthcheck, and the
// Traefik labels iff role=server.
func renderService(svc stackmanifest.Service, m stackmanifest.StackManifest, primary string) []string {
	lines := []string{"  " + svc.Name + ":"}
	container := "${APP_NAME}"
	if svc.Name != primary {
		container = "${APP_NAME}-" + svc.Name
	}
	lines = append(lines, "    container_name: "+container)
	image := svc.Image
	if image == "" {
		image = envVarImage(svc.Name)
	}
	lines = append(lines,
		"    image: "+image,
		"    env_file:",
		"      - .env",
		"    restart: unless-stopped",
	)
	if svc.Profile != stackmanifest.ProfileCore {
		lines = append(lines,
			"    profiles:",
			"      - "+string(svc.Profile),
		)
	}
	if len(svc.DependsOn) > 0 {
		lines = append(lines, "    depends_on:")
		for _, d := range svc.DependsOn {
			lines = append(lines, "      - "+d)
		}
	}
	lines = append(lines,
		"    networks:",
		"      - "+m.Network.Name,
	)
	if svc.Healthcheck != "" {
		lines = append(lines, renderHealthcheck(svc.Healthcheck)...)
	}
	if svc.Role == stackmanifest.RoleServer {
		lines = append(lines, renderTraefikLabels(svc, primary)...)
	}
	return lines
}

// renderNetworks renders the top-level networks block: the reverse-proxy
// network is `external: true` everywhere EXCEPT the deployment that OWNS it
// (manifest.network.external == false); its concrete name is always the
// env-var reference ${TRAEFIK_NETWORK_NAME} (never hardcoded).
func renderNetworks(m stackmanifest.StackManifest) []string {
	lines := []string{
		"networks:",
		"  " + m.Network.Name + ":",
	}
	if m.Network.External {
		lines = append(lines, "    external: true")
	}
	return append(lines, "    name: ${TRAEFIK_NETWORK_NAME}")
}

// renderVolumes renders the top-level named bind volumes per the
// /data/dockers convention: driver local, driver_opts {type: none,
// device: ${<DEVICE_VAR>}, o: bind}. A single volume is named ${APP_NAME}
// (the boilerplate model); multiple volumes are suffixed ${APP_NAME}-<vol>.
func renderVolumes(m stackmanifest.StackManifest) []string {
	vols := sortedVolumes(m)
	if len(vols) == 0 {
		return nil
	}
	lines := []string{"volumes:"}
	for _, v := range vols {
		name := "${APP_NAME}"
		if len(vols) > 1 {
			name = "${APP_NAME}-" + v.Name
		}
		lines = append(lines,
			"  "+v.Name+":",
			"    name: "+name,
			"    driver: local",
			"    driver_opts:",
			"      type: none",
			"      device: ${"+v.DeviceVar+"}",
			"      o: bind",
		)
	}
	return lines
}

// render folds the compose document: protected header, services in stable
// order, networks, volumes — pure map + strings.Join, "\n" newlines, no
// Builder mutation across sections (the FN03 functional discipline).
func render(m stackmanifest.StackManifest, sourceHash string) []byte {
	sorted := sortedServices(m)
	primary := primaryServer(sorted)
	sections := []string{
		fmt.Sprintf("# %s. source: %s", generators.ProtectedMarker, sourceHash),
		"services:",
	}
	for _, svc := range sorted {
		sections = append(sections, strings.Join(renderService(svc, m, primary), "\n"))
	}
	sections = append(sections, "", strings.Join(renderNetworks(m), "\n"))
	if vols := renderVolumes(m); vols != nil {
		sections = append(sections, "", strings.Join(vols, "\n"))
	}
	return []byte(strings.Join(sections, "\n") + "\n")
}

// Emit is the DP03 pure emitter: it VALIDATES the StackManifest (the DP02
// pure total validator — an invalid manifest is a BlockReason carrying its
// closed code, never a guessed compose), content-addresses the source
// (stackmanifest.HashManifest — S02 reused, never forked), and RENDERS the
// /data/dockers-convention docker-compose.yml. Emit(m) is a pure function of
// Canonicalize(manifest): byte-for-byte reproducible on every run and machine.
func Emit(m stackmanifest.StackManifest) (Artifact, *blockreason.BlockReason) {
	sourceHash, err := stackmanifest.HashManifest(m)
	if err != nil {
		br := blockInvalid(err)
		return Artifact{}, &br
	}
	out := render(m, sourceHash)
	return Artifact{
		Path:       "back/gen/" + m.AppName + "/docker-compose.yml",
		Target:     TargetDockerCompose,
		Kind:       KindStackManifest,
		Bytes:      out,
		SourceHash: sourceHash,
		OutputHash: records.Hash(out),
		Protected:  true,
	}, nil
}

// Drifted reports whether emitted bytes on disk diverge from the recorded
// output_hash — i.e. the gen/ file was hand-edited (CLAUDE.md §9: forbidden;
// the drift is COMPUTED, never hunted). It REUSES the S34 drift law verbatim.
func Drifted(ledgerOutputHash string, onDisk []byte) bool {
	return generators.Drifted(ledgerOutputHash, onDisk)
}
