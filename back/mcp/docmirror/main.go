// Command docmirror is the AIDOS Mirror doc-mirror MCP server (FK07; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over FK07 (back/kernel/mirror/docmirror): the pure STRUCTURAL
// comparator Compare(human s2, derived s9) and the DECLARED data-mirror DataMirror(s3, s7).
//
// Two pure, write-nothing tools:
//
//	doc_mirror  — a human-authored doc (s2: concepts, behaviour IDs+prose, errors) + a
//	              derived s9 (or a kernel to derive on the fly) → the structural Report
//	              (verdict green/red, blocking structural divergences, advisory prose
//	              drifts). The structural plane is the JUDGE; prose is ADVISORY — editing
//	              only the prose stays green (the FK07 done-criterion).
//	data_mirror — the DECLARED s3 ↔ s7 comparator: entity/field sets through the identical
//	              structural engine → a Report.
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS two docs and
// returns a projection — a red doc-mirror is a SIGNAL; acting on it goes idea → mirror →
// /goal. DETERMINISM-FIRST (§8): both tools are PURE functions — no clock, no rng, no LLM
// (the prose channel is advisory, surfaced, never arbitrated here). Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/mirror/docmirror"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/generators/derivedoc"
)

// ── shared input shapes ──

type behaviorIn struct {
	ID          string `json:"id" jsonschema:"the stable behaviour id (the structural key)"`
	Description string `json:"description,omitempty" jsonschema:"the prose rendering (advisory only)"`
}

type humanDocIn struct {
	KernelID  string       `json:"kernel_id" jsonschema:"the cell id the human doc pairs with (must match the derived s9)"`
	Concepts  []string     `json:"concepts,omitempty" jsonschema:"the human-documented lexicon set (kind-prefixed)"`
	Behaviors []behaviorIn `json:"behaviors,omitempty" jsonschema:"the human-documented behaviours (id + prose)"`
	Errors    []string     `json:"errors,omitempty" jsonschema:"the human-documented error surface"`
}

type stepIn struct {
	Kind   string `json:"kind" jsonschema:"the step verb (validate|authorize|read|mutate|branch|return)"`
	Entity string `json:"entity,omitempty"`
	Policy string `json:"policy,omitempty"`
}

type opIn struct {
	Name  string   `json:"name"`
	Input string   `json:"input,omitempty"`
	Steps []stepIn `json:"steps,omitempty"`
	Emits []string `json:"emits,omitempty"`
}

type ctlIn struct {
	Name     string `json:"name"`
	Triggers string `json:"triggers,omitempty"`
}

type actIn struct {
	Name      string `json:"name"`
	Invoke    string `json:"invoke,omitempty"`
	OnControl string `json:"on_control,omitempty"`
}

type kernelIn struct {
	KernelID   string  `json:"kernel_id"`
	Operations []opIn  `json:"operations,omitempty"`
	Controls   []ctlIn `json:"controls,omitempty"`
	Actions    []actIn `json:"actions,omitempty"`
}

// derivedIn lets the caller pass EITHER a pre-derived s9 (concepts/behaviors/errors) OR a
// kernel to derive on the fly. If Kernel is non-nil it wins (the authoritative emitter).
type derivedIn struct {
	KernelID  string       `json:"kernel_id,omitempty" jsonschema:"the cell id (when passing a pre-derived s9)"`
	Concepts  []string     `json:"concepts,omitempty"`
	Behaviors []behaviorIn `json:"behaviors,omitempty"`
	Errors    []string     `json:"errors,omitempty"`
	Kernel    *kernelIn    `json:"kernel,omitempty" jsonschema:"a kernel to derive s9 from (the authoritative path; wins over the inline s9 fields)"`
}

// ── outputs ──

type divergenceOut struct {
	Plane      string `json:"plane"`
	Section    string `json:"section"`
	Key        string `json:"key"`
	Side       string `json:"side,omitempty"`
	HumanProse string `json:"human_prose,omitempty"`
	CodeProse  string `json:"code_prose,omitempty"`
}

type reportOut struct {
	OK                    bool            `json:"ok"`
	KernelID              string          `json:"kernel_id"`
	Verdict               string          `json:"verdict"`
	Green                 bool            `json:"green"`
	PairingMismatch       bool            `json:"pairing_mismatch"`
	StructuralDivergences []divergenceOut `json:"structural_divergences"`
	ProseAdvisories       []divergenceOut `json:"prose_advisories"`
	Hash                  string          `json:"hash"`
}

func toStep(s stepIn) operation.Step {
	switch s.Kind {
	case "validate":
		return operation.ValidateStep{}
	case "authorize":
		return operation.AuthorizeStep{Policy: s.Policy}
	case "read":
		return operation.ReadStep{Entity: s.Entity}
	case "mutate":
		return operation.MutateStep{Entity: s.Entity, Op: operation.MutateCreate}
	case "return":
		return operation.ReturnStep{}
	default:
		return operation.BranchStep{}
	}
}

