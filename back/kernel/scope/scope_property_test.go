package scope_test

// Property mirror (∀) for the TruthScope active-truth guard. reflects=kernel.scope,
// test_kind=property, cert_language=rapid, liveness=live, authority=above (this is the
// CANONICAL mirror for the scope guard — the human red of KRD §13.7, not a means-test
// the agent invented). Run via `go test` (rapid is the frozen invariant slot, ADR 0003).
//
// The invariants are KRD §13.7 verbatim ("aucune vérité n'est universelle par défaut"):
//
//   1. THE LOAD-BEARING RULE (the done criterion). ∀ record with status==active ∧ scope
//      absent/empty ∧ ¬IsGlobal ⇒ Validate rejects with "active truth without a scope".
//   2. EXPLICIT GLOBAL. ∀ record status==active ∧ IsGlobal(scope) (region=="*") ⇒ Validate
//      passes — the only universal is the deliberate "*" escape hatch.
//   3. PRESENT SCOPE. ∀ record status==active ∧ scope present & non-empty ⇒ Validate passes.
//   4. NON-ACTIVE EXEMPTION. ∀ record status!=active ⇒ Validate passes — the rule binds
//      ACTIVE truths only (an idea/deprecated/shadowed/removed truth may be scope-less).
//   5. IsGlobal ⇔ region == "*" (nil/empty scope is NOT global — global is never implicit).
//   6. FIELD VALIDITY from §13.7 enums verbatim (region/target/user_segment/environment).
//   7. CONTENT-ADDRESS TIE-IN (S02 substrate): a record carrying a scope round-trips as a
//      content-addressed body — id == version == Hash(Canonicalize(serialize(record))) —
//      and changing the scope yields a DIFFERENT version (a new row, never an in-place
//      mutation).

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
	"pgregory.net/rapid"
)

// drawRegion draws a Region: usually a known §13.7 one (incl. the "*" global), sometimes
// empty (absent), sometimes an arbitrary out-of-enum string.
func drawRegion(rt *rapid.T) scope.Region {
	switch rapid.IntRange(0, 2).Draw(rt, "regionChoice") {
	case 0:
		known := scope.Regions()
		return known[rapid.IntRange(0, len(known)-1).Draw(rt, "knownRegion")]
	case 1:
		return ""
	default:
		return scope.Region(rapid.String().Draw(rt, "arbitraryRegion"))
	}
}

// drawScope draws a TruthScope spanning: empty (zero value), global ("*"), present
// non-empty, and shapes with arbitrary/known field values.
func drawScope(rt *rapid.T) scope.TruthScope {
	switch rapid.IntRange(0, 3).Draw(rt, "scopeChoice") {
	case 0:
		return scope.TruthScope{} // empty / absent
	case 1:
		return scope.TruthScope{Region: scope.RegionGlobal} // explicit global
	case 2:
		// a present, non-empty, region-bounded scope
		regs := []scope.Region{scope.RegionFR, scope.RegionEU, scope.RegionUS}
		return scope.TruthScope{
			Region:      regs[rapid.IntRange(0, len(regs)-1).Draw(rt, "presentRegion")],
			Tenant:      rapid.String().Draw(rt, "tenant"),
			Environment: scope.EnvProd,
		}
	default:
		return scope.TruthScope{Region: drawRegion(rt)}
	}
}

// drawStatus draws a lifecycle status (KRD §44.2): usually a known one, sometimes empty,
// sometimes arbitrary.
func drawStatus(rt *rapid.T) scope.LifecycleStatus {
	switch rapid.IntRange(0, 2).Draw(rt, "statusChoice") {
	case 0:
		known := scope.Statuses()
		return known[rapid.IntRange(0, len(known)-1).Draw(rt, "knownStatus")]
	case 1:
		return ""
	default:
		return scope.LifecycleStatus(rapid.String().Draw(rt, "arbitraryStatus"))
	}
}

func drawRecord(rt *rapid.T) scope.Record {
	return scope.Record{Status: drawStatus(rt), Scope: drawScope(rt)}
}

// TestActiveTruthWithoutScopeRejected — THE load-bearing rule. An active, scope-less,
// non-global record is rejected with "active truth without a scope".
func TestActiveTruthWithoutScopeRejected(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		rec := drawRecord(rt)
		err := scope.Validate(rec)
		scopeless := scope.IsEmpty(rec.Scope) && !scope.IsGlobal(rec.Scope)
		if rec.Status == scope.StatusActive && scopeless {
			if err == nil {
				rt.Fatalf("active scope-less truth must be rejected (rec %+v)", rec)
			}
			var re *scope.RejectedError
			if !scope.AsRejected(err, &re) {
				rt.Fatalf("rejection must be a RejectedError (rec %+v): %v", rec, err)
			}
		}
	})
}

