// Package bootstrap is the DP12 deterministic one-shot BOOTSTRAP emitter
// (ROADMAP-provisioning-deploy, unlocked by the DP10 measured GO + ADR 0067,
// reusing DP04 envemit / S91 secretstore / DP02 stackmanifest / DP07
// connresolve conventions).
//
// THE STEP. The DP10 spike PROVED by measurement that a deterministic one-shot
// emitted bootstrap (port resolution + start order as PURE functions of the
// observed host state, healthchecks, print-URLs) beats calling deploy.sh
// directly (7 interactive prompts, 3 hardcoded /data/dockers references). DP12
// emits that amorçage sequence FOR REAL — but as a PURE PROJECTION: a closed,
// ordered set of EVENTS, never a live docker run (the actual execution stays
// gated, exactly as the spike kept it). The sequence is:
//
//	network-created → volumes-created → env-materialized → secrets-checked →
//	ports-resolved → traefik-up → datastore-up → server-up → healthy →
//	urls-printed
//
// or a fail-closed BlockReason.
//
// THREE done-criteria (all DETERMINISTIC — §6/§8):
//
//   - A REQUIRED SECRET MISSING ⇒ MISSING_SECRET_AT_BOOT (actionable). The
//     required-secret set is DERIVED from the manifest's declared connector
//     scopes (the DP04 envemit motif: one APP_SECRET_<SCOPE> per scope), never
//     invented; the check is a set-difference (required − present), never an
//     LLM. The boot is refused, never started with a blank credential.
//   - A PORT OCCUPIED ⇒ resolved DETERMINISTICALLY (host ss + docker ps AS DATA
//     → first-free-≥-base, a PURE rule, never a prompt) — ported verbatim from
//     the DP10 spike (front/web/lib/bootstrap-spike.ts: parseSS/parseDockerPS/
//     occupiedFrom/resolvePort).
//   - THE WALL. The concrete .env + secrets live in the APPLIANCE at boot
//     (chmod 600, gitignored), NEVER in the emitted source / truth-store / git
//     (below the line). The emitted SEQUENCE carries no secret value and no
//     hardcoded endpoint — only ${VAR}-shaped references and env-var NAMES.
//
// DETERMINISM-FIRST. EmitBootstrapSequence is a PURE, TOTAL function of
// (Canonicalize(manifest), host state, present-secret set): no clock, no RNG,
// no I/O, no map-iteration-order leak. Same inputs → byte-identical sequence,
// content-addressed via records.Hash (S02 reused). No real docker is run here;
// the events are a deterministic plan-as-data the DP-track executor (the gated
// real run) and the Workbench consume.
//
// THE WALL (CLAUDE.md §2). This package is Runtime plumbing BELOW the line: it
// READS the StackManifest AST (the DP02 kernel source) and the observed host
// state, and returns the projection's events. It writes no truth. An invalid
// manifest is the typed DP02 BlockReason; a missing secret the DP12
// MISSING_SECRET_AT_BOOT — never a panic, never a guessed emission.
package bootstrap

import (
	"sort"
	"strconv"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
)

// BasePort is the DECLARED base host port the bootstrap resolves from — the
// first free port ≥ BasePort wins (the DP10 spike rule; the spike used 18080
// for its throwaway traefik, DP12 emits the real one-shot from port 80, the
// /data/dockers convention for the public web entrypoint behind traefik).
const BasePort = 80

// EventKind is one rung of the CLOSED, ORDERED bootstrap sequence. The set is
// CLOSED (DP12): an unknown kind does not exist — EmitBootstrapSequence emits
// EXACTLY these, in this order, or a BlockReason.
type EventKind string

