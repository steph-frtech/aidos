package policy_test

// Fixture mirror (N2: state → command → events), interpreted in Go.
// reflects=kernel.policy/canPlaceOrder · test_kind=fixture · cert_language=go ·
// liveness=live · authority=above.
//
// Materialized source: tests/kernel/policy_eval.fixture.md (the human-readable
// fixture, conceptually stored in the `mirrors` schema; persisted to Postgres at
// S06). Each case below is one fixture row: an authorization Ctx (state), the §93
// canPlaceOrder policy (command), and the expected Decision (events). It pins the
// concrete §93 verdicts the ∀ property generalizes — a MEANS-test toward the human
// red, never a self-graded truth.

import (
	"encoding/json"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/policy"
)

func TestPolicyFixtures(t *testing.T) {
	cases := []struct {
		name string
		ctx  string // $-rooted JSON authorization context
		want policy.Decision
	}{
		{
			name: "ALLOW: authed user, matching cart, non-empty",
			ctx:  `{"$":{"auth":{"user":{"id":"u1"}},"cart":{"userId":"u1","items":[{"id":1}]}}}`,
			want: policy.ALLOW,
		},
		{
			name: "DENY: no auth user",
			ctx:  `{"$":{"auth":{},"cart":{"userId":"u1","items":[{"id":1}]}}}`,
			want: policy.DENY,
		},
		{
			name: "DENY: empty cart",
			ctx:  `{"$":{"auth":{"user":{"id":"u1"}},"cart":{"userId":"u1","items":[]}}}`,
			want: policy.DENY,
		},
		{
			name: "DENY: cart belongs to another user",
			ctx:  `{"$":{"auth":{"user":{"id":"u1"}},"cart":{"userId":"u2","items":[{"id":1}]}}}`,
			want: policy.DENY,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var data map[string]any
			if err := json.Unmarshal([]byte(tc.ctx), &data); err != nil {
				t.Fatalf("ctx JSON: %v", err)
			}
			dec, err := policy.Eval(policy.CanPlaceOrder(), policy.NewCtx(data))
			if err != nil {
				t.Fatalf("Eval: %v", err)
			}
			if dec != tc.want {
				t.Fatalf("got %s, want %s", dec, tc.want)
			}
		})
	}
}
