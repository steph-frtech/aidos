package templates

// propose.go — the WALL door for S81 (CLAUDE.md §2). Instantiating a template into a StarterProject is
// a DRY-RUN value; freezing its truths (entities/relations/operations/behaviors) into the kernel goes
// ONLY via the wall: idée → miroir → /goal → approbation humaine. Propose runs the ONE Instantiate and
// wraps its dry-run into a DRAFT changeset.ChangeSet — never APPLIED. It WRITES NOTHING (changeset.Open
// is PURE). A reject leaves the kernel intact because Propose never touched it.
//
// The starter-project ROW itself (a duplicate-from-template, S56) is written BELOW the line via the
// project/DAG store path (a new DAG root, namespaced content-store) — that is the MCP's job, not this
// pure package. Propose handles only the ABOVE-the-line truths of the starter.

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/archive/changeset"
)

// Proposal is the result of proposing a template instantiation: the DRY-RUN StarterProject (echoed for
// the Workbench preview) plus a DRAFT ChangeSet carrying it — never APPLIED. The changeset's spec_delta
// carries the canonical starter body, project-scoped ("template@<target>"); its mirror_delta declares
// the proof obligation (completeness). Approval (apply) is the `aidos` CLI's job, gated by the
// AuthorityGraph.
type Proposal struct {
	Starter   StarterProject      `json:"starter"`
	ChangeSet changeset.ChangeSet `json:"changeset"`
}

// Propose runs the ONE Instantiate for a template+target and wraps its dry-run into a DRAFT
// changeset.ChangeSet — the single legal way a template's truths reach the kernel. It WRITES NOTHING.
// The returned changeset is `proposed` (DRAFT); a human approves (applies) or rejects it downstream.
// The spec_delta target is "template@<target>" so a reject/approve is project-scoped.
func Propose(id TemplateID, targetSlug, parentPhase string) (Proposal, error) {
	sp, err := Instantiate(id, targetSlug)
	if err != nil {
		return Proposal{}, err
	}
	body, err := json.Marshal(sp)
	if err != nil {
		return Proposal{}, fmt.Errorf("templates: marshal starter: %w", err)
	}
	specTarget := fmt.Sprintf("template@%s", targetSlug)
	label := fmt.Sprintf("templates: propose %s starter on %s (%s)", id, targetSlug, short(sp.StarterID))
	spec := &changeset.Delta{Kind: "add", Target: specTarget, Body: json.RawMessage(body)}
	mirror := &changeset.Delta{Kind: "add", Target: specTarget + "#mirror"}
	cs, err := changeset.Open(label, parentPhase, spec, mirror)
	if err != nil {
		return Proposal{}, err
	}
	return Proposal{Starter: sp, ChangeSet: cs}, nil
}

// short returns the first 8 chars of a content hash (for human labels). Never used for identity.
func short(h string) string {
	if len(h) <= 8 {
		return h
	}
	return h[:8]
}
