// Package envemit is the DP04 emitter: the additive Targets
// `TargetEnvExample` and `TargetStartScripts` of the closed kind × target
// matrix — Emit(stack_manifest) renders deterministically the deployment's
// .env.example (every key the app expects: APP_NAME, APP_SUBDOMAIN, DOMAIN,
// CERT_RESOLVER_NAME, the volume device vars (APP_DATA_PATH),
// TRAEFIK_NETWORK_NAME, the per-service internal ports, the secret
// REFERENCES — never the values) plus the start.sh / start_with_rebuild.sh
// scripts (the deploy.sh generated templates: down → up and down →
// build --no-cache → up).
//
// THE MERGE ORDER IS ENGRAVED (DP04): the /data/dockers env merge
// (deployments/.env → boilerplates/<bp>/.env → boilerplates/<bp>/.secrets →
// deploy-time APP_NAME) is a PURE EMISSION TEMPLATE — four declared layers,
// last write wins (deploy.sh step 3 replaces the inherited APP_NAME) — never
// an interactive sed over a shell.
//
// ZERO SECRET VALUES (the S91 contract): a secret key is emitted as the
// reference `<<from-secret-store>>` — the value lives encrypted and
// project-scoped in the S91 secret store and is injected at boot
// (secretstore.InjectEnv, wired in DP32); it NEVER enters the emitted
// source, the truth-store or git. The deterministic gitleaks-like scan
// (secretstore.ScanEmission — code, never an LLM) is green on every emission
// by construction, and the property mirror proves it.
//
// THE CONTRACT IS DETERMINISM (CLAUDE.md §6, ADR 0036 EMITTED_FUNCTION_PURE):
//
//	Emit(m) is a PURE, TOTAL function of Canonicalize(manifest) — no clock,
//	no RNG, no map-iteration-order leak; keys render in stable (sorted)
//	order inside each layer, newlines are "\n". Same manifest →
//	byte-identical .env.example + scripts, 100 % of the time.
//
// COHERENCE WITH DP03: every ${VAR} the emitted docker-compose.yml references
// exists as a key of the .env.example (the property mirror crosses the two
// emitters; ComposeEnvRefs extracts the references deterministically).
//
// THE WALL (CLAUDE.md §2): the emitter only READS the StackManifest AST (the
// DP02 kernel source — SELECT-only on `kernel`) and returns the projections'
// bytes for back/gen/<app>/ (below the line). It writes no truth. An invalid
// manifest is a typed BlockReason carrying the DP02 closed validation code —
// never a panic, never a guessed emission.
//
// OpenQuestion OQ-DP04-secret-keys: the StackManifest does not yet declare
// arbitrary per-app secret keys; today's engraved derivation is the global
// PAT (the documented /data/dockers deployments/.env content) + one
// APP_SECRET_* reference per declared connector scope (named by
// secretstore.EnvVar — S91 reused). Richer per-environment secret
// declarations arrive with the Environment bindings (DP06+/DP32).
package envemit

import (
	"io/fs"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/composeemit"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
)

// The DP04 additive targets of the closed kind × target matrix. Declared,
// never invented ad hoc; the matrix stays enumerable (the honoemit/
// apisurface/composeemit pattern: each emitter package OWNS its targets).
const (
	TargetEnvExample   = "env-example"
	TargetStartScripts = "start-scripts"
)

// KindStackManifest — the source kind this emitter reads (the DP02 kernel
// record kind, reused verbatim — never re-coined).
const KindStackManifest = stackmanifest.KindStackManifest

// targetOrder is the canonical enumeration order of this package's closed
// target set (declared, never derived from map iteration).
var targetOrder = []string{TargetEnvExample, TargetStartScripts}

// Targets returns every envemit target in canonical order.
func Targets() []string {
	out := make([]string, len(targetOrder))
	copy(out, targetOrder)
	return out
}

// Layer is one stage of the ENGRAVED /data/dockers env merge order. The set
// is CLOSED — the merge is a pure emission template, never an interactive
// sed (DP04).
type Layer string

const (
	// LayerGlobal is deployments/.env — the host-global keys (the PAT).
	LayerGlobal Layer = "global"
	// LayerBoilerplateDefault is boilerplates/<bp>/.env — the boilerplate's
	// non-secret defaults (domains, network, device vars, ports, images).
	LayerBoilerplateDefault Layer = "bp-default"
	// LayerBoilerplateSecrets is boilerplates/<bp>/.secrets — appended into
	// the same merged .env; every value is an S91 secret REFERENCE here.
	LayerBoilerplateSecrets Layer = "bp-secrets"
	// LayerDeployTime is deploy.sh step 3 — APP_NAME=<name> replaces any
	// inherited value (last write wins).
	LayerDeployTime Layer = "deploy-time"
)

