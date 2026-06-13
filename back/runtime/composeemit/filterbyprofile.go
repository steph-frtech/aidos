// filterbyprofile.go is the DP11 PROFILE filter: the PURE include/exclude over
// the closed SPEC-stack-2026 profile set that DP03's Emit composes on. It adds
// no business rule — it SELECTS which services of an already-declared
// StackManifest enter the emission, deterministically:
//
//	FilterByProfile(manifest, profile, env) → (filtered manifest | BlockReason)
//
// The profile is a DECLARED parameter, never inferred (CLAUDE.md §6/§8): each
// service carries one+ profile in the closed set (stackmanifest.ServiceProfiles
// — its declared profile plus `core`, which always runs); the selection either
// is `full` (the deterministic UNION — every service) or names one closed-set
// member (every service whose closed profile set contains it). Two refusals,
// fail-closed:
//
//   - an out-of-set selection ⇒ UNKNOWN_PROFILE (the filter never coerces to the
//     nearest known profile, never silently widens to `full`);
//   - the cross `non-prod` × `prod` ⇒ DOLTGRES_NOT_ALLOWED_IN_PROD — the EXISTING
//     DP06 gate (back/runtime/envbindings.ValidateDatastore) reused verbatim:
//     prod imposes Postgres, the `non-prod` profile carries Doltgres which prod
//     forbids (SPEC-stack-2026 « PostgreSQL = la prod. Doltgres = hors prod
//     uniquement. », ADR 0065). The filter DELEGATES the verdict — it never forks
//     the rule.
//
// DETERMINISM (CLAUDE.md §6, ADR 0036): FilterByProfile is a PURE, TOTAL function
// of (manifest, profile, env) — no clock, no RNG, no I/O, no map-iteration leak;
// the kept services preserve the manifest's declared order (a copy, never a
// mutation of the caller's slice). The mirror pins «même manifest + même
// sélection ⇒ compose byte-identique». THE WALL (CLAUDE.md §2): the profiles are
// DECLARED above the line in the stack_manifest source; the SELECTION is applied
// below the line at emission — this package reads the AST and returns a narrowed
// AST + bytes, it writes no truth.
package composeemit

import (
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// FilterByProfile selects the services of a StackManifest by a DECLARED compose
// profile, against a target environment. It is the DP11 pure include/exclude:
//
//  1. the selection MUST be a member of the closed set (UNKNOWN_PROFILE else);
//  2. the cross `non-prod` × `prod` is refused via the EXISTING DP06 gate
//     (envbindings.ValidateDatastore(env, doltgres) reused verbatim —
//     DOLTGRES_NOT_ALLOWED_IN_PROD);
//  3. it keeps EXACTLY the services for which stackmanifest.ServiceInProfile(svc,
//     profile) holds — `full` keeps every service (the deterministic UNION), any
//     other profile keeps its members plus the always-running core services.
//
// The kept services preserve the manifest's declared order; everything else of
// the manifest (app name, volumes, network, connector scopes) is carried through
// unchanged. PURE: same (manifest, profile, env) → same filtered manifest.
func FilterByProfile(
	m stackmanifest.StackManifest,
	profile stackmanifest.Profile,
	env scope.Environment,
) (stackmanifest.StackManifest, *blockreason.BlockReason) {
	// (1) the selection is a DECLARED member of the closed set — never guessed.
	if !stackmanifest.IsKnownProfile(profile) {
		br := blockreason.For(blockreason.CodeUnknownProfile)
		return stackmanifest.StackManifest{}, &br
	}

	// (2) the cross non-prod × prod ⇒ Doltgres refused — DELEGATE to the existing
	// DP06 gate (never a forked rule): the `non-prod` profile carries Doltgres,
	// and prod imposes Postgres. Only the non-prod selection bites; any other
	// profile against prod passes (the gate is keyed on the doltgres datastore).
	if profile == stackmanifest.ProfileNonProd {
		if err := envbindings.ValidateDatastore(env, envbindings.DatastoreDoltgres); err != nil {
			var ref *envbindings.Refusal
			if envbindings.AsRefusal(err, &ref) && ref.Code == envbindings.CodeDoltgresNotAllowedInProd {
				br := blockreason.For(blockreason.CodeDoltgresNotAllowedInProd)
				return stackmanifest.StackManifest{}, &br
			}
			// any other DP06 refusal (unknown env / unknown datastore) is an
			// out-of-scope input — surface it as the same closed refusal so the
			// filter never passes an ill-formed cross silently.
			br := blockreason.For(blockreason.CodeDoltgresNotAllowedInProd)
			return stackmanifest.StackManifest{}, &br
		}
	}

	// (3) the pure include/exclude over the closed set — declared order preserved,
	// the caller's slice never mutated.
	kept := make([]stackmanifest.Service, 0, len(m.Services))
	for _, svc := range m.Services {
		if stackmanifest.ServiceInProfile(svc, profile) {
			kept = append(kept, svc)
		}
	}

	filtered := m
	filtered.Services = kept
	return filtered, nil
}
