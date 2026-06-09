// Command derivedoc is the AIDOS Generators s9-derivation MCP server (FK06; ADR 0009: every
// backend op is an MCP tool).
//
// It is the capability door over FK06 (back/runtime/generators/derivedoc): the pure emitter
// DeriveDoc(kernel) → s9 — the doc DERIVED from the code (operations, controls, routes/bindings,
// test names, errors), the LOWER half of the doc-mirror, structured (concepts du lexique,
// behaviors, erreurs) for the structural comparison FK07 runs against s2 (the human-authored
// upper half).
//
// One pure, write-nothing tool:
//
//	derive_doc — a kernel (its operation / control / action ASTs, in a flat JSON shape) →
//	             the structured s9 (concepts, behaviors, errors) + its canonical bytes + content
//	             hash. Same kernel ⇒ byte-identical s9 (the FK06 done-criterion).
//
// THE WALL (CLAUDE.md §2): WRITES NOTHING to kernel/mirrors/fitness. It READS ASTs and DERIVES a
// projection — s9 is regenerable, never a truth.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the tool is a PURE function — no clock, no rng, no I/O,
// never an LLM. Same input → same output. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/generators/derivedoc"
)

// ── derive_doc ──

type stepIn struct {
	Kind   string `json:"kind" jsonschema:"the step verb (validate|authorize|read|mutate|branch|return)"`
	Entity string `json:"entity,omitempty" jsonschema:"the entity a read/mutate names (the lexicon source)"`
	Policy string `json:"policy,omitempty" jsonschema:"the policy an authorize delegates to"`
}

type opIn struct {
	Name  string   `json:"name" jsonschema:"the operation name (the lexicon term)"`
	Input string   `json:"input,omitempty" jsonschema:"the named input schema"`
	Steps []stepIn `json:"steps,omitempty" jsonschema:"the ordered step verbs (their entities/policies feed the lexicon + error surface)"`
	Emits []string `json:"emits,omitempty" jsonschema:"the declared emitted event names"`
}

type ctlIn struct {
	Name     string `json:"name" jsonschema:"the control name"`
	Triggers string `json:"triggers,omitempty" jsonschema:"the action ref the control fires (the control→action link)"`
}

type actIn struct {
	Name      string `json:"name" jsonschema:"the action name"`
	Invoke    string `json:"invoke,omitempty" jsonschema:"the operation ref the action binds to"`
	OnControl string `json:"on_control,omitempty" jsonschema:"the control the action fires on"`
}

type kernelIn struct {
	KernelID   string  `json:"kernel_id" jsonschema:"the cell id the doc is derived for (paired with s2)"`
	Operations []opIn  `json:"operations,omitempty"`
	Controls   []ctlIn `json:"controls,omitempty"`
	Actions    []actIn `json:"actions,omitempty"`
}

type behaviorOut struct {
	ID          string `json:"id"`
	Description string `json:"description"`
}

type deriveOutput struct {
	OK        bool          `json:"ok"`
	KernelID  string        `json:"kernel_id"`
	Concepts  []string      `json:"concepts"`
	Behaviors []behaviorOut `json:"behaviors"`
	Errors    []string      `json:"errors"`
	Bytes     string        `json:"bytes"`
	Hash      string        `json:"hash"`
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
		// branch / unknown: a node that names nothing — contributes no concept/error.
		return operation.BranchStep{}
	}
}

func deriveDoc(_ context.Context, _ *mcp.CallToolRequest, in kernelIn) (*mcp.CallToolResult, deriveOutput, error) {
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

	d := derivedoc.DeriveDoc(k)
	bs := make([]behaviorOut, 0, len(d.S9.Behaviors))
	for _, b := range d.S9.Behaviors {
		bs = append(bs, behaviorOut{ID: b.ID, Description: b.Description})
	}
	concepts := d.S9.Concepts
	if concepts == nil {
		concepts = []string{}
	}
	errs := d.S9.Errors
	if errs == nil {
		errs = []string{}
	}
	return nil, deriveOutput{
		OK:        true,
		KernelID:  d.S9.KernelID,
		Concepts:  concepts,
		Behaviors: bs,
		Errors:    errs,
		Bytes:     string(d.Bytes),
		Hash:      d.Hash,
	}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-derivedoc", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "derive_doc",
		Description: "FK06 (la dérivation déterministe de s9): given a kernel (its operation/control/action ASTs), return the DERIVED doc s9 — the structured lower half of the doc-mirror (concepts du lexique, behaviors, erreurs) + its canonical bytes + content hash. Same kernel ⇒ byte-identical s9 (the done-criterion). PURE; writes nothing (the wall, the doc is a projection).",
	}, deriveDoc)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("derivedoc: run: %w", err))
	}
}