// layerSource documents where each layer lives in /data/dockers (rendered as
// the section comment — provenance, not behaviour).
var layerSource = map[Layer]string{
	LayerGlobal:             "deployments/.env",
	LayerBoilerplateDefault: "boilerplates/<bp>/.env",
	LayerBoilerplateSecrets: "boilerplates/<bp>/.secrets",
	LayerDeployTime:         "deploy.sh — APP_NAME remplace la valeur héritée",
}

// mergeOrder is the ENGRAVED /data/dockers merge order: global → bp-default →
// bp-secrets → deploy-time. Declared once; MergeOrder copies it out.
var mergeOrder = []Layer{LayerGlobal, LayerBoilerplateDefault, LayerBoilerplateSecrets, LayerDeployTime}

// MergeOrder returns the engraved merge order (a copy — never mutable).
func MergeOrder() []Layer {
	out := make([]Layer, len(mergeOrder))
	copy(out, mergeOrder)
	return out
}

// The two placeholder values of the .env.example. A secret key carries
// SecretPlaceholder (the S91 reference — the value is injected at boot,
// DP32); a deploy-time key carries DeployTimePlaceholder. NEVER a value.
const (
	SecretPlaceholder     = "<<from-secret-store>>"
	DeployTimePlaceholder = "<<set-at-deploy-time>>"
)

// Bundle is the DP04 emission: the three byte-stable artifacts of one
// manifest. Artifact is the published DP03 contract (composeemit), reused —
// double content-addressed, protected, below the line.
type Bundle struct {
	EnvExample       composeemit.Artifact `json:"env_example"`
	StartSh          composeemit.Artifact `json:"start_sh"`
	StartWithRebuild composeemit.Artifact `json:"start_with_rebuild_sh"`
}

// Artifacts returns the bundle's artifacts in canonical order.
func (b Bundle) Artifacts() []composeemit.Artifact {
	return []composeemit.Artifact{b.EnvExample, b.StartSh, b.StartWithRebuild}
}

// entry is one merged env key: its value and the layer of its LAST write
// (the /data/dockers merge: later layers override earlier ones).
type entry struct {
	value string
	layer Layer
}

// envVarName folds a service name to its env-var stem (the same fold as
// composeemit.envVarImage — coherence demands the identical key).
func envVarName(serviceName string) string {
	up := strings.ToUpper(serviceName)
	return strings.Map(func(r rune) rune {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			return r
		}
		return '_'
	}, up)
}

// blockInvalid renders the canonical BlockReason for an invalid manifest
// (the S13 shape: actionable, with how_to_fix — never a prison).
func blockInvalid(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission refusée : le StackManifest est invalide (" + cause.Error() +
			"). L'émetteur .env.example/scripts REND exactement les clés que la topologie déclarée attend ; " +
			"il ne devine jamais une clé, un port ou un secret (honnêteté). " +
			"Un manifest qui échoue au validateur pur DP02 n'est pas projetable.",
		HowToFix: []string{
			"fix_the_manifest : corrigez le StackManifest pour passer stackmanifest.Validate — nom d'app requis, ≥1 service role=server, ports internes uniques, rôles et profils dans leurs ensembles clos.",
			"engrave_via_goal : un manifest est une vérité au-dessus de la ligne — gravez-le par idée → miroir → /goal → approbation, jamais en passant.",
			"re_emit : relancez Emit une fois le manifest valide ; l'émission est byte-identique à chaque run.",
		},
	}
}