const (
	// EventNetworkCreated — the shared docker network is created (the external
	// traefik_default network the appliance joins).
	EventNetworkCreated EventKind = "network-created"
	// EventVolumesCreated — the named bind volumes are created (${APP_DATA_PATH}
	// device references — never a hardcoded path).
	EventVolumesCreated EventKind = "volumes-created"
	// EventEnvMaterialized — the concrete .env is materialized IN THE APPLIANCE
	// (chmod 600, gitignored), from the DP04-emitted .env.example merged with the
	// deploy-time values — never in the emitted source/truth-store/git.
	EventEnvMaterialized EventKind = "env-materialized"
	// EventSecretsChecked — the required secrets (one per declared connector
	// scope) are verified present in the appliance's secret store; a missing one
	// fails closed BEFORE this event (MISSING_SECRET_AT_BOOT).
	EventSecretsChecked EventKind = "secrets-checked"
	// EventPortsResolved — the host port is resolved deterministically from the
	// observed state (ss ∪ docker ps → first-free-≥-base).
	EventPortsResolved EventKind = "ports-resolved"
	// EventTraefikUp — the reverse-proxy front is up (the public exposure layer).
	EventTraefikUp EventKind = "traefik-up"
	// EventDatastoreUp — the datastore is up (postgres / the declared datastore).
	EventDatastoreUp EventKind = "datastore-up"
	// EventServerUp — the application server is up (the role=server service).
	EventServerUp EventKind = "server-up"
	// EventHealthy — every service passed its healthcheck (the blocking gate).
	EventHealthy EventKind = "healthy"
	// EventURLsPrinted — the access URLs are printed (the one-shot's output).
	EventURLsPrinted EventKind = "urls-printed"
)

// orderedKinds is the CLOSED bootstrap sequence in its DECLARED order. Declared
// once; OrderedKinds / Kinds copy it out (never derived from map iteration).
var orderedKinds = []EventKind{
	EventNetworkCreated,
	EventVolumesCreated,
	EventEnvMaterialized,
	EventSecretsChecked,
	EventPortsResolved,
	EventTraefikUp,
	EventDatastoreUp,
	EventServerUp,
	EventHealthy,
	EventURLsPrinted,
}

// OrderedKinds returns the closed bootstrap sequence in its declared order (a
// copy — never mutable).
func OrderedKinds() []EventKind {
	out := make([]EventKind, len(orderedKinds))
	copy(out, orderedKinds)
	return out
}

// Kinds returns every bootstrap event kind (== OrderedKinds; the order IS the
// canonical enumeration).
func Kinds() []EventKind { return OrderedKinds() }

// IsKnownKind reports whether k is a member of the closed set.
func IsKnownKind(k EventKind) bool {
	for _, known := range orderedKinds {
		if known == k {
			return true
		}
	}
	return false
}

// Event is one rung of the emitted sequence: its 1-based position, its kind and
// a deterministic detail (a NAME or a ${VAR} reference — never a secret value,
// never a hardcoded endpoint).
type Event struct {
	Seq    int       `json:"seq"`
	Kind   EventKind `json:"kind"`
	Detail string    `json:"detail"`
}

// Sequence is the emitted bootstrap projection: the ordered events plus the
// deterministically resolved host port. Content-addressed via Hash.
type Sequence struct {
	Events       []Event `json:"events"`
	ResolvedPort int     `json:"resolved_port"`
}

// Hash is the content address of the sequence (records.Hash over the canonical
// rendering — S02 reused). Same sequence → same address; the replay mirror pins
// that EmitBootstrapSequence is byte-stable.
func (s Sequence) Hash() string {
	var b strings.Builder
	b.WriteString("port=")
	b.WriteString(strconv.Itoa(s.ResolvedPort))
	b.WriteString("\n")
	for _, e := range s.Events {
		b.WriteString("e=")
		b.WriteString(strconv.Itoa(e.Seq))
		b.WriteString(":")
		b.WriteString(string(e.Kind))
		b.WriteString(":")
		b.WriteString(e.Detail)
		b.WriteString("\n")
	}
	return records.Hash([]byte(b.String()))
}

