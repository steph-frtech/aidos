// Command goal-piloting is the AIDOS Runtime goal-piloting MCP server (S66; ADR 0009:
// every backend op is an MCP tool).
//
// It is the capability door over the S66 UI-piloted /goal (back/runtime/goalpiloting): a
// human PORTEUR D'AUTORITÉ (S63) opens a goal from a grilled idea — the engine proposes a
// DRAFT ChangeSet (spec_delta + mirror_delta atomically) and computes the LIVE red set;
// and the close gate is the NON-GAMEABLE stop (red set→green ∧ prior intact ∧ mutation ≥
// floor ∧ no monster). The actor gate refuses a placeholder/agent — a goal is never opened
// by nobody (the wall).
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it returns the DRAFT ChangeSet
// PROPOSAL + the red set + the close verdict as VALUES and writes NOTHING. Persistence of
// the proposed ChangeSet rides the changeset door (S20) under human approval; stamping a
// goal CLOSED stays the aidos CLI role. This server never touches a DB, never touches the
// kernel/mirrors/fitness. There is deliberately no apply/close tool: applying is S20's
// commit-gate, closing is the aidos role — promotion to truth is the /goal flow under approval.
//
// Tools (one tool = one backend op):
//
//	goal_pilot_open   — actor + open input → a DRAFT ChangeSet proposal + the LIVE red set (or a refusal)
//	goal_pilot_close  — the NON-GAMEABLE close gate: is the goal closeable? (refusal verbatim when not)
//	goal_live_red_set — the LIVE red-set worklist for an open goal, in stable sorted order
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — no
// clock, no rng, no I/O. "Done" is computed, never declared; no agent-confidence is ever an
// input. Same input → same output (goalpiloting_property_test.go pins it). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/goal"
	"github.com/steph-frtech/aidos/back/runtime/goalpiloting"
)

// ── Tool I/O types ──

type deltaInput struct {
	Kind   string `json:"kind" jsonschema:"the change kind: add|refine|override|rescope|reweight|deprecate"`
	Target string `json:"target" jsonschema:"the kernel/mirror source the delta targets (e.g. Order.discount)"`
}

type edgeInput struct {
	Kind        string `json:"kind" jsonschema:"the link kind (e.g. reflects)"`
	FromID      string `json:"from_id" jsonschema:"the link source id (the mirror)"`
	FromVersion string `json:"from_version" jsonschema:"the pinned source version"`
	ToID        string `json:"to_id" jsonschema:"the link target id (the truth)"`
	ToVersion   string `json:"to_version" jsonschema:"the pinned target version"`
	LoadBearing bool   `json:"load_bearing" jsonschema:"whether the edge carries the red wave"`
}

type openInput struct {
	ActorIdentity string `json:"actor_identity" jsonschema:"the acting human's resolved identity (accounts.users.id); never a placeholder"`
	ActorDisplay  string `json:"actor_display" jsonschema:"the acting human's display name surfaced in provenance/UI"`

	IdeaID      string      `json:"idea_id" jsonschema:"the source idea's content-addressed id"`
	SpecDelta   deltaInput  `json:"spec_delta" jsonschema:"the kernel-plane change the idea proposes"`
	MirrorDelta *deltaInput `json:"mirror_delta,omitempty" jsonschema:"the mirror-plane change that proves it; absent ⇒ a vœu (refused)"`
	ParentPhase string      `json:"parent_phase" jsonschema:"the stable phase the ChangeSet moves from"`

	Bumped []string          `json:"bumped,omitempty" jsonschema:"the bumped kernel sources (S22 Impact input)"`
	Edges  []edgeInput       `json:"edges,omitempty" jsonschema:"the versioned link graph (S22 Impact input)"`
	Heads  map[string]string `json:"heads,omitempty" jsonschema:"the current heads (S22 Impact input)"`

	TimeSeconds int `json:"time_seconds,omitempty" jsonschema:"declared time budget (secondary guard, not a close condition)"`
	Turns       int `json:"turns,omitempty" jsonschema:"declared turn budget"`
	Tokens      int `json:"tokens,omitempty" jsonschema:"declared token budget"`
}