func toKernel(in kernelIn) derivedoc.Kernel {
	k := derivedoc.Kernel{KernelID: in.KernelID}
	for _, op := range in.Operations {
		o := operation.Operation{Name: op.Name, Input: op.Input, Emits: op.Emits}
		for _, s := range op.Steps {
			o.Steps = append(o.Steps, toStep(s))
		}
		k.Operations = append(k.Operations, o)
	}
	for _, c := range in.Controls {
		k.Controls = append(k.Controls, control.Control{Name: c.Name, Triggers: c.Triggers})
	}
	for _, a := range in.Actions {
		k.Actions = append(k.Actions, action.Action{
			Name:   a.Name,
			Invoke: a.Invoke,
			On:     action.On{Kind: action.EventClick, Control: a.OnControl},
		})
	}
	return k
}

func toS9(d derivedIn) derivedoc.S9 {
	if d.Kernel != nil {
		return derivedoc.DeriveDoc(toKernel(*d.Kernel)).S9
	}
	beh := make([]derivedoc.Behavior, 0, len(d.Behaviors))
	for _, b := range d.Behaviors {
		beh = append(beh, derivedoc.Behavior{ID: b.ID, Description: b.Description})
	}
	return derivedoc.S9{KernelID: d.KernelID, Concepts: d.Concepts, Behaviors: beh, Errors: d.Errors}
}

func toHuman(in humanDocIn) docmirror.HumanDoc {
	beh := make([]derivedoc.Behavior, 0, len(in.Behaviors))
	for _, b := range in.Behaviors {
		beh = append(beh, derivedoc.Behavior{ID: b.ID, Description: b.Description})
	}
	return docmirror.HumanDoc{KernelID: in.KernelID, Concepts: in.Concepts, Behaviors: beh, Errors: in.Errors}
}

func renderReport(rep docmirror.Report) reportOut {
	structural := make([]divergenceOut, 0, len(rep.StructuralDivergences))
	for _, d := range rep.StructuralDivergences {
		structural = append(structural, divergenceOut{
			Plane: string(d.Plane), Section: string(d.Section), Key: d.Key, Side: string(d.Side),
		})
	}
	advisories := make([]divergenceOut, 0, len(rep.ProseAdvisories))
	for _, d := range rep.ProseAdvisories {
		advisories = append(advisories, divergenceOut{
			Plane: string(d.Plane), Section: string(d.Section), Key: d.Key,
			HumanProse: d.HumanProse, CodeProse: d.CodeProse,
		})
	}
	return reportOut{
		OK:                    true,
		KernelID:              rep.KernelID,
		Verdict:               rep.Verdict,
		Green:                 rep.Green(),
		PairingMismatch:       rep.PairingMismatch,
		StructuralDivergences: structural,
		ProseAdvisories:       advisories,
		Hash:                  rep.Hash,
	}
}

// ── doc_mirror ──

type docMirrorIn struct {
	Human   humanDocIn `json:"human" jsonschema:"the human-authored doc s2"`
	Derived derivedIn  `json:"derived" jsonschema:"the code-derived doc s9 (or a kernel to derive)"`
}

func docMirror(_ context.Context, _ *mcp.CallToolRequest, in docMirrorIn) (*mcp.CallToolResult, reportOut, error) {
	rep := docmirror.Compare(toHuman(in.Human), toS9(in.Derived))
	return nil, renderReport(rep), nil
}

// ── data_mirror ──

type dataMirrorIn struct {
	KernelID string   `json:"kernel_id"`
	S3       []string `json:"s3" jsonschema:"the human-documented entity/field set (kind-prefixed)"`
	S7       []string `json:"s7" jsonschema:"the code-derived entity/field set (declared; supplied until the s7 emitter lands)"`
}

func dataMirror(_ context.Context, _ *mcp.CallToolRequest, in dataMirrorIn) (*mcp.CallToolResult, reportOut, error) {
	rep := docmirror.DataMirror(in.KernelID, in.S3, in.S7)
	return nil, renderReport(rep), nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-docmirror", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "doc_mirror",
		Description: "FK07 (la comparaison structurelle s2↔s9): given a human-authored doc s2 and a derived doc s9 (or a kernel to derive), return the STRUCTURAL report — verdict green/red, blocking structural divergences (concepts/behaviours/errors present on one side only), advisory prose drifts. The structural plane is the JUDGE; prose is ADVISORY (editing only the prose stays green). PURE; writes nothing (the wall).",
	}, docMirror)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "data_mirror",
		Description: "FK07 (le data-miroir s3↔s7 déclaré): given the human entity/field set s3 and the code-derived set s7, run the identical structural engine → a report. PURE; writes nothing.",
	}, dataMirror)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("docmirror: run: %w", err))
	}
}
