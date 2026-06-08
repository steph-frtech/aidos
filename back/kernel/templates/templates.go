// Package templates is the S81 CURATED TEMPLATE CATALOGUE (KRD §24.6, app-builder EPIC 7, ROADMAP
// S81). It packages curated starter apps (e-commerce, CRM, booking) as CONTENT-ADDRESSED BUNDLES —
// entities + relations + behaviors (INCLUDING `app-auth` from S80) + mirrors + operations + UI
// sources — and INSTANTIATES one into a deterministic, GREEN starting project (the `duplicate-from-
// template` of S56, plus "fork this app" duplicating a project at a stable phase).
//
// WHY A BUNDLE (not a folder of files). A template is a reusable SKELETON the user instantiates
// instead of starting from a blank page (§24.6 "ni partir d'une page blanche à chaque app"). The
// bundle carries the WHOLE app shape AND its proofs: every entity/operation/behavior comes with at
// least one mirror, so an instantiated project is GREEN and MONSTER-FREE the moment it lands — there
// is never a truth without a mirror (a monster) nor an orphan mirror.
//
// app-auth REUSES the ONE S80 expander. A bundle that declares `app-auth` does NOT re-encode the
// User/Role/Session subsystem: it calls the single authoritative appauth.ExpandAppAuth(target) (the
// single-function law, §24.6 — never a second expansion). So the auth subsystem instantiated from a
// template is BYTE-IDENTICAL to the one S80 expands for the same target.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Curated(), Instantiate, Validate, Completeness and Fork are
// PURE, TOTAL functions — no DB, no clock, no RNG, no I/O, never panic, no map-iteration-order leak.
// Same (templateID, targetSlug) ⇒ byte-identical StarterProject (the content-addressed StarterID pins
// it). WHAT a template contains is the DECLARED catalogue (catalog.go), never an LLM judgment — an
// "LLM generating a starter app" would be a determinism gap; the rule is code. The reproducibility
// mirror (template_property_test.go) pins byte-identity, greenness and the monster-free invariant.
//
// THE WALL (CLAUDE.md §2). This package writes NO truth. Instantiate produces a StarterProject VALUE
// (WroteKernel always false); landing the bundle's truths into the kernel goes via the wall (idée →
// miroir → /goal → approbation humaine). The starter-project ROW (a duplicate-from-template) is
// written BELOW the line via the project/DAG store path (S56), exactly like a content-store namespace
// — never from this pure package. Fork likewise computes the forked StarterProject value only.
//
// REUSE, NEVER FORK. BundleID / StarterID = records.Hash(records.Canonicalize(body)) reuse S02
// verbatim (one address space across stores); the scalar/required vocabulary mirrors
// back/kernel/entities; app-auth reuses back/kernel/appauth.
package templates

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/appauth"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// TemplateID is one token of the CLOSED curated catalogue. The set is declared in catalog.go, never
// invented ad-hoc; instantiating an id not in the catalogue is a typed error (ErrUnknownTemplate),
// never a guessed starter (the honesty rule).
type TemplateID string

const (
	// Ecommerce — a storefront starter (Customer/Product/Order + checkout + app-auth).
	Ecommerce TemplateID = "ecommerce"
	// CRM — a contacts/deals starter (Contact/Company/Deal + pipeline ops + app-auth).
	CRM TemplateID = "crm"
	// Booking — a reservations starter (Resource/Slot/Reservation + booking ops + app-auth).
	Booking TemplateID = "booking"
)

// SCALAR is the CLOSED scalar set (mirrors back/kernel/entities). A bundle attribute type outside it
// (and not a `ref` relation node) is refused — the honesty of the closed set is preserved.
var scalarSet = map[string]bool{
	"string": true, "int": true, "bool": true, "float": true,
	"timestamptz": true, "uuid": true, "text": true,
}

// closed cardinalities of a relation node (mirrors S71). A relation outside the set is refused.
var cardinalitySet = map[string]bool{
	"one-to-one": true, "one-to-many": true, "many-to-one": true, "many-to-many": true,
}

// Attribute is one scalar field of a bundled entity (name + scalar type + required) — the entities
// vocabulary (S03/S07). blob attributes (S72) carry type "blob".
type Attribute struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Required bool   `json:"required"`
}