// TestActiveGlobalPasses — explicit global ("*") is the only universal: it passes.
func TestActiveGlobalPasses(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		rec := scope.Record{Status: scope.StatusActive, Scope: scope.TruthScope{Region: scope.RegionGlobal}}
		if err := scope.Validate(rec); err != nil {
			rt.Fatalf("active explicit-global truth must pass, got %v", err)
		}
		if !scope.IsGlobal(rec.Scope) {
			rt.Fatalf("region == \"*\" must be IsGlobal")
		}
	})
}

// TestActivePresentScopePasses — an active truth with a present, non-empty scope passes.
func TestActivePresentScopePasses(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		regs := []scope.Region{scope.RegionFR, scope.RegionEU, scope.RegionUS}
		s := scope.TruthScope{
			Region: regs[rapid.IntRange(0, len(regs)-1).Draw(rt, "r")],
		}
		rec := scope.Record{Status: scope.StatusActive, Scope: s}
		if scope.IsEmpty(s) {
			rt.Fatalf("a region-bound scope must not be empty: %+v", s)
		}
		if err := scope.Validate(rec); err != nil {
			rt.Fatalf("active present-scope truth must pass, got %v (scope %+v)", err, s)
		}
	})
}

// TestNonActiveExemption — the rule binds ACTIVE truths only; any other status passes
// even with an empty scope.
func TestNonActiveExemption(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		rec := drawRecord(rt)
		if rec.Status != scope.StatusActive {
			if err := scope.Validate(rec); err != nil {
				rt.Fatalf("non-active record must pass (rule binds active only), got %v (rec %+v)", err, rec)
			}
		}
	})
}

// TestIsGlobalIffStar — IsGlobal(scope) ⇔ scope.Region == "*"; nil/empty is NOT global.
func TestIsGlobalIffStar(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := drawScope(rt)
		if scope.IsGlobal(s) != (s.Region == scope.RegionGlobal) {
			rt.Fatalf("IsGlobal must be exactly region==\"*\" (scope %+v)", s)
		}
		// the empty scope is explicitly not global
		if scope.IsGlobal(scope.TruthScope{}) {
			rt.Fatalf("the empty scope must NOT be global (global is never implicit)")
		}
	})
}

// TestFieldValidityFromEnums — §13.7 enum membership: ValidateShape rejects an
// out-of-enum field and accepts every declared member.
func TestFieldValidityFromEnums(t *testing.T) {
	// Every declared member is accepted in its slot.
	for _, r := range scope.Regions() {
		if err := scope.ValidateShape(scope.TruthScope{Region: r}); err != nil {
			t.Fatalf("region %q must be a valid shape, got %v", r, err)
		}
	}
	for _, tg := range scope.Targets() {
		if err := scope.ValidateShape(scope.TruthScope{Region: scope.RegionFR, Target: tg}); err != nil {
			t.Fatalf("target %q must be a valid shape, got %v", tg, err)
		}
	}
	for _, seg := range scope.UserSegments() {
		if err := scope.ValidateShape(scope.TruthScope{Region: scope.RegionFR, UserSegment: seg}); err != nil {
			t.Fatalf("segment %q must be a valid shape, got %v", seg, err)
		}
	}
	for _, env := range scope.Environments() {
		if err := scope.ValidateShape(scope.TruthScope{Region: scope.RegionFR, Environment: env}); err != nil {
			t.Fatalf("environment %q must be a valid shape, got %v", env, err)
		}
	}
	// Out-of-enum values are rejected by ValidateShape.
	rapid.Check(t, func(rt *rapid.T) {
		bad := scope.TruthScope{Region: scope.Region(rapid.StringMatching(`[A-Z]{2,3}`).Draw(rt, "bad"))}
		if scope.IsKnownRegion(bad.Region) {
			return // drew a real one by chance; not the case under test
		}
		if err := scope.ValidateShape(bad); err == nil {
			rt.Fatalf("out-of-enum region %q must fail ValidateShape", bad.Region)
		}
	})
}

