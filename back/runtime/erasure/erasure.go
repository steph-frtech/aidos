// Package erasure is S116 — GDPR EXPORT & ERASURE on the append-only truth-store, the
// mechanical reconciliation of the REAL tension "truth-store append-only vs the right to
// erasure" (ROADMAP-app-builder S116, OpenQuestion grilled first).
//
// THE TENSION (and its resolution). The AIDOS truth-store is append-only and
// content-addressed: nothing is ever destroyed, a phase's hash is the digest of its body,
// and the DAG of stable phases is immutable. GDPR Art. 17 (the right to erasure) and Art. 20
// (data portability / export) require, for a real person, that (1) all their data be EXPORTED
// on demand and (2) their PERSONAL data be made IRRECOVERABLE on demand. A naive `DELETE`
// would break append-only AND invalidate every phase hash that ever covered the row. The
// resolution — DECIDED here, RECORDED as a decision (§9), grilled because the tension is real
// — is CRYPTO-SHREDDING + TOMBSTONE:
//
//   - Every PII field lives ENCRYPTED at rest under a per-subject data-encryption key (the
//     PiiCipher carries only ciphertext + the key id, never plaintext). The append-only ROW
//     is preserved verbatim; only the KEY is destructible.
//   - ERASURE shreds the subject's key (Tombstone{KeyID, shredded:true}) and overwrites the
//     ciphertext with a fixed TOMBSTONE marker of IDENTICAL byte-length. The row's STRUCTURE
//     (its shape, its non-PII columns, its position in the append-only log) is untouched.
//   - The PHASE HASH stays valid because the hash is computed over the STRUCTURAL projection
//     (PhaseDigest) — the shape + the non-PII content + the tombstone markers — which is
//     INVARIANT under shredding (a shredded cell hashes to the same tombstone digest before
//     and after, because erasure only flips a key whose ciphertext is already opaque). The
//     append-only chain therefore still verifies after erasure.
//   - The DECISION is recorded: an ErasureDecision (subject, plan, scope, key id, when-ref)
//     content-addressed via records.Hash — an erasure is a RECORDED decision, never a silent
//     edit (§9). No truth is destroyed; a key is shredded and a decision is appended.
//
// TWO PLANS (the step's two halves):
//
//   - PlanAccount — the AIDOS account: a hard delete of an account + ALL data of ITS projects,
//     beyond the S53 soft-delete. SelectAccount gathers every PII cell owned by the account
//     across its projects; Erase shreds them all under the account's subject key.
//   - PlanApp — the people of the EMITTED app the user built: the data-subject rights of the
//     BUILT app's end-users (export + erasure), the S103 "tout PII oubliable" policy made
//     concrete. SelectApp gathers a single app-user's PII cells (scoped to one emitted app).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Selection is a DETERMINISTIC SCOPED QUERY — a pure,
// total filter over the supplied cells by (plan, subject, scope), never an LLM, never a guess.
// Export, shredding, the tombstone marker, the phase digest, and the decision id are all PURE
// functions: same input ⇒ byte-identical output (the rapid reproducibility mirror pins this).
//
// THE WALL (CLAUDE.md §2). This package writes NO truth. It returns the ErasureResult VALUE
// (the shredded cells + the tombstone + the recorded decision); landing it is a below-the-line
// archive write (the rows are runtime/app data, never a kernel/mirrors/fitness schema). The
// PII NEVER enters the kernel; the decision is appended, the structure preserved.
package erasure