type blockOutput struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Explanation string   `json:"explanation"`
	HowToFix    []string `json:"how_to_fix"`
}

type openOutput struct {
	// OK is true iff the goal opened (no refusal).
	OK bool `json:"ok"`
	// Block is the actionable refusal — non-nil only when OK is false.
	Block *blockOutput `json:"block,omitempty"`

	GoalID        string   `json:"goal_id,omitempty"`
	IdeaRef       string   `json:"idea_ref,omitempty"`
	ChangeSetRef  string   `json:"changeset_ref,omitempty"`
	ChangeSetMode string   `json:"changeset_status,omitempty"` // always DRAFT on success (a proposal, never applied)
	Status        string   `json:"status,omitempty"`           // OPEN
	RedSet        []string `json:"red_set,omitempty"`          // the LIVE red-set worklist
	ActorIdentity string   `json:"actor_identity,omitempty"`
	ActorDisplay  string   `json:"actor_display,omitempty"`
}

type sensorInput struct {
	Mirror string `json:"mirror" jsonschema:"a red-set mirror ref"`
	State  string `json:"state" jsonschema:"its live verdict: green|red (a missing/red entry is not closeable)"`
}

type closeInput struct {
	RedSet        []string      `json:"red_set" jsonschema:"the goal's red set (the mirrors that must turn green)"`
	Sensors       []sensorInput `json:"sensors,omitempty" jsonschema:"the live verdict per red-set mirror"`
	PriorGreen    string        `json:"prior_green" jsonschema:"whether the prior green corpus is intact: intact|broken"`
	Mutation      float64       `json:"mutation" jsonschema:"the current mutation score (0..1)"`
	MutationFloor float64       `json:"mutation_floor" jsonschema:"the DECLARED mutation threshold (never learned)"`
	Monsters      []string      `json:"monsters,omitempty" jsonschema:"the current monster findings; any ⇒ not closeable"`
}

type closeOutput struct {
	// Closeable is true iff red set→green ∧ prior intact ∧ mutation ≥ floor ∧ no monster.
	Closeable bool `json:"closeable"`
	// Block is the actionable GOAL_STILL_RED refusal — non-nil only when not closeable.
	Block *blockOutput `json:"block,omitempty"`
}

type redSetInput struct {
	RedSet []string `json:"red_set" jsonschema:"the goal's red set"`
}
type redSetOutput struct {
	RedSet []string `json:"red_set"`
}

func toBlockOutput(b *goalpiloting.PilotBlock) *blockOutput {
	if b == nil {
		return nil
	}
	return &blockOutput{Code: b.Code, Severity: b.Severity, Explanation: b.Explanation, HowToFix: b.HowToFix}
}

func toDelta(d deltaInput) changeset.Delta {
	return changeset.Delta{Kind: d.Kind, Target: d.Target}
}

func toEdges(in []edgeInput) []goal.Edge {
	out := make([]goal.Edge, 0, len(in))
	for _, e := range in {
		out = append(out, goal.Edge{
			Link: links.Link{
				Kind: links.Kind(e.Kind),
				From: links.Ref{ID: e.FromID, Version: e.FromVersion},
				To:   links.Ref{ID: e.ToID, Version: e.ToVersion},
			},
			LoadBearing: e.LoadBearing,
		})
	}
	return out
}