// TestExactEnumCardinality — the enums are EXACTLY the §13.7 members (region 4 incl. "*",
// target 5, segment 3, environment 3). A change to a set trips this mirror.
func TestExactEnumCardinality(t *testing.T) {
	if got := len(scope.Regions()); got != 4 {
		t.Fatalf("Region cardinality = %d, want 4 (FR|EU|US|*) (KRD §13.7)", got)
	}
	if got := len(scope.Targets()); got != 5 {
		t.Fatalf("Target cardinality = %d, want 5 (web|mobile|voice|xr|iot)", got)
	}
	if got := len(scope.UserSegments()); got != 3 {
		t.Fatalf("UserSegment cardinality = %d, want 3 (premium|standard|guest)", got)
	}
	if got := len(scope.Environments()); got != 5 {
		t.Fatalf("Environment cardinality = %d, want 5 (prod|staging|dev|local|future_cloud) (KRD §13.7 + ADR 0065/DP06)", got)
	}
	if got := len(scope.Statuses()); got != 4 {
		t.Fatalf("LifecycleStatus cardinality = %d, want 4 (active|deprecated|shadowed|removed) (KRD §44.2)", got)
	}
}

// TestEnvironmentWideningIsAdditive — DP06 (ADR 0065, Amendement A6): the S15
// trio {prod,staging,dev} is PRESERVED as the canonical-order prefix and the two
// DP06 members {local,future_cloud} are APPENDED — every scope valid before the
// widening stays valid (additive only, no existing truth invalidated).
func TestEnvironmentWideningIsAdditive(t *testing.T) {
	envs := scope.Environments()
	wantPrefix := []scope.Environment{scope.EnvProd, scope.EnvStaging, scope.EnvDev}
	for i, e := range wantPrefix {
		if envs[i] != e {
			t.Fatalf("the S15 prefix must be preserved: Environments()[%d] = %q, want %q", i, envs[i], e)
		}
	}
	if envs[3] != scope.EnvLocal || envs[4] != scope.EnvFutureCloud {
		t.Fatalf("the DP06 members must be APPENDED (local, future_cloud), got %v", envs[3:])
	}
	// Every member — legacy and new — is a valid shape on an active truth.
	for _, e := range envs {
		rec := scope.Record{Status: scope.StatusActive, Scope: scope.TruthScope{Environment: e}}
		if err := scope.Validate(rec); err != nil {
			t.Fatalf("an active truth scoped to %q must validate (additivity), got %v", e, err)
		}
	}
}

// TestValidateDeterministic — same record ⇒ same verdict; never panics on any input.
func TestValidateDeterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		rec := drawRecord(rt)
		a := scope.Validate(rec)
		b := scope.Validate(rec)
		if (a == nil) != (b == nil) {
			rt.Fatalf("error-ness diverged: %v vs %v (rec %+v)", a, b, rec)
		}
	})
}

// TestContentAddressTieIn — a scope rides INSIDE the content-addressed body: serializing
// a truth body with a scope round-trips as id == version == Hash(Canonicalize(body)), and
// changing the scope yields a DIFFERENT version (a new row, never an in-place mutation).
func TestContentAddressTieIn(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := drawScope(rt)
		body, err := scope.SerializeTruthBody(s)
		if err != nil {
			rt.Fatalf("serialize scope into a truth body: %v", err)
		}
		rec, err := records.NewRecord(records.KindTruth, body)
		if err != nil {
			rt.Fatalf("NewRecord over a scoped truth body: %v", err)
		}
		if err := records.Validate(rec); err != nil {
			rt.Fatalf("scoped truth record must satisfy the content-address invariant: %v", err)
		}
		want := records.Hash(rec.Body)
		if rec.ID != want || rec.Version != want {
			rt.Fatalf("id == version == Hash must hold: id=%q version=%q want=%q", rec.ID, rec.Version, want)
		}
		// Changing the scope changes the version (never an in-place mutation).
		s2 := s
		if s2.Region == scope.RegionFR {
			s2.Region = scope.RegionEU
		} else {
			s2.Region = scope.RegionFR
		}
		body2, _ := scope.SerializeTruthBody(s2)
		rec2, err := records.NewRecord(records.KindTruth, body2)
		if err != nil {
			rt.Fatalf("NewRecord over the re-scoped body: %v", err)
		}
		if rec2.Version == rec.Version {
			rt.Fatalf("a scope change MUST yield a new version (got the same %q)", rec.Version)
		}
	})
}
