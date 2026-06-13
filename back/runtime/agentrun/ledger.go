// ledger.go — GV03. The tamper-evident (Merkle) AUDIT LEDGER over the append-only
// AgentRun events of back/runtime/agentrun. GV01 found the real gap (OWASP AAI09,
// "Untraceability & Repudiation", StatusPartial): BA28 content-addresses EACH run, so an
// ALTERED row re-derives to a different id — but there is no cross-row chain, so a whole
// run silently DELETED or two runs REORDERED leave no signal. GV02 (ADR 0037) adopts the
// AGT's tamper-evident Merkle ledger as an AUGMENTATION; the structural wall stays the
// garant. GV03 lands it: each ledger entry chains the prior root into its own hash, so the
// ROOT is a content-address of the WHOLE ordered ledger. Alter / delete / reorder / insert
// ANY row ⇒ the root changes ⇒ Verify goes red. This is the cross-row integrity BA28 lacked.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). A Merkle root IS a hash algorithm — a pure, total
// function of (the ordered run bodies), never an "LLM audit agent". Append / Root / Verify
// reuse records.Canonicalize + records.Hash (the S01/S02 scheme, REUSED not forked); no
// clock, no rng, no I/O. Same ordered runs ⇒ same root (the reproducibility mirror pins it);
// any tamper ⇒ a different root and a red Verify (the tamper-evidence mirror pins it). An
// agent "deciding if the ledger was tampered" would be a determinism gap — the chain decides.
//
// BELOW the line: the ledger is runtime audit telemetry, not a layer/truth. It carries no
// version and no mirror field of its own (a LedgerEntry is not a CoucheAgent), exactly like
// the AgentRun it records.
package agentrun

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// GenesisRoot is the empty-ledger root: the chain before any entry. A fresh ledger Verifies
// against it; the first Append chains FROM it. Declared (not magic) so the genesis is auditable.
const GenesisRoot = "genesis"

// DecisionBOM is the Bill-Of-Materials of one agent decision: the load-bearing inputs that,
// together, DETERMINED the run's outcome. It is what an auditor must be able to reproduce a
// decision from — the content-addresses of the agent layer, the goal it served, the red work
// item, the ContextPack it was given, the AgentImplementation + seed (BA26 replay trio), and
// the closed result. It is a PROJECTION of the AgentRun (DeriveBOM), never a parallel claim,
// so the BOM can never drift from the recorded run. Pure data; no clock, no I/O.
type DecisionBOM struct {
	Run         string `json:"run"`           // the run's content-address (AgentRun.ID)
	Agent       string `json:"agent"`         // the CoucheAgent @version that decided
	Goal        string `json:"goal"`          // the /goal the decision served
	RedWorkItem string `json:"red_work_item"` // the red set item worked
	ContextPack string `json:"context_pack"`  // the ContextPack the decision was given
	Impl        string `json:"impl"`          // the AgentImplementation hash (BA26)
	Seed        string `json:"seed"`          // the seed the run carried (BA26)
	Result      Result `json:"result"`        // the closed outcome (green|still_red|blocked|abandoned)
}

// DeriveBOM projects the Decision-BOM of a (recorded) run. PURE, TOTAL — same run ⇒ same BOM.
// It reads only fields already on the run (the content-address scheme guarantees they are the
// ones that determined the id), so the BOM is a faithful, drift-free summary of the decision.
func DeriveBOM(r AgentRun) DecisionBOM {
	return DecisionBOM{
		Run:         r.ID,
		Agent:       r.Agent,
		Goal:        r.Goal,
		RedWorkItem: r.RedWorkItem,
		ContextPack: r.ContextPack,
		Impl:        r.Impl,
		Seed:        r.Seed,
		Result:      r.Result,
	}
}