// Relation is one relation node of a bundled entity (S71) — a named edge to a TARGET entity with a
// cardinality. The target MUST be an entity present in the bundle (else ErrUnknownRelationTarget; the
// closed-set honesty is preserved — never a guessed mapping).
type Relation struct {
	Name        string `json:"name"`
	From        string `json:"from"`
	Target      string `json:"target"`
	Cardinality string `json:"cardinality"`
}

// Entity is one bundled entity — name + scalar/blob attributes. The full Entity AST is frozen later
// via /goal; the bundle declares the shape.
type Entity struct {
	Name       string      `json:"name"`
	Attributes []Attribute `json:"attributes"`
}

// Operation is one bundled operation NAME (sync or async). The full Operation AST is materialised via
// /goal; the bundle names the verb.
type Operation struct {
	Name string `json:"name"`
}

// MirrorForm is the closed set of mirror natures (mirrors the three KRD forms). Used to assert every
// truth carries a mirror of a declared form (no monster).
type MirrorForm string

const (
	// FormGherkin — a journey/acceptance mirror (N0).
	FormGherkin MirrorForm = "gherkin"
	// FormProperty — an invariant ∀ mirror (N1).
	FormProperty MirrorForm = "property"
	// FormFixture — a workflow state→cmd→events mirror (N2).
	FormFixture MirrorForm = "fixture"
)

var mirrorForms = map[MirrorForm]bool{FormGherkin: true, FormProperty: true, FormFixture: true}

// Mirror is one bundled proof. Reflects names the truth it proves (an entity/operation/behavior name)
// so completeness can match every truth to ≥1 mirror and reject an ORPHAN mirror (Reflects naming a
// truth absent from the bundle).
type Mirror struct {
	Name     string     `json:"name"`
	Form     MirrorForm `json:"form"`
	Reflects string     `json:"reflects"`
}

// UISource is one bundled UI source (a view/screen spec, S08) — the starter's screens.
type UISource struct {
	Name  string `json:"name"`
	Route string `json:"route"`
}

// Bundle is a CURATED TEMPLATE packaged as a CONTENT-ADDRESSED unit (§24.6). It carries the whole app
// skeleton AND its proofs. BundleID content-addresses the canonical body so two byte-identical bundles
// land at the same address (idempotent), and a change yields a new id.
type Bundle struct {
	// ID is the curated template token (Ecommerce/CRM/Booking).
	ID TemplateID `json:"id"`
	// Labels are per-locale display strings (LOCALIZABLE — ADR 0011 bilingue par défaut; FR required).
	Labels map[string]string `json:"labels"`
	// The declared app skeleton, each slice in canonical (declaration) order.
	Entities   []Entity    `json:"entities"`
	Relations  []Relation  `json:"relations"`
	Behaviors  []string    `json:"behaviors"` // behavior-macro tokens, e.g. "app-auth".
	Operations []Operation `json:"operations"`
	Mirrors    []Mirror    `json:"mirrors"`
	UISources  []UISource  `json:"ui_sources"`
	// BundleID = records.Hash(records.Canonicalize(body)) over the skeleton (excludes BundleID itself).
	BundleID string `json:"bundle_id"`
}

// StarterProject is the DETERMINISTIC result of instantiating a bundle for a target project slug — the
// "duplicate-from-template" output (S56). It is the bundle's app skeleton MATERIALISED for one app,
// PLUS the app-auth subsystem expanded by the ONE S80 expander (when the bundle declares it). VALUES
// only: WroteKernel is ALWAYS false (the wall), and StarterID content-addresses the canonical body.
type StarterProject struct {
	// Template + Target echo the instantiation for provenance ("which starter, for which app").
	Template TemplateID `json:"template"`
	Target   string     `json:"target"`
	// The materialised skeleton (canonical order).
	Entities   []Entity    `json:"entities"`
	Relations  []Relation  `json:"relations"`
	Operations []Operation `json:"operations"`
	Mirrors    []Mirror    `json:"mirrors"`
	UISources  []UISource  `json:"ui_sources"`
	// Auth is the app-auth subsystem expanded by appauth.ExpandAppAuth (when the bundle declares
	// "app-auth"); nil otherwise. NEVER re-implemented here (the single-function law).
	Auth *appauth.Subsystem `json:"auth,omitempty"`
	// StarterID = records.Hash(records.Canonicalize(body)) — same (template, target) ⇒ same id.
	StarterID string `json:"starter_id"`
	// WroteKernel is ALWAYS false. Instantiation is a dry-run value; freezing goes via /goal.
	WroteKernel bool `json:"wrote_kernel"`
}

