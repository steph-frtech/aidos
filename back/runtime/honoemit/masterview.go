package honoemit

// masterview.go — LA VUE MAÎTRE (le requirement canonique, le NŒUD PARENT de la vue).
//
// Modèle (utilisatrice, gravé 2026-06-14) : PAS « une vue → N clones ». Une VUE MAÎTRE
// (le requirement canonique, PLATEFORME-AGNOSTIQUE) + TROIS VUES ENFANTS DISTINCTES
// (web / mobile / desktop), chacune DÉRIVÉE de la maître MAIS ADAPTABLE à sa plateforme
// (idiomes, layouts différents — PAS un clone). La maître = le PARENT (un nœud
// content-adressé) ; les trois enfants = des nœuds (parentId = la maître) dans l'arbre
// `composes` (S18) / fractal (ADR 0055). Chaque enfant est indépendamment adaptable, et
// une adaptation validée se capitalise (le loopback, back/runtime/compound).
//
// LA MAÎTRE EST UNE PROJECTION PURE DE L'ARBRE (déterminisme-first / le mur, §2/§6/§8) :
// elle ne décrit PAS une forme (pas de couleur, pas de layout, pas de plateforme) — elle
// décrit la STRUCTURE SÉMANTIQUE du requirement, plateforme-agnostique :
//
//   - Sections : UNE par entité (S35) — les champs montrés EN ORDRE SOURCE (la projection
//                de entities.AttributeSet, jamais inventée) ;
//   - Actions  : UNE par control→action (S11) — l'opération liée (action.Invoke) + les
//                Expr visible_when/enabled_when CANONICALISÉES (le MÊME catalogue gelé que
//                le bouton S38 évalue côté client) ;
//   - Invariants : les ∀ qui gatent la vue (déclarés, jamais inventés — le mur §8 interdit
//                à l'émetteur d'AUTHOR un invariant qu'il satisferait ensuite).
//
// CONTENT-ADRESSÉE (records.Hash) : EmitMasterView(WebAppSpec) → MasterView est une FONCTION
// PURE, TOTALE, byte-stable de (entités ⊕ controls/actions) — mêmes specs (modulo l'ordre
// d'entrée) → MÊME maître → MÊME Hash. C'est l'ADRESSE du PARENT : chaque enfant en dérive
// et porte son parentId == ce hash, formant une arête `composes` (S18, parent → enfant).
//
// RÉUTILISE, NE RÉINVENTE PAS (ADR 0007) : la maître réutilise entities.AttributeSet (l'ordre
// source des champs, S35), expr.Canonicalize (la forme canonique des Expr, le MÊME schéma que
// le bouton S38) et records.Hash/Canonicalize (l'espace d'adresse unique S02). Elle ne
// re-dérive AUCUNE règle métier — visible_when/enabled_when restent les ASTs Expr du control.