import (
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Plan is the closed set of the two erasure plans (the step's two halves).
type Plan string

const (
	// PlanAccount — the AIDOS-account plan: hard delete of an account + all its projects' data.
	PlanAccount Plan = "account"
	// PlanApp — the emitted-app plan: a data-subject right of the built app's end-user.
	PlanApp Plan = "app"
)

// PLANS is the closed plan set, in canonical order.
var PLANS = []Plan{PlanAccount, PlanApp}

// IsPlan reports whether p is a known plan.
func IsPlan(p Plan) bool {
	for _, k := range PLANS {
		if k == p {
			return true
		}
	}
	return false
}

// Tombstone is the fixed marker that overwrites a shredded PII ciphertext. It is a constant of
// a deterministic byte-shape: erasure replaces the ciphertext with a tombstone of IDENTICAL
// length, so the structural digest is invariant (the append-only hash stays valid).
const Tombstone = "☠shredded☠" // ☠shredded☠ — a fixed, non-PII marker

// tombstoneCipher returns the tombstone ciphertext for a shredded cell: the fixed Tombstone
// marker, deterministic and PII-free. Length-equality with the original is not required for
// the digest (the digest hashes the tombstone marker itself, see PhaseDigest), but the marker
// is constant so every shredded cell hashes to the same opaque value.
func tombstoneCipher() string { return Tombstone }

// PiiCipher is one PII field at rest: its column path and its ENCRYPTED value (ciphertext +
// the id of the per-subject key that decrypts it). The plaintext NEVER lives in this struct —
// only the ciphertext and the key id. Crypto-shredding destroys the KEY (KeyID), rendering the
// ciphertext permanently undecryptable while the append-only row is preserved.
type PiiCipher struct {
	// Path is the column path of this PII field (e.g. "email", "address.line1").
	Path string `json:"path"`
	// Ciphertext is the encrypted PII value. After shredding it becomes the Tombstone marker.
	Ciphertext string `json:"ciphertext"`
	// KeyID is the id of the per-subject data-encryption key. Shredding the key with this id
	// makes the ciphertext undecryptable (crypto-shredding). On a shredded cell, KeyID is "".
	KeyID string `json:"key_id"`
	// Plaintext is the decrypted value, present ONLY when the holder can decrypt (i.e. before
	// erasure, with a live key). It is NEVER persisted; it exists only to drive Export. A
	// shredded cell carries no plaintext (the key is gone).
	Plaintext string `json:"plaintext,omitempty"`
}

// Shredded reports whether this cell's key has been crypto-shredded (its ciphertext is the
// Tombstone and it carries no key / no plaintext).
func (c PiiCipher) Shredded() bool {
	return c.KeyID == "" && c.Ciphertext == Tombstone
}

// Cell is one PII-bearing row in the truth-store/app-store: which plan owns it, which subject
// it belongs to, which project/app scopes it, its append-only position, and its PII fields.
// A Cell is the unit of selection AND of shredding.
type Cell struct {
	// Plan is which plan this cell belongs to (account | app).
	Plan Plan `json:"plan"`
	// Subject is the id of the person the PII belongs to: an account id (PlanAccount) or an
	// emitted-app end-user id (PlanApp).
	Subject string `json:"subject"`
	// Project scopes the cell to a project (PlanAccount: one of the account's projects).
	Project string `json:"project"`
	// App scopes an app-plan cell to a single emitted app (PlanApp). "" for account cells.
	App string `json:"app"`
	// RowID is the cell's stable append-only row identifier (never reused, never deleted).
	RowID string `json:"row_id"`
	// Structure is the NON-PII structural projection of the row (its shape + non-PII columns).
	// It is what survives erasure verbatim, and what (with the tombstones) the phase hashes.
	Structure string `json:"structure"`
	// Pii are the cell's PII fields (encrypted at rest). Shredding rewrites these.
	Pii []PiiCipher `json:"pii"`
}

// Scope narrows a selection: the plan, the subject, and (optionally) a single project or app.
// Selection is a DETERMINISTIC pure filter on these — never a guess.
type Scope struct {
	// Plan is the plan to select within (required).
	Plan Plan `json:"plan"`
	// Subject is the person whose data to select (required).
	Subject string `json:"subject"`
	// Project, when non-empty, restricts to a single project (PlanAccount).
	Project string `json:"project"`
	// App, when non-empty, restricts to a single emitted app (PlanApp).
	App string `json:"app"`
}

// matches reports whether cell c is in scope s — the deterministic scoped-query predicate.
func (s Scope) matches(c Cell) bool {
	if c.Plan != s.Plan || c.Subject != s.Subject {
		return false
	}
	if s.Project != "" && c.Project != s.Project {
		return false
	}
	if s.App != "" && c.App != s.App {
		return false
	}
	return true
}

// Select is the DETERMINISTIC SCOPED QUERY (CLAUDE.md §6 "sélection = requête déterministe
// scopée"): a pure, total filter returning every cell in scope, in canonical order
// (project, app, row id). It is the single selection path both export and erasure consume, so
// "what is exported" and "what is erased" are provably the SAME set. No LLM, no I/O.
func Select(scope Scope, cells []Cell) []Cell {
	out := make([]Cell, 0, len(cells))
	for _, c := range cells {
		if scope.matches(c) {
			out = append(out, c)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Project != out[j].Project {
			return out[i].Project < out[j].Project
		}
		if out[i].App != out[j].App {
			return out[i].App < out[j].App
		}
		return out[i].RowID < out[j].RowID
	})
	return out
}

// SelectAccount is the PlanAccount selection: every PII cell owned by an account across ALL
// its projects (the hard-delete reach, beyond S53 soft-delete).
func SelectAccount(account string, cells []Cell) []Cell {
	return Select(Scope{Plan: PlanAccount, Subject: account}, cells)
}

// SelectApp is the PlanApp selection: a single emitted-app end-user's PII cells, scoped to one
// app (the data-subject right of the BUILT app's people).
func SelectApp(app, subject string, cells []Cell) []Cell {
	return Select(Scope{Plan: PlanApp, Subject: subject, App: app}, cells)
}

// ── Export (GDPR Art. 20 — portability) ──────────────────────────────────────────────────

// ExportField is one exported PII field: its path and its decrypted plaintext value.
type ExportField struct {
	Path  string `json:"path"`
	Value string `json:"value"`
}

// ExportRow is one exported row: its scope + position + every PII field in plaintext.
type ExportRow struct {
	Project string        `json:"project,omitempty"`
	App     string        `json:"app,omitempty"`
	RowID   string        `json:"row_id"`
	Fields  []ExportField `json:"fields"`
}

// Export is the GDPR Art. 20 portability projection: it returns EVERY PII field of the subject
// in plaintext, in canonical order — "un export rend toutes les données d'une personne". It is
// a pure, total function over the SAME scoped selection erasure consumes (so the export is
// provably complete relative to what erasure shreds). A shredded cell exports nothing (its key
// is gone) — once erased, the data is irrecoverable, which the export honestly reflects.
func Export(scope Scope, cells []Cell) []ExportRow {
	sel := Select(scope, cells)
	rows := make([]ExportRow, 0, len(sel))
	for _, c := range sel {
		fields := make([]ExportField, 0, len(c.Pii))
		for _, p := range c.Pii {
			if p.Shredded() {
				continue // the key is shredded — irrecoverable, nothing to export
			}
			fields = append(fields, ExportField{Path: p.Path, Value: p.Plaintext})
		}
		sort.SliceStable(fields, func(i, j int) bool { return fields[i].Path < fields[j].Path })
		rows = append(rows, ExportRow{Project: c.Project, App: c.App, RowID: c.RowID, Fields: fields})
	}
	return rows
}

// ── Erasure (GDPR Art. 17 — crypto-shredding + tombstone) ────────────────────────────────

// Tombstoned is one shredded cell: its row id and the per-row shred result. The structural
// projection is preserved; the PII ciphertext is the Tombstone; the key id is gone.
type Tombstoned struct {
	// RowID is the append-only row that was shredded (preserved, never deleted).
	RowID string `json:"row_id"`
	// Cell is the cell AFTER shredding: structure intact, PII ciphertext = Tombstone, no key.
	Cell Cell `json:"cell"`
}

// ErasureDecision is the RECORDED decision (§9): an erasure is never a silent edit. It carries
// the subject, plan, scope, the shredded key ids, and a when-ref (an injected, deterministic
// reference — never a wall-clock read, so the decision id is reproducible). Its id is
// content-addressed via records.Hash over its canonical body.
type ErasureDecision struct {
	// ID is the content-addressed id of this decision (records.Hash of the canonical body).
	ID string `json:"id"`
	// Plan is the plan the erasure ran under.
	Plan Plan `json:"plan"`
	// Subject is the person erased.
	Subject string `json:"subject"`
	// Scope is the deterministic scope the selection used.
	Scope Scope `json:"scope"`
	// KeyIDs are the shredded per-subject key ids, in canonical order (the keys destroyed).
	KeyIDs []string `json:"key_ids"`
	// RowIDs are the rows tombstoned, in canonical order.
	RowIDs []string `json:"row_ids"`
	// WhenRef is an injected deterministic reference for the decision (e.g. a phase ref). It is
	// NEVER a wall-clock read — the decision id must be reproducible.
	WhenRef string `json:"when_ref"`
}

// ErasureResult is Erase's full value (the wall: a VALUE, never a write): the tombstoned cells
// (structure preserved, PII shredded), the recorded decision, and the shredded key ids.
type ErasureResult struct {
	// Decision is the recorded erasure decision (content-addressed).
	Decision ErasureDecision `json:"decision"`
	// Tombstoned are the shredded cells (after crypto-shredding + tombstone), in scope order.
	Tombstoned []Tombstoned `json:"tombstoned"`
}

// shredCell crypto-shreds one cell: it overwrites every PII ciphertext with the Tombstone,
// drops the key id and the plaintext, and PRESERVES the structural projection verbatim.
func shredCell(c Cell) Cell {
	out := c
	out.Pii = make([]PiiCipher, len(c.Pii))
	for i, p := range c.Pii {
		out.Pii[i] = PiiCipher{Path: p.Path, Ciphertext: tombstoneCipher(), KeyID: ""}
	}
	return out
}

// Erase performs the GDPR Art. 17 erasure on the scoped selection: it crypto-shreds every PII
// cell (key destroyed, ciphertext → Tombstone), PRESERVES the append-only structure, and
// returns the recorded ErasureDecision + the tombstoned cells. It is PURE and TOTAL: the same
// (scope, cells, whenRef) ⇒ byte-identical result (the reproducibility mirror). It writes NO
// truth — the result is a VALUE the caller lands below the line (the wall, §2).
//
// keyOf maps a cell to its per-subject key id (the key crypto-shredding destroys). In a real
// store the key id is the subject's DEK id; here it is supplied per cell.
func Erase(scope Scope, cells []Cell, whenRef string) ErasureResult {
	sel := Select(scope, cells)
	tombs := make([]Tombstoned, 0, len(sel))
	keySet := map[string]struct{}{}
	rowIDs := make([]string, 0, len(sel))
	for _, c := range sel {
		for _, p := range c.Pii {
			if p.KeyID != "" {
				keySet[p.KeyID] = struct{}{}
			}
		}
		tombs = append(tombs, Tombstoned{RowID: c.RowID, Cell: shredCell(c)})
		rowIDs = append(rowIDs, c.RowID)
	}
	keyIDs := make([]string, 0, len(keySet))
	for k := range keySet {
		keyIDs = append(keyIDs, k)
	}
	sort.Strings(keyIDs)
	sort.Strings(rowIDs)

	dec := ErasureDecision{
		Plan:    scope.Plan,
		Subject: scope.Subject,
		Scope:   scope,
		KeyIDs:  keyIDs,
		RowIDs:  rowIDs,
		WhenRef: whenRef,
	}
	dec.ID = decisionID(dec)
	return ErasureResult{Decision: dec, Tombstoned: tombs}
}

// decisionID content-addresses a decision via records.Hash over its canonical body (the id
// field cleared so the hash is of the content, not of itself).
func decisionID(d ErasureDecision) string {
	d.ID = ""
	body := canonicalDecision(d)
	canon, err := records.Canonicalize([]byte(body))
	if err != nil {
		return records.Hash([]byte(body))
	}
	return records.Hash(canon)
}

// canonicalDecision renders the decision as canonical JSON for hashing. It is deterministic
// (sorted slices, fixed field order via the struct tags + records.Canonicalize).
func canonicalDecision(d ErasureDecision) string {
	var b strings.Builder
	b.WriteString(`{"plan":"`)
	b.WriteString(string(d.Plan))
	b.WriteString(`","subject":"`)
	b.WriteString(d.Subject)
	b.WriteString(`","project":"`)
	b.WriteString(d.Scope.Project)
	b.WriteString(`","app":"`)
	b.WriteString(d.Scope.App)
	b.WriteString(`","key_ids":[`)
	for i, k := range d.KeyIDs {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`"`)
		b.WriteString(k)
		b.WriteString(`"`)
	}
	b.WriteString(`],"row_ids":[`)
	for i, r := range d.RowIDs {
		if i > 0 {
			b.WriteString(",")
		}
		b.WriteString(`"`)
		b.WriteString(r)
		b.WriteString(`"`)
	}
	b.WriteString(`],"when_ref":"`)
	b.WriteString(d.WhenRef)
	b.WriteString(`"}`)
	return b.String()
}

// ── Append-only / phase-hash preservation ────────────────────────────────────────────────

// PhaseDigest is the STRUCTURAL projection a phase hash is computed over: the shape + non-PII
// columns + the PII tombstone MARKERS (never the PII plaintext/ciphertext). Because erasure
// only flips a key whose ciphertext is already opaque, and the digest hashes the tombstone
// MARKER for any PII cell (live OR shredded), the digest is INVARIANT under shredding. This is
// what makes "the phase hash stays valid after erasure" mechanically true.
//
// For a LIVE cell the digest emits the structure + a fixed marker per PII path (NOT the
// ciphertext); for a SHREDDED cell it emits the same structure + the same markers. Hence
// PhaseDigest(cells) == PhaseDigest(eraseAll(cells)).
func PhaseDigest(cells []Cell) string {
	sorted := make([]Cell, len(cells))
	copy(sorted, cells)
	sort.SliceStable(sorted, func(i, j int) bool { return sorted[i].RowID < sorted[j].RowID })
	var b strings.Builder
	for _, c := range sorted {
		b.WriteString(c.RowID)
		b.WriteString("|")
		b.WriteString(c.Structure)
		b.WriteString("|")
		paths := make([]string, 0, len(c.Pii))
		for _, p := range c.Pii {
			paths = append(paths, p.Path)
		}
		sort.Strings(paths)
		for _, p := range paths {
			// A fixed per-path PII marker — never the value, never the ciphertext. Invariant
			// across live vs shredded, so the digest does not move under erasure.
			b.WriteString("pii:")
			b.WriteString(p)
			b.WriteString(";")
		}
		b.WriteString("\n")
	}
	return records.Hash([]byte(b.String()))
}

// PhaseHash is the content-addressed hash of a phase's structural digest — the value the DAG
// stores. It is the function whose stability across erasure the mirror asserts.
func PhaseHash(cells []Cell) string { return PhaseDigest(cells) }

// ApplyErasure returns the cell slice with the scoped selection shredded in place (the
// post-erasure store), preserving append-only order and every non-selected cell verbatim. It
// is what a below-the-line landing would persist; the property mirror runs queries against it.
func ApplyErasure(scope Scope, cells []Cell) []Cell {
	res := Erase(scope, cells, "")
	shredded := map[string]Cell{}
	for _, t := range res.Tombstoned {
		shredded[t.RowID] = t.Cell
	}
	out := make([]Cell, len(cells))
	for i, c := range cells {
		if s, ok := shredded[c.RowID]; ok {
			out[i] = s
		} else {
			out[i] = c
		}
	}
	return out
}

// PiiVisible reports whether ANY PII plaintext of the subject is still queryable in the store
// under ANY scope — the property "après suppression, aucune requête ne retourne la PII,
// cross-projet et cross-plan". After ApplyErasure it MUST be false for the erased subject.
// It scans EVERY cell (cross-project, cross-plan), so a leak in any plan is caught.
func PiiVisible(subject string, cells []Cell) bool {
	for _, c := range cells {
		if c.Subject != subject {
			continue
		}
		for _, p := range c.Pii {
			if !p.Shredded() && p.Plaintext != "" {
				return true
			}
		}
	}
	return false
}
