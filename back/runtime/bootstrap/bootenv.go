// bootenv.go — DP32 : BRANCHER S91 sur le provisioning. Le SECRET STORE PAR
// PROJET (S91, back/runtime/secretstore) alimente le .env CONCRET au boot par
// variables d'environnement, et DP12 (EmitBootstrapSequence) consomme désormais
// le VRAI store — plus le mock.
//
// THE STEP (ROADMAP-provisioning-deploy, EPIC G, sur S91 + DP04 + DP12 + DP07).
// Un app émise a besoin de SECRETS pour tourner : un credential DB, une clé API
// tierce, un secret OAuth, un certificat. DP32 les BRANCHE : au boot, l'ordre de
// merge GRAVÉ
//
//	.env.example (références DP04, ${VAR}/<<from-secret-store>>) →
//	secret store (valeurs S91 Get, scopées project_id) →
//	overrides d'environnement
//
// résout chaque référence en sa valeur concrète. Une référence requise sans
// valeur (ni store ni override) est FAIL-CLOSED : MISSING_SECRET_AT_BOOT,
// actionnable — jamais un credential blanc ou deviné (honnêteté §8).
//
// THE WALL (CLAUDE.md §2). Les secrets vivent dans le store chiffré au repos,
// scopé project_id (S91), et S55 (RLS + project_id) empêche la fuite cross-projet
// à la persistance. Ils n'entrent JAMAIS dans le truth-store, jamais git, jamais
// le source émis : le .env.example émis (DP04) ne porte QUE des références, et le
// scan déterministe (secretstore.ScanEmission — code, jamais un LLM) est vert sur
// l'émission. La valeur concrète n'existe qu'en mémoire au boot et en variable
// d'environnement dans l'appliance ; ce package ne ré-écrit jamais les bytes émis.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). MergeBootEnv est une fonction PURE, TOTALE
// de (.env.example, store-state, projectID, overrides) — pas d'horloge, pas de
// RNG, pas de fuite d'ordre d'itération : même entrée → même env concret, prouvé
// par le miroir de reproductibilité. L'ordre de merge est GRAVÉ (une liste de
// couches déclarée), jamais un sed interactif. Aucun LLM n'entre.
//
// ANTI-DUPLICATION (CLAUDE.md §9). DP32 RÉUTILISE secretstore (Get/Has/Rotate/
// ScanEmission/EnvVar) et envemit (.env.example, SecretPlaceholder, Keys) ; il ne
// les forke pas. La seule logique propre à DP32 est l'ordre de merge gravé + la
// décision de rotation append-only.

package bootstrap

import (
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/envemit"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
)

// MergeLayer is one stage of the ENGRAVED boot merge order. The set is CLOSED —
// the merge is a PURE function, never an interactive sed (DP32). The order is
// references → store → overrides : a later layer overrides an earlier one
// (last write wins), exactly the /data/dockers discipline DP04 already engraves
// for the .env.example, extended here to the CONCRETE boot env.
type MergeLayer string

const (
	// MergeLayerReferences is the .env.example (DP04) — the base key set with its
	// reference placeholders (${VAR}/<<from-secret-store>>). It declares EVERY key
	// the boot env must carry; the merge resolves the secret references over it.
	MergeLayerReferences MergeLayer = "references"
	// MergeLayerStore is the project's secret store (S91 Get, scopé project_id) —
	// each secret reference key is resolved to its encrypted-at-rest value.
	MergeLayerStore MergeLayer = "store"
	// MergeLayerOverrides is the deploy-time environment overrides — the LAST
	// engraved layer; an override of any key wins over the store and the base.
	MergeLayerOverrides MergeLayer = "overrides"
)

// bootMergeOrder is the ENGRAVED boot merge order. Declared once; BootMergeOrder
// copies it out (never derived from map iteration — determinism §6).
var bootMergeOrder = []MergeLayer{MergeLayerReferences, MergeLayerStore, MergeLayerOverrides}

// BootMergeOrder returns the engraved boot merge order (a copy — never mutable).
// It is the deterministic, GRAVED layer order MergeBootEnv applies; the Workbench
// /secret-store panel renders it so the merge is legible, never a black box.
func BootMergeOrder() []MergeLayer {
	out := make([]MergeLayer, len(bootMergeOrder))
	copy(out, bootMergeOrder)
	return out
}