import (
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/expr"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// MasterSection is one SECTION of the master view — the platform-agnostic projection of one
// entity (S35): the entity name + the FIELDS it shows, in SOURCE ORDER (entities.AttributeSet,
// never invented). A child (web/mobile/desktop) DERIVES its own form from this section — a web
// <table>, a mobile FlatList, a desktop panel — but the FIELDS and their order are CONSTRAINED
// by the master (same semantics, another form).
type MasterSection struct {
	// Entity is the entity name the section is derived from (S35).
	Entity string `json:"entity"`
	// Fields are the entity's attribute names IN SOURCE ORDER (entities.AttributeSet). A field
	// the AST does not pin is never invented (the honesty rule); the count matches the AttributeSet.
	Fields []string `json:"fields"`
}

// MasterAction is one ACTION of the master view — the platform-agnostic projection of one
// control→action (S11): the control name, the bound operation (action.Invoke), and the
// CANONICALISED visible_when/enabled_when Expr (the SAME frozen catalogue the S38 button
// evaluates client-side). A child derives its own affordance — a web button, a mobile
// Pressable, a desktop menu item — but the operation it triggers AND the Expr that gates it
// are CONSTRAINED by the master (same semantics, another form).
type MasterAction struct {
	// Control is the control name the action is derived from (S11).
	Control string `json:"control"`
	// Invoke is the bound operation ref the action triggers (action.Invoke), verbatim from the
	// source (never coined). Empty only if the source pins no bind (rare; the master records it
	// honestly rather than inventing one).
	Invoke string `json:"invoke"`
	// VisibleWhen / EnabledWhen are the control's two predicates, CANONICALISED to the frozen
	// Expr JSON form (expr.Canonicalize — the SAME content-address scheme S38 hashes over). They
	// are held as the canonical bytes-as-string so the master is JSON-marshalable and content-
	// addressed; the child re-uses these ASTs (it never re-types the rule).
	VisibleWhen string `json:"visible_when"`
	EnabledWhen string `json:"enabled_when"`
}

// MasterView is the CANONICAL, PLATFORM-AGNOSTIC view requirement — the PARENT node every
// child (web/mobile/desktop) derives from. It is the STRUCTURE SÉMANTIQUE of the view, not a
// form: the project namespace, the sections (entities S35), the actions (controls→actions S11),
// and the invariants (∀, declared). It is content-addressed by EmitMasterView; its Hash is the
// parentId each child carries (the `composes` edge, S18).
type MasterView struct {
	// Project is the project namespace (the view belongs to a project).
	Project string `json:"project"`
	// Sections is one MasterSection per entity, in CANONICAL (entity-name) order — input order
	// never leaks into the bytes (the determinism contract).
	Sections []MasterSection `json:"sections"`
	// Actions is one MasterAction per control→action, in CANONICAL (control-name) order.
	Actions []MasterAction `json:"actions"`
	// Invariants are the DECLARED ∀ that gate the view (KRD §8: stated by the human, never
	// authored by the emitter). Held verbatim in CANONICAL (sorted) order so the master is
	// byte-stable. Empty when the source pins none — never invented to look complete.
	Invariants []string `json:"invariants,omitempty"`
}

// EmitMasterView projects a WebAppSpec into its MASTER VIEW — the canonical, platform-agnostic
// requirement node the three children (web/mobile/desktop) derive from. It is a FUNCTION PURE,
// TOTALE, byte-stable of (entities ⊕ controls/actions): sections in canonical entity order,
// actions in canonical control order with their bound operation + canonicalised Expr, and the
// declared invariants. A malformed spec is a typed BlockReason (the honesty rule — the SAME
// validation as EmitWebApp), never a partial master.
//
// The master is the PARENT: MasterViewHash(master) is the content address each child pins as
// its parentId (the `composes` edge, S18). The master AUTHORS no truth (below-the-line, §9) and
// invents no field/action/operation — it reads the cut and projects exactly what it pins.
func EmitMasterView(s WebAppSpec) (MasterView, *blockreason.BlockReason) {
	// The source check is the SAME validateWebApp (one validation across the family — the master
	// and the web child refuse the same malformed cuts), reshaped to name the MASTER source so the
	// panel/`aidos explain` distinguishes "the master refused" from "the web child refused".
	if br := validateWebApp(s); br != nil {
		bre := blockMasterView(masterCauseOf(s))
		return MasterView{}, &bre
	}

	// Canonical order: entities by name, buttons by control name — input order never leaks (the
	// SAME canonicalisation EmitWebApp applies, reused so the two emitters never drift).
	ents := sortedEntities(s.Entities)
	btns := sortedButtons(s.Buttons)

	sections := make([]MasterSection, 0, len(ents))
	for _, e := range ents {
		sections = append(sections, MasterSection{Entity: e.Name, Fields: entities.AttributeSet(e)})
	}

	actions := make([]MasterAction, 0, len(btns))
	for _, ca := range btns {
		vw, err := canonExpr(ca.Control.VisibleWhen)
		if err != nil {
			br := blockMasterView(fmt.Errorf("control %q visible_when: %w", ca.Control.Name, err))
			return MasterView{}, &br
		}
		ew, err := canonExpr(ca.Control.EnabledWhen)
		if err != nil {
			br := blockMasterView(fmt.Errorf("control %q enabled_when: %w", ca.Control.Name, err))
			return MasterView{}, &br
		}
		actions = append(actions, MasterAction{
			Control:     ca.Control.Name,
			Invoke:      ca.Action.Invoke,
			VisibleWhen: vw,
			EnabledWhen: ew,
		})
	}

	return MasterView{
		Project:    s.Project,
		Sections:   sections,
		Actions:    actions,
		Invariants: sortedNames(s.Invariants),
	}, nil
}

// canonExpr canonicalises an Expr to the frozen JSON form (expr.Canonicalize — the SAME scheme
// S38 hashes over) and returns it as a string so the master is JSON-marshalable. A nil Expr is
// the empty string (the source pins no predicate — recorded honestly, never invented). It is the
// ONE place the master touches an Expr; it re-types no rule, it only serialises the AST.
func canonExpr(e expr.Expr) (string, error) {
	if e == nil {
		return "", nil
	}
	b, err := expr.Canonicalize(e)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// masterViewBody re-serialises the MasterView into a canonical, key-sorted JSON body so the
// MasterViewHash is a content address: same view requirement → same hash. It is the body the
// PARENT node is addressed by (the parentId each child pins).
func masterViewBody(m MasterView) ([]byte, error) {
	return records.Canonicalize(mustJSON(m))
}

// MasterViewHash is the content address of a master view — the PARENT id each child pins as its
// parentId (the `composes` edge, S18). Any change to the canonical structure (a new section, a
// new field, a new action, a changed Expr, a new invariant) yields a new hash (a new parent node,
// never an in-place mutation — anti-overwrite §9). It is computed straight FROM the spec so a
// caller need not hold the MasterView value to know the parent address.
func MasterViewHash(s WebAppSpec) (string, *blockreason.BlockReason) {
	m, br := EmitMasterView(s)
	if br != nil {
		return "", br
	}
	body, err := masterViewBody(m)
	if err != nil {
		bre := blockMasterView(fmt.Errorf("master hash: %w", err))
		return "", &bre
	}
	return records.Hash(body), nil
}

// Hash is the MasterView's own content address (the PARENT id), computed from the value. It is
// the SAME address MasterViewHash(spec) returns for the spec the master was emitted from (the
// round-trip property the mirror pins). A master that fails to serialise (impossible for a
// well-formed value) hashes the empty body — never silently equal to a real master.
func (m MasterView) Hash() string {
	body, err := masterViewBody(m)
	if err != nil {
		return records.Hash([]byte("{}"))
	}
	return records.Hash(body)
}

// masterCauseOf recomputes the underlying cause validateWebApp detected, so the master refusal
// names the SAME missing pin (no project / empty app / malformed entity / malformed control). It
// re-runs the same checks in the same order — a pure recomputation, never a guessed message.
func masterCauseOf(s WebAppSpec) error {
	if s.Project == "" {
		return ErrNoProject
	}
	if len(s.Entities) == 0 && len(s.Buttons) == 0 {
		return ErrEmptyApp
	}
	for _, e := range s.Entities {
		if err := entities.Validate(e); err != nil {
			return fmt.Errorf("entity: %w", err)
		}
	}
	for _, ca := range s.Buttons {
		if ca.Control.Name == "" {
			return fmt.Errorf("control: missing name")
		}
	}
	return fmt.Errorf("source malformed")
}

// blockMasterView renders the canonical S13 BlockReason for a malformed master-view source. It
// reuses the web-app refusal shape (the SAME source — entities S35 / controls→actions S11) so the
// panel + `aidos explain` name the same missing pin whether the caller asked for the master or a
// child. Carries a non-empty French how_to_fix (no prison).
func blockMasterView(cause error) blockreason.BlockReason {
	br := blockWebApp(cause)
	br.Explanation = "Émission de la vue MAÎTRE refusée : la source (entités S35 / controls→actions S11) est " +
		"malformée ou vide (" + cause.Error() + "). La vue MAÎTRE est une PROJECTION PURE de l'arbre — elle " +
		"n'invente ni une section, ni une action, ni un invariant (honnêteté, le mur §8). Une source sans " +
		"entité ni control ne dérive aucune maître."
	return br
}