// HostState is the OBSERVED host snapshot AS DATA (the DP10 spike convention):
// the raw `ss -ltn` output and the raw `docker ps -a --format '{{.Ports}}'`
// output. The resolver is a PURE function of this data — the snapshot is taken
// by the gated executor (host ss + docker ps), never inside this package.
type HostState struct {
	SSOutput       string `json:"ss_output"`
	DockerPSOutput string `json:"docker_ps_output"`
}

// SecretsState is the set of secret env-var NAMES present in the appliance's
// secret store at boot (APP_SECRET_<SCOPE> — secretstore.EnvVar). It carries
// NO value: the values live encrypted in the store (S91), injected at boot;
// this package only checks PRESENCE (a set-difference), never reads a value.
type SecretsState struct {
	Present []string `json:"present"`
}

// RequiredSecrets derives the set of secret env-var names the bundle requires
// at boot — ONE APP_SECRET_<SCOPE> per declared connector scope (the DP04
// envemit motif, reused verbatim via secretstore.EnvVar). DETERMINISTIC: sorted,
// de-duplicated; never invented (honesty §8 — a bundle with no connector scope
// requires no secret).
func RequiredSecrets(m stackmanifest.StackManifest) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(m.ConnectorScopes))
	for _, scope := range m.ConnectorScopes {
		if strings.TrimSpace(scope) == "" {
			continue
		}
		v := secretstore.EnvVar(scope)
		if seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}

// --- the PURE port resolution, ported from the DP10 spike (front twin) -------

// OccupiedFrom is the occupied host-port set = ss ∪ docker ps (the deploy.sh
// check, as a PURE function over the observed data). Ported verbatim from the
// DP10 spike's occupiedFrom.
func OccupiedFrom(host HostState) map[int]bool {
	occupied := map[int]bool{}
	for _, p := range parseSS(host.SSOutput) {
		occupied[p] = true
	}
	for _, p := range parseDockerPS(host.DockerPSOutput) {
		occupied[p] = true
	}
	return occupied
}

// ResolvePort is the DP12 pure port rule: the FIRST free port ≥ BasePort given
// the observed host state. PURE — never a prompt: same host state → same port
// (the DP10 spike's resolvePort, ported). Total: a free port always exists below
// the 16-bit ceiling for any realistic occupied set.
func ResolvePort(host HostState) int {
	occupied := OccupiedFrom(host)
	p := BasePort
	for occupied[p] {
		p++
	}
	return p
}

// parseSS parses the listening ports from raw `ss -ltn` output — only LISTEN
// lines, the port after the LAST ':' of the local address. PURE, total.
func parseSS(out string) []int {
	seen := map[int]bool{}
	for _, line := range strings.Split(out, "\n") {
		if !strings.Contains(line, "LISTEN") {
			continue
		}
		for _, field := range strings.Fields(line) {
			if i := strings.LastIndexByte(field, ':'); i >= 0 {
				if p, err := strconv.Atoi(field[i+1:]); err == nil {
					seen[p] = true
				}
			}
		}
	}
	return sortedKeys(seen)
}

// parseDockerPS parses the host-mapped ports from raw `docker ps` Ports output:
// the `:<host>-><container>` mappings. PURE, total.
func parseDockerPS(out string) []int {
	seen := map[int]bool{}
	for _, seg := range strings.Split(out, "\n") {
		for {
			arrow := strings.Index(seg, "->")
			if arrow < 0 {
				break
			}
			head := seg[:arrow]
			if colon := strings.LastIndexByte(head, ':'); colon >= 0 {
				if p, err := strconv.Atoi(head[colon+1:]); err == nil {
					seen[p] = true
				}
			}
			seg = seg[arrow+2:]
		}
	}
	return sortedKeys(seen)
}