// MergeBootEnv resolves the CONCRETE boot environment for a project from the
// emitted .env.example references, the project's S91 secret store, and the
// deploy-time overrides, in the ENGRAVED order references → store → overrides.
//
// It is FAIL-CLOSED and PURE :
//
//   - Layer 1 (references). It parses the .env.example KEY=VALUE lines (envemit
//     parse, reused). A key whose value is the DeployTimePlaceholder carries its
//     placeholder forward (resolved by an override or left as the documented
//     deploy-time marker — it is NOT a secret). A key whose value is the
//     SecretPlaceholder is a SECRET REFERENCE that MUST be resolved.
//   - Layer 2 (store). For each secret reference, it reads the live value from
//     the project's store (secretstore.Get, scopé project_id). A secret of
//     project A is NEVER visible under project B (scopeKey + AES-GCM AAD bind,
//     S91 ; S55 RLS at persistence).
//   - Layer 3 (overrides). A deploy-time override of ANY key wins last.
//
// A secret reference left UNRESOLVED by both the store and an override (the
// set-difference required-secret-refs − (store ∪ overrides)) is FAIL-CLOSED with
// MISSING_SECRET_AT_BOOT, the missing keys NAMED in the actionable explanation —
// the boot is refused, never started with a blank credential (honnêteté §8).
//
// On a block it returns a nil env (a blocked boot never half-resolves) + the
// BlockReason. On success it returns the concrete env map (every reference
// resolved to its value) ; the EMITTED .env.example bytes are never mutated — the
// concrete values live only in this in-memory env (the appliance boot material).
//
// MergeBootEnv is a PURE, TOTAL function of (envExample, store-state, projectID,
// overrides) : same inputs → byte-identical env (the reproducibility mirror).
func MergeBootEnv(envExample []byte, store *secretstore.SecretStore, projectID string, overrides map[string]string) (map[string]string, *blockreason.BlockReason) {
	if strings.TrimSpace(projectID) == "" {
		br := blockreason.For(blockreason.CodeMissingSecretAtBoot)
		br.Explanation = br.Explanation + " Aucun project_id n'a été passé au merge du boot (le scope d'isolation est obligatoire)."
		return nil, &br
	}

	merged := map[string]string{}
	// the secret reference keys that the store/overrides must resolve.
	secretRefs := []string{}

	// --- Layer 1: references (the .env.example base key set, DP04) -------------
	for _, line := range strings.Split(string(envExample), "\n") {
		t := strings.TrimSpace(line)
		if t == "" || strings.HasPrefix(t, "#") {
			continue
		}
		eq := strings.IndexByte(t, '=')
		if eq <= 0 {
			continue
		}
		key, val := t[:eq], t[eq+1:]
		merged[key] = val
		if val == envemit.SecretPlaceholder {
			secretRefs = append(secretRefs, key)
		}
	}
	sort.Strings(secretRefs)

	// --- Layer 2: store (S91 Get, scopé project_id) ---------------------------
	// resolve each secret reference; collect the unresolvable ones (also resolvable
	// by an override at layer 3 — so we only block AFTER the override layer).
	overridden := func(k string) bool {
		if overrides == nil {
			return false
		}
		_, ok := overrides[k]
		return ok
	}
	missing := []string{}
	for _, ref := range secretRefs {
		if overridden(ref) {
			continue // an override resolves it at layer 3 (deterministic — checked there)
		}
		v, err := store.Get(projectID, ref)
		if err != nil {
			// absent under THIS project_id (or sealed for another project — isolation).
			missing = append(missing, ref)
			continue
		}
		merged[ref] = v
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		br := blockreason.For(blockreason.CodeMissingSecretAtBoot)
		br.Explanation = br.Explanation + " Références de secret non résolues au boot (différence requises − (store ∪ overrides)) pour le projet « " +
			projectID + " » : " + strings.Join(missing, ", ") + "."
		return nil, &br
	}

	// --- Layer 3: overrides (deploy-time, win last) ---------------------------
	// applied over EVERY key (secret or deploy-time) — the engraved last layer.
	keys := make([]string, 0, len(overrides))
	for k := range overrides {
		keys = append(keys, k)
	}
	sort.Strings(keys) // deterministic application order (last-write-wins is order-free, but stable)
	for _, k := range keys {
		merged[k] = overrides[k]
	}

	return merged, nil
}

// RotationDecision is the APPEND-ONLY record of a secret rotation (the S02 truth
// shape reused below the line): WHICH secret was rotated, under WHICH project, and
// the content-address fingerprint BEFORE and AFTER — never a value in the clear
// (a decision that printed the secret would itself be a leak). The deploy track
// persists it (an append-only rotations log) and the Workbench renders it so a
// rotation is an auditable, recorded DECISION, never a silent in-place rewrite
// (CLAUDE.md §8 : « an override is not an edit, it is a recorded decision »).
type RotationDecision struct {
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	// OldFingerprint / NewFingerprint are the store's per-project content-address
	// fingerprints (secretstore.StoreFingerprint) before and after the rotation —
	// a CHANGED fingerprint proves the value moved, WITHOUT exposing it.
	OldFingerprint string `json:"old_fingerprint"`
	NewFingerprint string `json:"new_fingerprint"`
}