// Errors.
var (
	// ErrUnknownTemplate — an instantiation of a template not in the curated catalogue.
	ErrUnknownTemplate = errors.New("templates: id is not in the curated catalogue (§24.6)")
	// ErrNoTarget — an instantiation with an empty target project slug.
	ErrNoTarget = errors.New("templates: instantiation has no target project slug")
	// ErrNoFRLabel — a bundle without a French label (LOCALIZABLE, ADR 0011 bilingue par défaut).
	ErrNoFRLabel = errors.New("templates: bundle has no FR label (localizable, ADR 0011)")
	// ErrBadScalar — a bundle attribute type that is neither a closed scalar nor "blob".
	ErrBadScalar = errors.New("templates: attribute type is not a declared scalar")
	// ErrUnknownRelationTarget — a relation pointing at an entity absent from the bundle (S71 honesty).
	ErrUnknownRelationTarget = errors.New("templates: relation target is not an entity in the bundle")
	// ErrUnknownRelationFrom — a relation whose `from` is not an entity in the bundle.
	ErrUnknownRelationFrom = errors.New("templates: relation `from` is not an entity in the bundle")
	// ErrBadCardinality — a relation cardinality outside the closed set (S71).
	ErrBadCardinality = errors.New("templates: relation cardinality is not in the closed set")
	// ErrBadMirrorForm — a mirror with a form outside the three declared KRD forms.
	ErrBadMirrorForm = errors.New("templates: mirror form is not one of gherkin|property|fixture")
	// ErrTruthWithoutMirror — a bundled truth (entity/operation/behavior) with no mirror (a MONSTER).
	ErrTruthWithoutMirror = errors.New("templates: a bundled truth has no mirror (monster: truth sans miroir)")
	// ErrOrphanMirror — a mirror reflecting a truth absent from the bundle (a MONSTER: orphan mirror).
	ErrOrphanMirror = errors.New("templates: a mirror reflects a truth absent from the bundle (monster: orphan mirror)")
)

// Catalogue returns the curated template ids in canonical order. PURE.
func Catalogue() []TemplateID { return []TemplateID{Ecommerce, CRM, Booking} }

// Get returns the curated bundle for an id (with its BundleID computed), or ErrUnknownTemplate. PURE.
func Get(id TemplateID) (Bundle, error) {
	raw, ok := curated[id]
	if !ok {
		return Bundle{}, fmt.Errorf("%w: %q", ErrUnknownTemplate, id)
	}
	b := raw // copy
	bid, err := bundleID(b)
	if err != nil {
		return Bundle{}, fmt.Errorf("templates: address bundle: %w", err)
	}
	b.BundleID = bid
	return b, nil
}