func sortedKeys(m map[int]bool) []int {
	out := make([]int, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Ints(out)
	return out
}

// --- the emitter --------------------------------------------------------------

// missingSecrets computes the fail-closed set-difference required − present
// (sorted, deterministic). An empty result means the secrets-checked rung
// passes.
func missingSecrets(required []string, secrets SecretsState) []string {
	present := map[string]bool{}
	for _, s := range secrets.Present {
		present[strings.TrimSpace(s)] = true
	}
	missing := make([]string, 0, len(required))
	for _, r := range required {
		if !present[r] {
			missing = append(missing, r)
		}
	}
	sort.Strings(missing)
	return missing
}

// blockMissingSecret renders the DP12 fail-closed BlockReason, naming the
// missing keys (the actionable how_to_fix — never a prison).
func blockMissingSecret(missing []string) blockreason.BlockReason {
	br := blockreason.For(blockreason.CodeMissingSecretAtBoot)
	br.Explanation = br.Explanation + " Clés manquantes (différence requises − présentes) : " +
		strings.Join(missing, ", ") + "."
	return br
}

// EmitBootstrapSequence is the DP12 PURE emitter: it VALIDATES the manifest (the
// DP02 pure total validator — an invalid manifest is the DP02 BlockReason), then
// FAILS CLOSED if a required secret is absent (MISSING_SECRET_AT_BOOT), then
// resolves the host port DETERMINISTICALLY (ss ∪ docker ps → first-free-≥-base)
// and renders the CLOSED, ORDERED event sequence. It runs NO real docker: the
// events are a deterministic plan-as-data. Same (manifest, host, secrets) →
// byte-identical Sequence.
//
// On a block it returns the zero Sequence (no event) + the BlockReason — a
// blocked bootstrap never half-starts.
func EmitBootstrapSequence(m stackmanifest.StackManifest, host HostState, secrets SecretsState) (Sequence, *blockreason.BlockReason) {
	// 1. the manifest must be a VALID DP02 source (never a guessed emission).
	if err := stackmanifest.Validate(m); err != nil {
		br := blockInvalid(err)
		return Sequence{}, &br
	}

	// 2. fail closed on a missing required secret BEFORE any rung is emitted.
	required := RequiredSecrets(m)
	if missing := missingSecrets(required, secrets); len(missing) > 0 {
		br := blockMissingSecret(missing)
		return Sequence{}, &br
	}

	// 3. resolve the host port deterministically (the DP10 spike rule).
	port := ResolvePort(host)

	// 4. render the closed, ordered sequence — every detail is a NAME or a
	// ${VAR} reference, never a secret value, never a hardcoded endpoint.
	details := map[EventKind]string{
		EventNetworkCreated:  m.Network.Name,
		EventVolumesCreated:  volumeRefs(m),
		EventEnvMaterialized: "${APP_DATA_PATH}/.env (chmod 600, gitignored — appliance only)",
		EventSecretsChecked:  secretsDetail(required),
		EventPortsResolved:   "host port " + strconv.Itoa(port) + " (résolu depuis ss ∪ docker ps — premier libre ≥ base)",
		EventTraefikUp:       containerName(m, frontService(m)),
		EventDatastoreUp:     containerName(m, datastoreService(m)),
		EventServerUp:        containerName(m, serverService(m)),
		EventHealthy:         healthyDetail(m),
		EventURLsPrinted:     "https://${APP_SUBDOMAIN}.${DOMAIN}",
	}

	events := make([]Event, 0, len(orderedKinds))
	for i, kind := range orderedKinds {
		events = append(events, Event{Seq: i + 1, Kind: kind, Detail: details[kind]})
	}
	return Sequence{Events: events, ResolvedPort: port}, nil
}

// blockInvalid folds the DP02 closed validation code into the canonical
// BlockReason (the S13 shape: actionable, with how_to_fix — never a prison).
func blockInvalid(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Bootstrap refusé (DP12) : le StackManifest est invalide (" + cause.Error() +
			"). L'émetteur de séquence d'amorçage REND exactement la topologie déclarée par la source ; " +
			"il ne devine jamais un rôle, un port ou un service (honnêteté). " +
			"Un manifest qui échoue au validateur pur DP02 n'est pas amorçable.",
		HowToFix: []string{
			"fix_the_manifest : corrigez le StackManifest pour passer stackmanifest.Validate — nom d'app requis, ≥1 service role=server, ports internes uniques, rôles et profils dans leurs ensembles clos.",
			"engrave_via_goal : un manifest est une vérité au-dessus de la ligne — gravez-le par idée → miroir → /goal → approbation, jamais en passant.",
			"re_emit : relancez EmitBootstrapSequence une fois le manifest valide ; l'émission est byte-identique à chaque run.",
		},
	}
}

// --- deterministic detail helpers (NAMES + ${VAR} refs only, no secret/host) --

// containerName is the /data/dockers container-name convention (DP07 reused):
// the primary server is ${APP_NAME}, every other service ${APP_NAME}-<name>.
func containerName(m stackmanifest.StackManifest, svc *stackmanifest.Service) string {
	if svc == nil {
		return "${APP_NAME}"
	}
	if svc.Role == stackmanifest.RoleServer {
		return "${APP_NAME}"
	}
	return "${APP_NAME}-" + svc.Name
}

// frontService is the reverse-proxy front of the stack — the observability/edge
// role if present (traefik), else the server (the public exposure). Deterministic
// (sorted-name first match).
func frontService(m stackmanifest.StackManifest) *stackmanifest.Service {
	if s := firstWithRole(m, stackmanifest.RoleObservability); s != nil {
		return s
	}
	return serverService(m)
}

// datastoreService is the datastore role (postgres) if present, else nil.
func datastoreService(m stackmanifest.StackManifest) *stackmanifest.Service {
	return firstWithRole(m, stackmanifest.RoleDatastore)
}

// serverService is the role=server service (guaranteed present by Validate).
func serverService(m stackmanifest.StackManifest) *stackmanifest.Service {
	return firstWithRole(m, stackmanifest.RoleServer)
}

// firstWithRole returns the first service of a role in STABLE (sorted-name)
// order — deterministic, never declaration-order dependent.
func firstWithRole(m stackmanifest.StackManifest, role stackmanifest.Role) *stackmanifest.Service {
	svcs := make([]stackmanifest.Service, len(m.Services))
	copy(svcs, m.Services)
	sort.Slice(svcs, func(i, j int) bool { return svcs[i].Name < svcs[j].Name })
	for i := range svcs {
		if svcs[i].Role == role {
			s := svcs[i]
			return &s
		}
	}
	return nil
}

// volumeRefs renders the bind-volume device references (${VAR}) in sorted order
// — never a hardcoded path.
func volumeRefs(m stackmanifest.StackManifest) string {
	refs := make([]string, 0, len(m.Volumes))
	for _, v := range m.Volumes {
		refs = append(refs, "${"+v.DeviceVar+"}")
	}
	sort.Strings(refs)
	if len(refs) == 0 {
		return "(aucun volume nommé)"
	}
	return strings.Join(refs, ", ")
}

// secretsDetail names the REQUIRED secret env-var NAMES (never a value) checked
// at boot — sorted, deterministic.
func secretsDetail(required []string) string {
	if len(required) == 0 {
		return "(aucun secret requis)"
	}
	return strings.Join(required, ", ")
}

// healthyDetail lists the services whose healthcheck must pass — the container
// names in sorted order (NAMES only).
func healthyDetail(m stackmanifest.StackManifest) string {
	svcs := make([]stackmanifest.Service, len(m.Services))
	copy(svcs, m.Services)
	sort.Slice(svcs, func(i, j int) bool { return svcs[i].Name < svcs[j].Name })
	names := make([]string, 0, len(svcs))
	for i := range svcs {
		names = append(names, containerName(m, &svcs[i]))
	}
	return strings.Join(names, ", ")
}