// mergeEnv folds the four engraved layers over a VALID manifest into the
// merged key set — a pure map: for each key, the (value, layer) of its LAST
// write in merge order (deploy.sh: later layers override earlier ones; within
// a layer, the declared build order wins last).
func mergeEnv(m stackmanifest.StackManifest) map[string]entry {
	merged := map[string]entry{}
	write := func(layer Layer, key, value string) {
		merged[key] = entry{value: value, layer: layer}
	}

	// 1. global — deployments/.env (the documented host-global key; a secret:
	// reference only, never the value).
	write(LayerGlobal, "GITHUB_PERSONAL_ACCESS_TOKEN", SecretPlaceholder)

	// 2. bp-default — boilerplates/<bp>/.env: the non-secret defaults every
	// compose reference resolves through. Deploy-time-resolved keys carry the
	// placeholder; the declared internal ports carry their declared value.
	write(LayerBoilerplateDefault, "APP_NAME", DeployTimePlaceholder) // inherited; deploy-time overrides
	write(LayerBoilerplateDefault, "APP_SUBDOMAIN", DeployTimePlaceholder)
	write(LayerBoilerplateDefault, "DOMAIN", DeployTimePlaceholder)
	write(LayerBoilerplateDefault, "CERT_RESOLVER_NAME", DeployTimePlaceholder)
	write(LayerBoilerplateDefault, "TRAEFIK_NETWORK_NAME", DeployTimePlaceholder)
	for _, v := range sortedVolumes(m) {
		write(LayerBoilerplateDefault, v.DeviceVar, DeployTimePlaceholder)
	}
	for _, s := range sortedServices(m) {
		write(LayerBoilerplateDefault, envVarName(s.Name)+"_PORT", strconv.Itoa(s.InternalPort))
	}
	for _, s := range sortedServices(m) {
		if s.Image == "" {
			// an EMITTED service (OQ-DP03-emitted-image): the compose references
			// ${<SERVICE>_IMAGE}; resolved at deploy time, never invented here.
			write(LayerBoilerplateDefault, envVarName(s.Name)+"_IMAGE", DeployTimePlaceholder)
		}
	}

	// 3. bp-secrets — boilerplates/<bp>/.secrets: one S91 reference per
	// declared connector scope (OQ-DP04-secret-keys), named by
	// secretstore.EnvVar — never a value.
	for _, scope := range sortedScopes(m) {
		write(LayerBoilerplateSecrets, secretstore.EnvVar(scope), SecretPlaceholder)
	}

	// 4. deploy-time — deploy.sh step 3: APP_NAME=<name> replaces the
	// inherited value (the observable override of the merge order).
	write(LayerDeployTime, "APP_NAME", m.AppName)

	return merged
}