// open is the goal_pilot_open tool: the actor gate (S63) + the open (S29). It returns the
// DRAFT ChangeSet PROPOSAL + the LIVE red set as VALUES, or an actionable refusal. Writes
// NOTHING; persistence rides the changeset door under approval (the wall). PURE.
func open(_ context.Context, _ *mcp.CallToolRequest, in openInput) (*mcp.CallToolResult, openOutput, error) {
	actor := goalpiloting.Actor{Identity: in.ActorIdentity, Display: in.ActorDisplay}
	idea := goal.Idea{ID: in.IdeaID, SpecDelta: toDelta(in.SpecDelta)}
	if in.MirrorDelta != nil {
		md := toDelta(*in.MirrorDelta)
		idea.MirrorDelta = &md
	}
	res, br := goalpiloting.PilotOpenGoal(actor, goalpiloting.OpenInput{
		Idea:        idea,
		ParentPhase: in.ParentPhase,
		Bumped:      in.Bumped,
		Edges:       toEdges(in.Edges),
		Heads:       in.Heads,
		Budgets:     goal.Budgets{TimeSeconds: in.TimeSeconds, Turns: in.Turns, Tokens: in.Tokens},
	})
	if br != nil {
		return nil, openOutput{OK: false, Block: toBlockOutput(br)}, nil
	}
	return nil, openOutput{
		OK:            true,
		GoalID:        res.Goal.ID,
		IdeaRef:       res.Goal.IdeaRef,
		ChangeSetRef:  res.Goal.ChangeSetRef,
		ChangeSetMode: string(res.Goal.ChangeSet.Status),
		Status:        string(res.Goal.Status),
		RedSet:        goalpiloting.LiveRedSet(res.Goal),
		ActorIdentity: res.Actor.Identity,
		ActorDisplay:  res.Actor.Display,
	}, nil
}

// close is the goal_pilot_close tool: the NON-GAMEABLE close gate. It returns whether the
// goal is closeable (and the GOAL_STILL_RED refusal when not). It never stamps CLOSED (that
// stays the aidos role) and takes NO agent-confidence input — "done" is computed. PURE.
func close(_ context.Context, _ *mcp.CallToolRequest, in closeInput) (*mcp.CallToolResult, closeOutput, error) {
	sensors := make(map[string]goal.SensorState, len(in.Sensors))
	for _, s := range in.Sensors {
		sensors[s.Mirror] = goal.SensorState(s.State)
	}
	g := goalpiloting.Goal{Status: goal.StatusOpen, RedSet: in.RedSet}
	stop := goalpiloting.StopInput{
		Sensors:       sensors,
		PriorGreen:    goal.PriorGreenState(in.PriorGreen),
		Mutation:      in.Mutation,
		MutationFloor: in.MutationFloor,
		Monsters:      in.Monsters,
	}
	br := goalpiloting.PilotCloseGoal(g, stop)
	return nil, closeOutput{Closeable: br == nil, Block: toBlockOutput(br)}, nil
}

// redSet is the goal_live_red_set tool: the LIVE red-set worklist in stable sorted order —
// the panel's worklist. PURE.
func redSet(_ context.Context, _ *mcp.CallToolRequest, in redSetInput) (*mcp.CallToolResult, redSetOutput, error) {
	g := goalpiloting.Goal{Status: goal.StatusOpen, RedSet: in.RedSet}
	return nil, redSetOutput{RedSet: goalpiloting.LiveRedSet(g)}, nil
}

// newMCPServer builds the MCP server and registers the three goal-piloting tools. There is
// deliberately NO apply/close-stamp tool: applying is S20's commit-gate, closing is the
// aidos role — this server is pure computation (the wall).
func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-goal-piloting", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "goal_pilot_open", Description: "S66: a porteur d'autorité (S63) opens a /goal from a grilled idea → a DRAFT ChangeSet proposal (spec+mirror) + the LIVE red set. A placeholder actor is refused; a mirror-less idea is refused. Writes nothing (the wall)."}, open)
	mcp.AddTool(srv, &mcp.Tool{Name: "goal_pilot_close", Description: "S66: the NON-GAMEABLE close gate — is the goal closeable? red set→green ∧ prior green intact ∧ mutation ≥ floor ∧ no monster. Returns the GOAL_STILL_RED refusal when not. Never stamps CLOSED; no agent-confidence input."}, close)
	mcp.AddTool(srv, &mcp.Tool{Name: "goal_live_red_set", Description: "S66: the LIVE red-set worklist for an open goal, in stable sorted order (each entry a failing mirror red → green)."}, redSet)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("goal-piloting: run: %w", err))
	}
}