// RotateSecret rotates a secret through the S91 door (secretstore.Rotate) and
// returns the APPEND-ONLY RotationDecision. The rotation INVALIDATES the old
// value (S91 supersedes it — Get never returns it again) and the NEXT boot's
// MergeBootEnv injects the new one. The decision records the rotation by
// content-address fingerprint (never the values), so the deploy track can append
// it to an audit log without leaking the secret.
//
// Rotating an ABSENT secret is refused (secretstore.ErrNotFound) — you Set what
// does not exist, you Rotate what does (no silent create-on-rotate).
func RotateSecret(store *secretstore.SecretStore, projectID, name, newValue string) (RotationDecision, error) {
	before := store.StoreFingerprint(projectID)
	if err := store.Rotate(projectID, name, newValue); err != nil {
		return RotationDecision{}, err
	}
	after := store.StoreFingerprint(projectID)
	return RotationDecision{
		ProjectID:      projectID,
		Name:           name,
		OldFingerprint: before,
		NewFingerprint: after,
	}, nil
}

// ScanBootEmission is the DP32 no-leak guarantee, reusing secretstore.ScanEmission
// VERBATIM (anti-duplication §9): it runs the deterministic gitleaks-style scan
// over the emitted source (the .env.example + any other emitted artifact bytes)
// against the project's actual secret values, and reports the findings. The
// emission is clean (zero finding) by construction — the .env.example carries only
// references, and MergeBootEnv resolves them in memory, never back into the bytes.
// knownValues are the (already-decrypted) values the caller chooses to check; the
// scanner never receives the master key and redacts any match in its own report.
func ScanBootEmission(emittedSource string, knownValues []string) []secretstore.Finding {
	return secretstore.ScanEmission(emittedSource, knownValues)
}

// BootEmissionIsClean reports whether the emitted source is free of any secret
// value (references only) — the boolean the emitter gate and the Workbench read.
func BootEmissionIsClean(emittedSource string, knownValues []string) bool {
	return secretstore.IsClean(emittedSource, knownValues)
}

// SecretsStateFromStore derives the boot-time SecretsState by reading the REAL
// project-scoped secret store (S91) — DP32 replaces DP12's mock (a list of
// present NAMES passed as data) with the live store. For each secret the bundle
// REQUIRES (RequiredSecrets — one APP_SECRET_<SCOPE> per declared connector
// scope), it checks PRESENCE under the project scope (secretstore.Has, scopé
// project_id) — never reads a value (presence is leak-free) and never crosses a
// project boundary (a secret of project A is invisible under project B). The
// result is the SORTED set of required keys that are actually present in THIS
// project's store : the honest input EmitBootstrapSequence's set-difference
// consumes.
//
// DETERMINISTIC : Has is a pure membership read; the output is sorted; no LLM
// enters. A nil store yields an empty present-set (every required secret then
// fails closed — the safe default).
func SecretsStateFromStore(m stackmanifest.StackManifest, store *secretstore.SecretStore, projectID string) SecretsState {
	present := make([]string, 0)
	if store == nil || strings.TrimSpace(projectID) == "" {
		return SecretsState{Present: present}
	}
	for _, key := range RequiredSecrets(m) {
		if store.Has(projectID, key) {
			present = append(present, key)
		}
	}
	sort.Strings(present)
	return SecretsState{Present: present}
}

// EmitBootstrapSequenceWithStore is the DP32 FULLY-BRANCHED bootstrap emitter :
// it consumes the VRAI project-scoped secret store (S91) at the secrets-checked
// rung, replacing DP12's mock (the present-NAMES list passed as data). It derives
// the present-secret set from the live store under the project scope
// (SecretsStateFromStore) and delegates to EmitBootstrapSequence — so the
// MISSING_SECRET_AT_BOOT fail-closed law, the closed ordered event set, the pure
// port resolution and the wall (no secret / no hardcoded endpoint in the emitted
// sequence) all hold UNCHANGED. DP12's pure projection is reused verbatim; DP32
// only swaps the secret-presence SOURCE from a mock to the real store.
//
// Same (manifest, host, store-state, projectID) → byte-identical Sequence (the
// reproducibility mirror). A missing required secret is FAIL-CLOSED exactly as in
// DP12 — never a half-start with a blank credential (honnêteté §8).
func EmitBootstrapSequenceWithStore(m stackmanifest.StackManifest, host HostState, store *secretstore.SecretStore, projectID string) (Sequence, *blockreason.BlockReason) {
	secrets := SecretsStateFromStore(m, store, projectID)
	return EmitBootstrapSequence(m, host, secrets)
}