// sortedServices / sortedVolumes / sortedScopes return STABLE (sorted) copies
// so no rendering ever depends on declaration order.
func sortedServices(m stackmanifest.StackManifest) []stackmanifest.Service {
	out := make([]stackmanifest.Service, len(m.Services))
	copy(out, m.Services)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func sortedVolumes(m stackmanifest.StackManifest) []stackmanifest.Volume {
	out := make([]stackmanifest.Volume, len(m.Volumes))
	copy(out, m.Volumes)
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func sortedScopes(m stackmanifest.StackManifest) []string {
	out := make([]string, len(m.ConnectorScopes))
	copy(out, m.ConnectorScopes)
	sort.Strings(out)
	return out
}

// header renders the protected first line of every emitted artifact.
func header(sourceHash string) string {
	return "# " + generators.ProtectedMarker + ". source: " + sourceHash
}

// renderEnvExample renders the merged .env.example: the protected header, the
// engraved merge-order note, then ONE section per layer in merge order, each
// listing (sorted) the keys whose LAST write belongs to that layer — the
// merged view a deployment ends with, with full layer provenance.
func renderEnvExample(m stackmanifest.StackManifest, sourceHash string) []byte {
	merged := mergeEnv(m)
	lines := []string{
		header(sourceHash),
		"# .env.example — toutes les clés attendues ; JAMAIS une valeur de secret.",
		"# Ordre de merge /data/dockers (gravé) : global → bp-default → bp-secrets → deploy-time.",
		"# Le .env mergé du déploiement est chmod 600 ; les secrets sont injectés au boot (S91).",
	}
	for _, layer := range mergeOrder {
		keys := []string{}
		for k, e := range merged {
			if e.layer == layer {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		lines = append(lines, "", "# --- "+string(layer)+" ("+layerSource[layer]+") ---")
		if len(keys) == 0 {
			// the engraved merge order stays structurally visible even when a
			// layer contributes no key to THIS manifest.
			lines = append(lines, "# (aucune clé pour ce manifest)")
		}
		for _, k := range keys {
			lines = append(lines, k+"="+merged[k].value)
		}
	}
	return []byte(strings.Join(lines, "\n") + "\n")
}

// renderStartSh renders the deploy.sh-generated restart script (down → up),
// verbatim conventions, header-protected.
func renderStartSh(sourceHash string) []byte {
	return []byte(strings.Join([]string{
		"#!/usr/bin/env bash",
		header(sourceHash),
		"# Redémarre l'instance sans reconstruire l'image",
		`cd "$(dirname "$0")"`,
		"docker compose down",
		"docker compose up -d",
	}, "\n") + "\n")
}

// renderStartWithRebuildSh renders the deploy.sh-generated rebuild script
// (down → build --no-cache → up), verbatim conventions, header-protected.
func renderStartWithRebuildSh(sourceHash string) []byte {
	return []byte(strings.Join([]string{
		"#!/usr/bin/env bash",
		header(sourceHash),
		"# Reconstruit l'image puis redémarre l'instance",
		`cd "$(dirname "$0")"`,
		"docker compose down",
		"docker compose build --no-cache",
		"docker compose up -d",
	}, "\n") + "\n")
}

// artifact assembles one double content-addressed, protected artifact.
func artifact(path, target string, out []byte, sourceHash string) composeemit.Artifact {
	return composeemit.Artifact{
		Path:       path,
		Target:     target,
		Kind:       KindStackManifest,
		Bytes:      out,
		SourceHash: sourceHash,
		OutputHash: records.Hash(out),
		Protected:  true,
	}
}

// Emit is the DP04 pure emitter: it VALIDATES the StackManifest (the DP02
// pure total validator — an invalid manifest is a BlockReason carrying its
// closed code, never a guessed emission), content-addresses the source
// (stackmanifest.HashManifest — S02 reused, never forked), and RENDERS the
// merged .env.example + the two start scripts. Emit(m) is a pure function of
// Canonicalize(manifest): byte-for-byte reproducible on every run and machine.
func Emit(m stackmanifest.StackManifest) (Bundle, *blockreason.BlockReason) {
	sourceHash, err := stackmanifest.HashManifest(m)
	if err != nil {
		br := blockInvalid(err)
		return Bundle{}, &br
	}
	base := "back/gen/" + m.AppName + "/"
	return Bundle{
		EnvExample:       artifact(base+".env.example", TargetEnvExample, renderEnvExample(m, sourceHash), sourceHash),
		StartSh:          artifact(base+"start.sh", TargetStartScripts, renderStartSh(sourceHash), sourceHash),
		StartWithRebuild: artifact(base+"start_with_rebuild.sh", TargetStartScripts, renderStartWithRebuildSh(sourceHash), sourceHash),
	}, nil
}

// Mode is the /data/dockers §chmod discipline as a PURE function of the
// projection path: .env files (even the example) are 0600, scripts are 0755,
// anything else 0644. Deterministic — same path → same mode.
func Mode(path string) fs.FileMode {
	name := path
	if i := strings.LastIndexByte(path, '/'); i >= 0 {
		name = path[i+1:]
	}
	switch {
	case strings.HasPrefix(name, ".env"):
		return 0o600
	case strings.HasSuffix(name, ".sh"):
		return 0o755
	default:
		return 0o644
	}
}

// Keys parses the keys of a rendered .env.example — a pure, total parse
// (KEY=… lines; comments and blanks skipped), in document order.
func Keys(envExample []byte) []string {
	keys := []string{}
	for _, line := range strings.Split(string(envExample), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}
		if eq := strings.IndexByte(trimmed, '='); eq > 0 {
			keys = append(keys, trimmed[:eq])
		}
	}
	return keys
}

// envRef matches one ${VAR} environment reference of an emitted compose.
var envRef = regexp.MustCompile(`\$\{([A-Z][A-Z0-9_]*)\}`)

// ComposeEnvRefs extracts the ${VAR} references of an emitted
// docker-compose.yml — deduped, sorted, deterministic (the DP03↔DP04
// coherence law's left-hand side).
func ComposeEnvRefs(compose []byte) []string {
	seen := map[string]bool{}
	for _, match := range envRef.FindAllStringSubmatch(string(compose), -1) {
		seen[match[1]] = true
	}
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// Drifted reports whether emitted bytes on disk diverge from the recorded
// output_hash — i.e. the gen/ file was hand-edited (CLAUDE.md §9: forbidden;
// the drift is COMPUTED, never hunted). It REUSES the S34 drift law verbatim.
func Drifted(ledgerOutputHash string, onDisk []byte) bool {
	return generators.Drifted(ledgerOutputHash, onDisk)
}