// Curated returns every curated bundle in catalogue order (with BundleIDs). PURE. The Workbench
// /templates panel renders this.
func Curated() ([]Bundle, error) {
	out := make([]Bundle, 0, len(curated))
	for _, id := range Catalogue() {
		b, err := Get(id)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, nil
}

// entityNames returns the set of entity names in a bundle (including the app-auth entities when the
// bundle declares "app-auth"). Used so a relation may target an auth entity (User) too.
func entityNames(b Bundle) map[string]bool {
	set := make(map[string]bool, len(b.Entities)+3)
	for _, e := range b.Entities {
		set[e.Name] = true
	}
	if declaresAppAuth(b) {
		for _, e := range appauth.ExpandAppAuthEntities() {
			set[e.Name] = true
		}
	}
	return set
}

func declaresAppAuth(b Bundle) bool {
	for _, name := range b.Behaviors {
		if name == appauth.MacroName {
			return true
		}
	}
	return false
}

// Validate checks a bundle is well-formed: a FR label, closed scalar/blob types, relations whose
// from/target are entities present in the bundle (S71 honesty), closed cardinalities, and declared
// mirror forms. PURE; returns a typed error, never a guessed default (the honesty rule). This is the
// "Kernel vert" half of the done-criterion.
func Validate(b Bundle) error {
	if b.Labels["fr"] == "" {
		return ErrNoFRLabel
	}
	names := entityNames(b)
	for _, e := range b.Entities {
		for _, a := range e.Attributes {
			if a.Type != "blob" && !scalarSet[a.Type] {
				return fmt.Errorf("%w: %s.%s=%q", ErrBadScalar, e.Name, a.Name, a.Type)
			}
		}
	}
	for _, r := range b.Relations {
		if !names[r.From] {
			return fmt.Errorf("%w: %q", ErrUnknownRelationFrom, r.From)
		}
		if !names[r.Target] {
			return fmt.Errorf("%w: %q", ErrUnknownRelationTarget, r.Target)
		}
		if !cardinalitySet[r.Cardinality] {
			return fmt.Errorf("%w: %q", ErrBadCardinality, r.Cardinality)
		}
	}
	for _, m := range b.Mirrors {
		if !mirrorForms[m.Form] {
			return fmt.Errorf("%w: %q", ErrBadMirrorForm, m.Form)
		}
	}
	return Completeness(b)
}

// truthNames returns the set of truth names a bundle's mirrors MUST cover: every entity, every
// operation, and every behavior token. (Relations are covered transitively by their owning entity's
// mirror; app-auth carries its OWN mirrors in S80, so the "app-auth" behavior token is covered by a
// bundle mirror reflecting it.)
func truthNames(b Bundle) []string {
	var out []string
	for _, e := range b.Entities {
		out = append(out, e.Name)
	}
	for _, o := range b.Operations {
		out = append(out, o.Name)
	}
	out = append(out, b.Behaviors...)
	return out
}

// Completeness enforces the monster-free invariant (the "miroirs présents ∧ aucun monstre" half of the
// done-criterion): every bundled truth has ≥1 mirror reflecting it (no truth-without-mirror), and
// every mirror reflects a truth present in the bundle (no orphan mirror). PURE.
func Completeness(b Bundle) error {
	reflected := make(map[string]bool, len(b.Mirrors))
	truths := make(map[string]bool)
	for _, t := range truthNames(b) {
		truths[t] = true
	}
	// No orphan mirror: every mirror reflects a present truth.
	for _, m := range b.Mirrors {
		if !truths[m.Reflects] {
			return fmt.Errorf("%w: mirror %q reflects %q", ErrOrphanMirror, m.Name, m.Reflects)
		}
		reflected[m.Reflects] = true
	}
	// No truth without a mirror.
	for _, t := range truthNames(b) {
		if !reflected[t] {
			return fmt.Errorf("%w: %q", ErrTruthWithoutMirror, t)
		}
	}
	return nil
}

// Instantiate is the §24.6 / S56 `duplicate-from-template` — PURE, TOTAL, DRY-RUN, IDEMPOTENT, the
// AUTHORITATIVE instantiation. It validates the bundle (Kernel green ∧ no monster), materialises its
// skeleton for the target app, expands `app-auth` via the ONE S80 expander when declared (never a
// second expansion), and content-addresses the result. It WRITES NOTHING (WroteKernel=false). Same
// (templateID, targetSlug) ⇒ byte-identical StarterProject (StarterID pins it). An unknown template or
// an empty target is a typed error, never a guessed starter (the honesty rule).
func Instantiate(id TemplateID, targetSlug string) (StarterProject, error) {
	if targetSlug == "" {
		return StarterProject{}, ErrNoTarget
	}
	b, err := Get(id)
	if err != nil {
		return StarterProject{}, err
	}
	if err := Validate(b); err != nil {
		return StarterProject{}, err
	}
	sp := StarterProject{
		Template:    id,
		Target:      targetSlug,
		Entities:    b.Entities,
		Relations:   b.Relations,
		Operations:  b.Operations,
		Mirrors:     b.Mirrors,
		UISources:   b.UISources,
		WroteKernel: false,
	}
	if declaresAppAuth(b) {
		sub, aerr := appauth.ExpandAppAuth(targetSlug)
		if aerr != nil {
			return StarterProject{}, fmt.Errorf("templates: expand app-auth: %w", aerr)
		}
		sp.Auth = &sub
	}
	sid, err := starterID(sp)
	if err != nil {
		return StarterProject{}, fmt.Errorf("templates: address starter: %w", err)
	}
	sp.StarterID = sid
	return sp, nil
}

// Fork is "fork this app" — duplicating a project at a STABLE PHASE (S56). It re-instantiates the same
// curated starter for a NEW target slug from a given parent phase (content-addressed), so the fork is
// a deterministic copy of the starter at that phase. PURE; WRITES NOTHING. The forked StarterID
// includes the parent phase so two forks from different phases differ; two forks from the SAME phase
// to the SAME slug are byte-identical (idempotent).
func Fork(id TemplateID, targetSlug, parentPhase string) (StarterProject, error) {
	sp, err := Instantiate(id, targetSlug)
	if err != nil {
		return StarterProject{}, err
	}
	// Re-address including the parent phase so the fork records WHERE it forked from.
	sid, err := forkID(sp, parentPhase)
	if err != nil {
		return StarterProject{}, fmt.Errorf("templates: address fork: %w", err)
	}
	sp.StarterID = sid
	return sp, nil
}

// PieceCount totals the source pieces a starter materialises (entities + relations + operations +
// ui + auth pieces) — the deterministic count the Workbench renders. PURE.
func PieceCount(sp StarterProject) int {
	n := len(sp.Entities) + len(sp.Relations) + len(sp.Operations) + len(sp.UISources)
	if sp.Auth != nil {
		n += appauth.PieceCount(*sp.Auth)
	}
	return n
}

// SortedNames returns every materialised piece name in one stable, sorted list — a convenience for the
// reproducibility mirror's byte-identity assertion. PURE.
func SortedNames(sp StarterProject) []string {
	var out []string
	for _, e := range sp.Entities {
		out = append(out, "ent:"+e.Name)
	}
	for _, r := range sp.Relations {
		out = append(out, "rel:"+r.Name)
	}
	for _, o := range sp.Operations {
		out = append(out, "op:"+o.Name)
	}
	for _, m := range sp.Mirrors {
		out = append(out, "mir:"+m.Name)
	}
	for _, u := range sp.UISources {
		out = append(out, "ui:"+u.Name)
	}
	if sp.Auth != nil {
		out = append(out, appauth.SortedNames(*sp.Auth)...)
	}
	sort.Strings(out)
	return out
}

// --- content addresses (reuse records.Canonicalize/Hash verbatim, S02) ---

func bundleID(b Bundle) (string, error) {
	body := struct {
		ID         TemplateID  `json:"id"`
		Entities   []Entity    `json:"entities"`
		Relations  []Relation  `json:"relations"`
		Behaviors  []string    `json:"behaviors"`
		Operations []Operation `json:"operations"`
		Mirrors    []Mirror    `json:"mirrors"`
		UISources  []UISource  `json:"ui_sources"`
	}{
		ID: b.ID, Entities: b.Entities, Relations: b.Relations, Behaviors: b.Behaviors,
		Operations: b.Operations, Mirrors: b.Mirrors, UISources: b.UISources,
	}
	return addr(body)
}

func starterID(sp StarterProject) (string, error) {
	body := struct {
		Template   TemplateID         `json:"template"`
		Target     string             `json:"target"`
		Entities   []Entity           `json:"entities"`
		Relations  []Relation         `json:"relations"`
		Operations []Operation        `json:"operations"`
		Mirrors    []Mirror           `json:"mirrors"`
		UISources  []UISource         `json:"ui_sources"`
		Auth       *appauth.Subsystem `json:"auth,omitempty"`
	}{
		Template: sp.Template, Target: sp.Target, Entities: sp.Entities, Relations: sp.Relations,
		Operations: sp.Operations, Mirrors: sp.Mirrors, UISources: sp.UISources, Auth: sp.Auth,
	}
	return addr(body)
}

func forkID(sp StarterProject, parentPhase string) (string, error) {
	body := struct {
		Fork        string             `json:"fork"`
		ParentPhase string             `json:"parent_phase"`
		Template    TemplateID         `json:"template"`
		Target      string             `json:"target"`
		Entities    []Entity           `json:"entities"`
		Relations   []Relation         `json:"relations"`
		Operations  []Operation        `json:"operations"`
		Mirrors     []Mirror           `json:"mirrors"`
		UISources   []UISource         `json:"ui_sources"`
		Auth        *appauth.Subsystem `json:"auth,omitempty"`
	}{
		Fork: "fork", ParentPhase: parentPhase, Template: sp.Template, Target: sp.Target,
		Entities: sp.Entities, Relations: sp.Relations, Operations: sp.Operations,
		Mirrors: sp.Mirrors, UISources: sp.UISources, Auth: sp.Auth,
	}
	return addr(body)
}

func addr(body any) (string, error) {
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}