// LedgerEntry is one Merkle-chained audit row: the Decision-BOM of a run, the prior chain
// root it chains FROM, and the new root it produces. EntryHash content-addresses the BOM
// alone (a per-row integrity address, like BA28); Root content-addresses (prior_root ‖ entry_hash)
// — so Root folds the ENTIRE ordered prefix into one hash. Index is the 0-based position, pinned
// into the address so a REORDERING (which keeps the same BOMs) still changes every downstream root.
type LedgerEntry struct {
	Index     int         `json:"index"`      // 0-based position in the append-only ledger
	BOM       DecisionBOM `json:"bom"`        // the Decision-BOM recorded at this position
	PriorRoot string      `json:"prior_root"` // the chain root this entry chains FROM
	EntryHash string      `json:"entry_hash"` // content-address of (index ‖ bom)
	Root      string      `json:"root"`       // content-address of (prior_root ‖ entry_hash) — the new chain root
}

// ContentHash content-addresses ANY canonical body via the S01/S02 scheme
// (records.Canonicalize + records.Hash, REUSED not forked) — the one pure-total hash the GV03
// chain is built on. It is EXPORTED so a SECOND audit plane (the DP22 connector-action ledger,
// back/runtime/connectorenforce/connectoraudit) chains its own load-bearing body through the
// SAME Merkle math instead of FORKING it (anti-duplication, CLAUDE.md §3/§6). No clock, no rng,
// no I/O; same body ⇒ same hash. The body is whatever per-row integrity payload the plane folds
// (here {index ‖ bom}); ContentHash never inspects it, it only canonicalises + hashes.
func ContentHash(v any) (string, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// entryHash content-addresses (index ‖ bom): the per-row integrity address. Pure, total. It is
// the AgentRun plane's use of the shared ContentHash primitive — byte-identical to the pre-GV03
// shape (the AgentRun ledger roots are unchanged by the extraction).
func entryHash(index int, bom DecisionBOM) (string, error) {
	return ContentHash(map[string]any{"index": index, "bom": bom})
}

// ChainRoot content-addresses (prior_root ‖ entry_hash): the Merkle FOLD of the prefix — the one
// operation that makes a DELETION or REORDERING detectable (the root is a function of the WHOLE
// ordered history, not just the latest row). EXPORTED so the DP22 connector-action ledger folds
// its prefix through the SAME math (no parallel hash). Pure, total — no clock, no rng, no I/O.
func ChainRoot(priorRoot, entryHash string) (string, error) {
	return ContentHash(map[string]any{"prior_root": priorRoot, "entry_hash": entryHash})
}

// chainRoot is the unexported alias the AgentRun plane calls — preserved so the existing GV03
// call-sites read unchanged. It delegates to the exported ChainRoot (one implementation).
func chainRoot(priorRoot, entryHash string) (string, error) {
	return ChainRoot(priorRoot, entryHash)
}

// Append adds a run's Decision-BOM to the ledger as a new chained entry, returning the grown
// ledger. APPEND-ONLY: it never mutates a prior entry; it appends one row chaining from the
// current tip root (GenesisRoot for an empty ledger). PURE, TOTAL, DETERMINISTIC — no clock,
// no rng, no I/O; same (ledger, run) ⇒ same grown ledger (the reproducibility mirror pins it).
func Append(ledger []LedgerEntry, r AgentRun) ([]LedgerEntry, error) {
	prior := GenesisRoot
	if n := len(ledger); n > 0 {
		prior = ledger[n-1].Root
	}
	index := len(ledger)
	bom := DeriveBOM(r)
	eh, err := entryHash(index, bom)
	if err != nil {
		return nil, err
	}
	root, err := chainRoot(prior, eh)
	if err != nil {
		return nil, err
	}
	entry := LedgerEntry{
		Index:     index,
		BOM:       bom,
		PriorRoot: prior,
		EntryHash: eh,
		Root:      root,
	}
	// Copy-on-grow: never alias/mutate the caller's slice (append-only, anti-overwrite §9).
	out := make([]LedgerEntry, len(ledger), len(ledger)+1)
	copy(out, ledger)
	return append(out, entry), nil
}

// Root returns the current tip root of the ledger — the content-address of the WHOLE ordered
// ledger. GenesisRoot for an empty ledger. PURE, TOTAL.
func Root(ledger []LedgerEntry) string {
	if n := len(ledger); n > 0 {
		return ledger[n-1].Root
	}
	return GenesisRoot
}

// TamperKind names how a ledger failed verification — the actionable signal an auditor reads.
type TamperKind string

const (
	// TamperNone — the ledger verifies: every row's index, entry-hash and root recompute exactly.
	TamperNone TamperKind = ""
	// TamperIndex — a row's Index is not its position (a reordering/insertion artifact).
	TamperIndex TamperKind = "index_mismatch"
	// TamperEntryHash — a row's BOM was ALTERED (its recomputed entry-hash differs).
	TamperEntryHash TamperKind = "entry_hash_mismatch"
	// TamperPriorRoot — a row does not chain from the prior row's root (a deletion/reordering).
	TamperPriorRoot TamperKind = "prior_root_break"
	// TamperRoot — a row's stored Root is not the recomputed chain root (a forged root).
	TamperRoot TamperKind = "root_mismatch"
)

// VerifyResult is the deterministic verdict of Verify: OK or the first tamper found, with its
// position and recomputed-vs-stored root. It is the BlockReason-shaped evidence the audit UI
// renders. Below the line: a verdict, not a layer.
type VerifyResult struct {
	OK           bool       `json:"ok"`
	Tamper       TamperKind `json:"tamper,omitempty"`        // empty when OK
	AtIndex      int        `json:"at_index,omitempty"`      // position of the first tamper (-1 when OK)
	ExpectedRoot string     `json:"expected_root,omitempty"` // the recomputed tip root
	StoredRoot   string     `json:"stored_root,omitempty"`   // the ledger's stored tip root
}

// Verify recomputes the Merkle chain over the ledger and reports whether it is INTACT. It is
// the deterministic JUDGE of tamper-evidence (CLAUDE.md §8): for each row it re-derives the
// entry-hash from the BOM and the chain root from the prior root, and checks the stored index,
// prior_root and root match. ANY alteration, deletion, reordering or insertion changes a
// recomputed hash and Verify goes red (OK=false) at the first broken row. PURE, TOTAL — no
// clock, no I/O; same ledger ⇒ same verdict (the mirror pins it). An intact ledger ⇒ OK=true.
func Verify(ledger []LedgerEntry) VerifyResult {
	prior := GenesisRoot
	for i, e := range ledger {
		if e.Index != i {
			return VerifyResult{OK: false, Tamper: TamperIndex, AtIndex: i, ExpectedRoot: Root(ledger), StoredRoot: Root(ledger)}
		}
		eh, err := entryHash(i, e.BOM)
		if err != nil || eh != e.EntryHash {
			return VerifyResult{OK: false, Tamper: TamperEntryHash, AtIndex: i, ExpectedRoot: Root(ledger), StoredRoot: Root(ledger)}
		}
		if e.PriorRoot != prior {
			return VerifyResult{OK: false, Tamper: TamperPriorRoot, AtIndex: i, ExpectedRoot: Root(ledger), StoredRoot: Root(ledger)}
		}
		root, err := chainRoot(prior, eh)
		if err != nil || root != e.Root {
			return VerifyResult{OK: false, Tamper: TamperRoot, AtIndex: i, ExpectedRoot: root, StoredRoot: e.Root}
		}
		prior = e.Root
	}
	return VerifyResult{OK: true, Tamper: TamperNone, AtIndex: -1, ExpectedRoot: prior, StoredRoot: prior}
}

// BuildLedger folds a sequence of runs into a verified Merkle ledger — the convenience the
// audit panel and the MCP tool call to materialize a ledger from recorded runs. PURE, TOTAL.
func BuildLedger(runs []AgentRun) ([]LedgerEntry, error) {
	var ledger []LedgerEntry
	for _, r := range runs {
		grown, err := Append(ledger, r)
		if err != nil {
			return nil, fmt.Errorf("agentrun: build ledger at index %d: %w", len(ledger), err)
		}
		ledger = grown
	}
	return ledger, nil
}
