package projectwall

import "testing"

// Fixture mirror (S55) — the roadmap done-criteria as named scenarios:
//
//	property — un ContextPack du projet A contient zéro nœud du projet B  (context pkg)
//	fixture  — une identité forgée côté passerelle est encore refusée par la RLS
//	fault-injection — les deux couches (hook + RLS) passent au rouge indépendamment
//
// This file pins the HOOK layer (level 1). The RLS layer (level 2) is exercised by
// migration_rls_roundtrip_test.go against a real Postgres (Testcontainers). The
// fault-injection criterion is satisfied by the two layers reddening INDEPENDENTLY:
// each has its own mirror, each refuses on its own.

// ScenarioCase is a state→verdict fixture row (the §3 workflow form for a wall).
type scenarioCase struct {
	name        string
	scope       Scope
	target      Target
	wantVerdict Verdict
	wantCode    BlockCode // only checked on deny
}

func TestProjectWallScenarios(t *testing.T) {
	cases := []scenarioCase{
		{
			name:        "same project, inherited identity → allow",
			scope:       Scope{Identity: "alice", ActiveProject: "proj-a"},
			target:      Target{ProjectID: "proj-a"},
			wantVerdict: VerdictAllow,
		},
		{
			name:        "cross project (A scope reaches a B row) → AGENT_CROSS_PROJECT_WRITE",
			scope:       Scope{Identity: "alice", ActiveProject: "proj-a"},
			target:      Target{ProjectID: "proj-b"},
			wantVerdict: VerdictDeny,
			wantCode:    CodeAgentCrossProjectWrite,
		},
		{
			// THE PASSERELLE FORGED-CLAIM done-criterion: identity valid at the
			// gateway but asserting a different identity than the active scope.
			name:        "forged gateway identity, same project → refused (S61 layer)",
			scope:       Scope{Identity: "alice", ActiveProject: "proj-a"},
			target:      Target{ProjectID: "proj-a", ClaimedIdentity: "mallory"},
			wantVerdict: VerdictDeny,
			wantCode:    CodeAgentCrossProjectWrite,
		},
		{
			name:        "no active scope → fail-closed deny",
			scope:       Scope{},
			target:      Target{ProjectID: "proj-a"},
			wantVerdict: VerdictDeny,
			wantCode:    CodeAgentCrossProjectWrite,
		},
		{
			name:        "unscoped target (no project) → pass-through allow",
			scope:       Scope{Identity: "alice", ActiveProject: "proj-a"},
			target:      Target{ProjectID: ""},
			wantVerdict: VerdictAllow,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := Classify(c.scope, c.target)
			if d.Verdict != c.wantVerdict {
				t.Fatalf("verdict = %q, want %q", d.Verdict, c.wantVerdict)
			}
			if c.wantVerdict == VerdictDeny {
				if d.BlockReason == nil {
					t.Fatalf("deny without BlockReason")
				}
				if d.BlockReason.Code != c.wantCode {
					t.Fatalf("code = %q, want %q", d.BlockReason.Code, c.wantCode)
				}
				if len(d.BlockReason.HowToFix) == 0 {
					t.Fatalf("BlockReason must carry actionable how_to_fix")
				}
			}
		})
	}
}
