package webcomponent

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// SourceHash returns the content address of a control bound to its action:
// Hash(Canonicalize(control.body ⊕ action.body)). It REUSES S11's control.Canonicalize
// / action.Canonicalize (the canonical JSONB the kernel stores) and S02's
// records.Hash/Canonicalize — never a forked hashing path — so the artifact's
// source_hash is a stable function of both prior truths and staleness is the simple
// inequality against the control's (and action's) kernel head (the red-wave feed, S22).
//
// The ⊕ is the canonical envelope {"action": <canon(action)>, "control": <canon(control)>}
// re-canonicalized: object-key order never leaks (records.Canonicalize sorts keys), so
// the combined hash is order-independent. A malformed spec (a condition AST that does
// not canonicalize) is a BlockReason, never a panic.
func SourceHash(c control.Control, a action.Action) (string, *blockreason.BlockReason) {
	body, br := combinedBody(c, a)
	if br != nil {
		return "", br
	}
	return records.Hash(body), nil
}

// combinedBody is the canonical (control ⊕ action) JSONB the source hash is taken over.
func combinedBody(c control.Control, a action.Action) ([]byte, *blockreason.BlockReason) {
	cb, err := control.Canonicalize(c)
	if err != nil {
		br := blockMalformed(fmt.Errorf("control: %w", err))
		return nil, &br
	}
	ab, err := action.Canonicalize(a)
	if err != nil {
		br := blockMalformed(fmt.Errorf("action: %w", err))
		return nil, &br
	}
	// Embed the two already-canonical bodies as raw JSON under sorted keys, then
	// re-canonicalize the envelope (records.Canonicalize sorts keys recursively, so the
	// two sub-bodies — already canonical — are preserved and the top keys are ordered).
	envelope := []byte(fmt.Sprintf(`{"action":%s,"control":%s}`, ab, cb))
	canon, err := records.Canonicalize(envelope)
	if err != nil {
		br := blockMalformed(fmt.Errorf("combined body: %w", err))
		return nil, &br
	}
	return canon, nil
}

// outputHash is the digest of the rendered bytes — the byte-identical re-emit proof.
func outputHash(b []byte) string { return records.Hash(b) }
