package honoemit

// screendesign.go — LE DESIGN LAB (Onlook INVERSÉ, ADR 0071) : le geste de design devient un
// REQUIREMENT content-adressé, et le compilateur (les émetteurs) reproduit l'écran byte-stable.
//
// Modèle (utilisatrice, gravé 2026-06-14) : Onlook réécrit la SOURCE (AST code-edit, data-oid,
// write-file) — c'est EXACTEMENT ce que le mur §2 interdit (gen/ est une projection régénérable,
// l'agent n'écrit jamais la vérité). AIDOS inverse : le geste de design ne s'écrit JAMAIS dans le
// code, il devient un ScreenDesign — un requirement SOFT, content-adressé, append-only,
// below-the-line — et l'émetteur le REPRODUIT sur les 3 enfants (web/mobile/desktop) byte-stable.
//
// LE MUR / DÉTERMINISME-FIRST (§2/§6/§8). Le ScreenDesign N'ÉTEND PAS MasterView (ce serait
// structurel — ajout/retrait/réordre de champ). Il étend la VOIE ViewAdaptation : un override SOFT
// per-coordonnée, ParentID == master.Hash() TOUJOURS. CapitaliseScreenDesign RÉUTILISE
// compound.Compound / firewall.ViaIdea (la MÊME boucle CE03 que les behaviors/procédures, le SEUL
// passage par le mur) — JAMAIS firewall.ToKernel ; WroteKernel() == false épinglé par le miroir.
// Un geste STRUCTUREL (ajout/retrait/réordre de champ/section/action) route vers idée→miroir→/goal,
// jamais une écriture directe — ClassifyGesture le tranche déterministe.
//
// CATALOGUE FERMÉ (déterminisme-first, fail-closed). Le StyleToken est exprimé en TOKENS ADR 0010
// (bg=card, text=foreground, text=primary, radius=lg…) — JAMAIS un hex, JAMAIS une utilitaire
// Tailwind arbitraire. L'ensemble Property × Token est CLOS : un token hors-catalogue est REFUSÉ
// (BlockReason), jamais coercé. La reproduction est l'ÉMETTEUR, jamais une génération LLM.
//
// ANTI-OVERWRITE §9. AdaptationOverride gagne `Screen *ScreenOverride` (nil → forme actuelle
// INCHANGÉE). EmitWebChildAdapted avec Screen==nil DOIT être byte-identique à EmitWebApp ; les
// autres enfants restent byte-inchangés quand l'override est vide (le miroir anti-drift le scelle).
//
// RÉUTILISE, NE RÉINVENTE PAS (ADR 0007) : MasterView/EmitMasterView, la voie ViewAdaptation +
// compound (le loopback), records.Hash/Canonicalize (S02), les data-aidos-* DÉJÀ émis
// (l'instrumentation gratuite ; on normalise le drift {view,screen,panel}→section, {col,field}→field,
// invoke→action), le mécanisme d'embed du twin (calque exprTwinSource / aidos-expr.embed).

import (
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/compound"
)

// CoordKind normalises the DOM-attribute drift the emitters already stamp into ONE closed kind set
// (the single point the drift is reconciled, ADR 0071):
//
//	{data-aidos-view, data-aidos-screen, data-aidos-panel} → CoordSection
//	{data-aidos-col,  data-aidos-field}                    → CoordField
//	{data-aidos-invoke}                                    → CoordAction
//
// The set is CLOSED — a coordinate kind outside it is never invented (honesty, the mur §8).
type CoordKind string

const (
	// CoordSection — an entity section (MasterSection.Entity). The web <section data-aidos-view>,
	// the mobile <View data-aidos-screen>, the desktop <section data-aidos-panel> all project it.
	CoordSection CoordKind = "section"
	// CoordField — an attribute of a section (MasterSection.Fields[i]). The web <th data-aidos-col>,
	// the mobile <View data-aidos-field>, the desktop <th data-aidos-col> all project it.
	CoordField CoordKind = "field"
	// CoordAction — a control→action (MasterAction.Control / .Invoke). The data-aidos-invoke element.
	CoordAction CoordKind = "action"
)

// IsKnownCoordKind reports whether k is a member of the closed coord-kind enum.
func IsKnownCoordKind(k CoordKind) bool {
	switch k {
	case CoordSection, CoordField, CoordAction:
		return true
	default:
		return false
	}
}

// ScreenCoord is the coordinate-requirement a DOM element projects (read from the data-aidos-*
// attributes, normalised). It is addressed RELATIVELY to the master (never a file:line:column — there
// is no source-main to point at; the inversion of Onlook). The Entity is always filled; Field is set
// only for CoordField; Control only for CoordAction.
type ScreenCoord struct {
	// Kind is the coordinate kind (section | field | action) — the normalised drift.
	Kind CoordKind `json:"kind"`
	// Entity is the entity name the coordinate belongs to (MasterSection.Entity) — always filled.
	Entity string `json:"entity"`
	// Field is the attribute name (MasterSection.Fields[i]) — set only for Kind==CoordField.
	Field string `json:"field,omitempty"`
	// Control is the control name (MasterAction.Control) — set only for Kind==CoordAction.
	Control string `json:"control,omitempty"`
}

// coordKey is a stable, total string key for a coordinate (the deterministic sort + match key). PURE.
func (c ScreenCoord) coordKey() string {
	return string(c.Kind) + "\x00" + c.Entity + "\x00" + c.Field + "\x00" + c.Control
}

// StyleToken is a PURE styling override expressed in ADR-0010 TOKENS (zinc + blue-600 — bg=card,
// text=foreground, text=primary, radius=lg…). NEVER a hex, NEVER an arbitrary Tailwind utility. The
// Property × Token space is a CLOSED CATALOGUE (validated deterministically, fail-closed).
type StyleToken struct {
	// Property is the styling axis — a member of the closed property set.
	Property string `json:"property"`
	// Token is the ADR-0010 token value — a member of the closed token set for that property.
	Token string `json:"token"`
}

// styleProperties is the CLOSED property catalogue (ADR 0010). A property outside it is refused
// fail-closed. Each property maps to its closed token set AND to the Tailwind class prefix the
// emitter renders (the deterministic property→class mapping — never a free-form utility).
//
// T3 (ADR 0071) EXTENDS the catalogue with the typography/elevation/density/layout axes a complete
// style-panel needs — all still TOKENS (never a hex, never an arbitrary utility):
//   - size    → text-<xs|sm|base|lg|xl>   (font-size — the Tailwind text-size scale)
//   - weight  → font-<normal|medium|semibold|bold>
//   - shadow  → shadow[-<sm|md|lg>] | shadow-none (elevation)
//   - density → aidos-density-<compact|cosy|spacieux>  (a DECLARED design-system class, a closed
//     set of pad/gap presets — never a raw utility; see ADR 0010 density presets)
//   - width   → w-<full|auto|fit|half>     (the closed width subset)
//   - cols    → grid-cols-<1|2|3|4>        (the closed column subset)
var styleProperties = map[string]string{
	"bg":      "bg-",            // background colour token → bg-<token>
	"text":    "text-",          // text colour token → text-<token>
	"border":  "border-",        // border colour token → border-<token>
	"radius":  "rounded-",       // corner radius token → rounded-<token>
	"pad":     "p-",             // padding token → p-<token>
	"gap":     "gap-",           // gap token → gap-<token>
	"align":   "text-",          // text alignment token → text-<token> (left/center/right)
	"size":    "text-",          // font-size token → text-<token> (xs/sm/base/lg/xl)
	"weight":  "font-",          // font-weight token → font-<token> (normal/medium/semibold/bold)
	"shadow":  "shadow-",        // elevation token → shadow-<token> (none/sm/md/lg)
	"density": "aidos-density-", // density preset → aidos-density-<token> (compact/cosy/spacieux)
	"width":   "w-",             // width token → w-<token> (full/auto/fit/half)
	"cols":    "grid-cols-",     // columns token → grid-cols-<token> (1/2/3/4)
}

// styleTokens is the CLOSED token catalogue per property (ADR 0010 — zinc + blue-600, radius 0.5rem).
// A token outside its property's set is refused fail-closed (never a hex, never an arbitrary class).
var styleTokens = map[string]map[string]bool{
	// Colour tokens (the ADR-0010 semantic palette). Shared across bg/text/border.
	"bg": setOf("card", "foreground", "primary", "secondary", "muted", "accent", "background",
		"destructive", "border", "popover"),
	"text": setOf("card", "foreground", "primary", "secondary", "muted", "muted-foreground",
		"accent", "background", "destructive", "primary-foreground", "left", "center", "right"),
	"border": setOf("border", "primary", "muted", "destructive", "accent", "foreground"),
	// Radius tokens (the shadcn scale; radius 0.5rem == rounded-lg is the ADR-0010 default).
	"radius": setOf("none", "sm", "md", "lg", "xl", "full"),
	// Spacing tokens (the Tailwind 4-pt scale, the closed subset the design system exposes).
	"pad": setOf("0", "1", "2", "3", "4", "5", "6", "8"),
	"gap": setOf("0", "1", "2", "3", "4", "5", "6", "8"),
	// Alignment tokens (text alignment — the only align tokens the closed catalogue exposes).
	"align": setOf("left", "center", "right"),
	// Font-size tokens (the Tailwind text-size scale — the closed typographic ramp; base == default).
	"size": setOf("xs", "sm", "base", "lg", "xl"),
	// Font-weight tokens (the closed weight ramp the design system exposes).
	"weight": setOf("normal", "medium", "semibold", "bold"),
	// Elevation tokens (the shadcn shadow scale; "none" == shadow-none, no shadow).
	"shadow": setOf("none", "sm", "md", "lg"),
	// Density presets (a DECLARED design-system class — a closed set of pad/gap presets, never a raw
	// utility; "compact" tightens, "spacieux" loosens). It can NEVER hide a field (it only re-spaces
	// — the §177 OpenQuestion frontier: a density token is pure styling, never a structural removal).
	"density": setOf("compact", "cosy", "spacieux"),
	// Width tokens (the closed width subset — full/auto/fit/half, never an arbitrary w-[…]).
	"width": setOf("full", "auto", "fit", "half"),
	// Columns tokens (the closed grid-column subset — 1..4, never an arbitrary grid-cols-[…]).
	"cols": setOf("1", "2", "3", "4"),
}

// styleTokenAlias maps a (property, token) whose Tailwind class is NOT the literal prefix+token to its
// rendered class SUFFIX (the part after the prefix). The closed catalogue stays the human-facing token
// vocabulary; the alias is the deterministic render translation (e.g. width "half" → w-1/2 — the token
// avoids the "/" the canonical adapt-phrase parser forbids, ADR 0071 §3). PURE: a token absent from the
// alias renders as prefix+token verbatim. The alias is itself a CLOSED table (never a free-form class).
var styleTokenAlias = map[string]string{
	"width=half": "1/2", // w-1/2 — "half" is the catalogue token (no "/" in the adapt phrase)
}

func setOf(items ...string) map[string]bool {
	m := make(map[string]bool, len(items))
	for _, it := range items {
		m[it] = true
	}
	return m
}

// IsKnownStyleToken reports whether (property, token) is a member of the CLOSED ADR-0010 catalogue.
// PURE, TOTAL: an unknown property OR an unknown token for a known property is false (fail-closed —
// a hex, an arbitrary Tailwind utility, a typo all return false). Never panics.
func IsKnownStyleToken(t StyleToken) bool {
	tokens, ok := styleTokens[t.Property]
	if !ok {
		return false
	}
	return tokens[t.Token]
}

// className renders a StyleToken to its ADR-0010 Tailwind class (the deterministic property→class
// mapping). PRE: IsKnownStyleToken(t) — callers validate before rendering. The class is the closed
// prefix + the token (e.g. {bg,card} → "bg-card", {radius,lg} → "rounded-lg"). PURE, TOTAL.
func (t StyleToken) className() string {
	prefix, ok := styleProperties[t.Property]
	if !ok {
		return ""
	}
	if suffix, aliased := styleTokenAlias[t.Property+"="+t.Token]; aliased {
		return prefix + suffix
	}
	return prefix + t.Token
}

// ScreenOverride is the per-coordinate screen override (the NEW additive field of AdaptationOverride).
// It pins a styling stack (ADR-0010 tokens) + a per-platform label for ONE coordinate. A STRUCTURAL
// reorder/add/remove of fields/sections is NOT here (→ idea→/goal): an override only re-styles an
// element that ALREADY exists.
type ScreenOverride struct {
	// Coord is WHICH requirement node is adapted (the normalised coordinate).
	Coord ScreenCoord `json:"coord"`
	// Styles are the ADR-0010 token overrides, sorted canonically by (property, token). Empty is legal
	// (a label-only override). Every style is validated against the closed catalogue (fail-closed).
	Styles []StyleToken `json:"styles,omitempty"`
	// Label is a per-platform VISUAL display-text override (NOT the i18n data — that is structural).
	Label string `json:"label,omitempty"`
}

// overrideKeyScreen is a stable key for a ScreenOverride (the deterministic tie-break). PURE.
func (o ScreenOverride) overrideKeyScreen() string {
	k := o.Coord.coordKey() + "\x01" + o.Label
	for _, s := range o.Styles {
		k += "\x02" + s.Property + "=" + s.Token
	}
	return k
}

// ScreenDesign is the complete screen requirement for ONE child target: a list of per-coordinate
// overrides. Content-addressed (ID = records.Hash of the canonical body). Append-only (anti-overwrite
// §9): a changed override OR a changed coordinate yields a NEW ID — never an in-place mutation. SOFT
// (not a truth at the strong sense — no version-freeze, no mirror); it lives below the line like a
// procedural memory. ParentID stays the MASTER (the override never bends the canonical requirement).
type ScreenDesign struct {
	// ID is the content address of the whole design (the idempotency key). Empty until capitalised
	// (CapitaliseScreenDesign stamps it); same (target, parent, overrides, validated, by) → same ID.
	ID string `json:"id,omitempty"`
	// ChildTarget is the platform the design applies to (ChildWeb | ChildMobile | ChildDesktop).
	ChildTarget ChildTarget `json:"child_target"`
	// ParentID is the content address of the MASTER (master.Hash()) — the `composes` edge (S18). ALWAYS
	// the master: the design never bends the canonical requirement (it is platform-styling only).
	ParentID string `json:"parent_id"`
	// Overrides are the per-coordinate overrides, sorted canonically by Coord (the determinism contract).
	Overrides []ScreenOverride `json:"overrides"`
	// Validated is true iff a human validation_humaine validated the design (the loopback trigger,
	// fail-closed). CapitaliseScreenDesign sets it; a non-validated design is never capitalised.
	Validated bool `json:"validated"`
	// By records WHO validated/authored the design (provenance §9 — defaults to "human", never empty).
	By string `json:"by"`
}

// CapitalisedScreen is the result of CapitaliseScreenDesign: whether the design was capitalised, the
// content-addressed soft requirement (when capitalised), and the compound.Capture the SAME CE03 loop
// emitted (a procedural recall + a behavior candidate via the wall — NO kernel write). VALUES only.
type CapitalisedScreen struct {
	// Capitalised is true iff the validation validated the design (the loopback fired).
	Capitalised bool `json:"capitalised"`
	// Requirement is the content-addressed, append-only soft requirement (the capitalised design).
	// Zero value when not capitalised — the recompile then applies no override (the child stays base).
	Requirement ScreenDesign `json:"requirement"`
	// Capture is what compound.Compound emitted — a procedural memory write-input + a behavior-candidate
	// idea (via firewall.ViaIdea). WroteKernel is ALWAYS false (the wall, épinglé par le miroir (g)).
	Capture compound.Capture `json:"-"`
}

// GestureNature is the verdict of ClassifyGesture: a gesture is STYLING (below-the-line — re-style an
// existing coordinate) or STRUCTURAL (above-the-line — add/remove/reorder a field/section/action,
// change i18n data, change a source-kind). The set is CLOSED.
type GestureNature string

const (
	// NatureStyling — a pure styling/layout/label gesture over an EXISTING coordinate (below the line):
	// colour/spacing/radius/density/per-platform label tokens. Routes to ScreenDesign DRAFT → capitalise.
	NatureStyling GestureNature = "styling"
	// NatureStructural — an add/remove/reorder of a field/section/action, an i18n-data change, a
	// source-kind change (above the line). Routes to idée→miroir→/goal — NEVER a direct write.
	NatureStructural GestureNature = "structural"
)

// GestureInput is the PURE input ClassifyGesture judges. It is the smallest deterministic surface a
// design gesture carries: the coordinate it targets, the styling stack it proposes, and the explicit
// structural intents it declares (add/remove/reorder/text-data/component). The classifier reads the
// STRUCTURE (the fields), never a model-supplied free-text label (§8 — the code judges, not the LLM).
type GestureInput struct {
	// Coord is the coordinate the gesture targets (the normalised requirement node).
	Coord ScreenCoord `json:"coord"`
	// Styles are the ADR-0010 token overrides the gesture proposes (a pure styling change).
	Styles []StyleToken `json:"styles,omitempty"`
	// Label is a per-platform VISUAL label override (styling). A label is visual text, NOT i18n data.
	Label string `json:"label,omitempty"`
	// AddsField / RemovesField / ReordersFields are STRUCTURAL intents (add/remove/reorder a field or
	// section or action). ANY true → NatureStructural (the gesture changes the requirement shape).
	AddsField      bool `json:"adds_field,omitempty"`
	RemovesField   bool `json:"removes_field,omitempty"`
	ReordersFields bool `json:"reorders_fields,omitempty"`
	// ChangesTextData is true when the gesture changes the i18n DATA (the entity text, the content) —
	// STRUCTURAL (the i18n table is truth, ADR 0011), DISTINCT from a per-platform visual Label.
	ChangesTextData bool `json:"changes_text_data,omitempty"`
	// ChangesComponentKind is true when the gesture changes a SOURCE-KIND (a control kind, an entity
	// shape) — STRUCTURAL (a kernel source, S35/S11), never below the line.
	ChangesComponentKind bool `json:"changes_component_kind,omitempty"`
}

// ClassifyGesture is the PURE, TOTAL classifier that passes EVERY design gesture through the wall: a
// gesture is STRUCTURAL iff it declares any structural intent (add/remove/reorder field, change i18n
// data, change a source-kind) — fail-closed toward STRUCTURAL (a structural intent always wins, so a
// structural gesture can NEVER be smuggled below the line as styling, the §8/BA12 guard). Otherwise it
// is STYLING (a pure re-style of an existing coordinate). Never panics; same gesture ⇒ same nature.
func ClassifyGesture(g GestureInput) GestureNature {
	if g.AddsField || g.RemovesField || g.ReordersFields || g.ChangesTextData || g.ChangesComponentKind {
		return NatureStructural
	}
	return NatureStyling
}

// screenDesignBody is the content-addressed JSONB shape of a screen design (the body the ID hashes
// over). PURE: same (target, parent, overrides, validated, by) → same bytes → same ID. Anti-overwrite
// §9: a changed override OR a changed coordinate yields a new design node, never an in-place mutation.
// The overrides are sorted canonically (by coord key) so input order never leaks into the bytes.
func screenDesignBody(d ScreenDesign) map[string]any {
	overrides := sortedScreenOverrides(d.Overrides)
	return map[string]any{
		"child_target": string(d.ChildTarget),
		"parent_id":    d.ParentID,
		"overrides":    overrides,
		"validated":    d.Validated,
		"by":           d.By,
	}
}

// sortedScreenOverrides returns a canonical-order COPY of the overrides (sorted by coord key, then by
// the full override key for a total tie-break) with each override's styles canonically sorted. PURE —
// never mutates the caller's slice. The single point input order is reconciled (the determinism contract).
func sortedScreenOverrides(in []ScreenOverride) []ScreenOverride {
	out := make([]ScreenOverride, 0, len(in))
	for _, o := range in {
		o.Styles = sortedStyles(o.Styles)
		out = append(out, o)
	}
	sort.SliceStable(out, func(i, j int) bool {
		ki, kj := out[i].Coord.coordKey(), out[j].Coord.coordKey()
		if ki != kj {
			return ki < kj
		}
		return out[i].overrideKeyScreen() < out[j].overrideKeyScreen()
	})
	return out
}

// sortedStyles returns a canonical-order COPY of a style stack (sorted by property, then token). PURE.
func sortedStyles(in []StyleToken) []StyleToken {
	out := append([]StyleToken(nil), in...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Property != out[j].Property {
			return out[i].Property < out[j].Property
		}
		return out[i].Token < out[j].Token
	})
	return out
}

// EmitScreenDesign projects a master + a child target + per-coordinate overrides into a CONTENT-
// ADDRESSED ScreenDesign. PURE, TOTAL. ParentID = m.Hash(). It validates EACH StyleToken against the
// closed ADR-0010 catalogue (a hex / an arbitrary Tailwind utility → BlockReason naming the catalogue)
// AND EACH Coord against the master (the coordinate MUST exist — an absent one is STRUCTURAL, refused
// honestly naming the /goal door). It sorts canonically + content-addresses. A malformed input is a
// typed BlockReason (French how_to_fix), never a partial design.
//
// The ID is stamped HERE (content address of the canonical body) so the design is idempotent: same
// (target, parent, overrides, validated, by) → same ID (the reproducibility mirror (a) pins it).
func EmitScreenDesign(m MasterView, target ChildTarget, overrides []ScreenOverride) (ScreenDesign, *blockreason.BlockReason) {
	if !isKnownChildTarget(target) {
		br := blockScreenDesignUnknownTarget(target)
		return ScreenDesign{}, &br
	}
	// The master must be projectable (a parent to address). An empty/malformed master is refused with
	// the master-shaped reason (the honesty rule — there is no parent to anchor the design to).
	if m.Project == "" || (len(m.Sections) == 0 && len(m.Actions) == 0) {
		br := blockScreenDesignNoMaster()
		return ScreenDesign{}, &br
	}

	for _, o := range overrides {
		// The coordinate MUST exist in the master — an absent coordinate is STRUCTURAL (it would add a
		// node the master does not pin), refused honestly naming the /goal door.
		if !coordExists(m, o.Coord) {
			br := blockScreenDesignStructuralCoord(o.Coord)
			return ScreenDesign{}, &br
		}
		// Each style is validated against the CLOSED catalogue — a hex / arbitrary utility is refused.
		for _, s := range o.Styles {
			if !IsKnownStyleToken(s) {
				br := blockScreenDesignBadToken(s)
				return ScreenDesign{}, &br
			}
		}
	}

	by := "human"
	d := ScreenDesign{
		ChildTarget: target,
		ParentID:    m.Hash(),
		Overrides:   sortedScreenOverrides(overrides),
		Validated:   false,
		By:          by,
	}
	canon, err := records.Canonicalize(mustJSON(screenDesignBody(d)))
	if err != nil {
		br := blockScreenDesignNoMaster()
		br.Explanation = "Émission du ScreenDesign refusée : la sérialisation du corps content-adressé a échoué (" +
			err.Error() + ")."
		return ScreenDesign{}, &br
	}
	d.ID = records.Hash(canon)
	return d, nil
}

// coordExists reports whether a coordinate is PINNED by the master (the determinism + honesty
// frontier). A CoordSection must match a section's entity; a CoordField a section's field (in that
// section); a CoordAction a master action's control. PURE, TOTAL — an unknown kind is never pinned.
func coordExists(m MasterView, c ScreenCoord) bool {
	switch c.Kind {
	case CoordSection:
		for _, sec := range m.Sections {
			if sec.Entity == c.Entity {
				return true
			}
		}
		return false
	case CoordField:
		for _, sec := range m.Sections {
			if sec.Entity != c.Entity {
				continue
			}
			for _, f := range sec.Fields {
				if f == c.Field {
					return true
				}
			}
		}
		return false
	case CoordAction:
		for _, act := range m.Actions {
			if act.Control == c.Control {
				return true
			}
		}
		return false
	default:
		return false
	}
}

// CapitaliseScreenDesign is the LOOPBACK capture (calque EXACT de CapitaliseViewAdaptation): on a
// VALIDATED human validation_humaine over a screen design, it RECORDS the design as a soft, content-
// addressed, append-only requirement AND capitalises its motif through compound.Compound (the SAME
// CE03 loop as the behaviors/procedures — the only door is firewall.ViaIdea, NO kernel write). A
// NON-validated design capitalises NOTHING (Capitalised=false, empty Requirement, empty Capture —
// fail-closed). PURE, TOTAL: same (design, validation) → byte-identical result. WroteKernel ALWAYS
// false (the wall, épinglé par le miroir (g)).
func CapitaliseScreenDesign(d ScreenDesign, v AdaptationValidation) (CapitalisedScreen, error) {
	by := v.By
	if by == "" {
		by = "human"
	}

	if !v.Validated {
		// Fail-closed: a refused (or absent) validation capitalises nothing. The child stays base.
		return CapitalisedScreen{Capitalised: false}, nil
	}

	// Record the soft requirement: stamp Validated + By, canonicalise overrides, content-address the
	// whole body. Same input → same ID (idempotent, append-only — recording it twice yields the same
	// node, not an edit).
	req := d
	req.Validated = true
	req.By = by
	req.Overrides = sortedScreenOverrides(d.Overrides)
	canon, err := records.Canonicalize(mustJSON(screenDesignBody(req)))
	if err != nil {
		return CapitalisedScreen{}, fmt.Errorf("capitalise screen design: address body: %w", err)
	}
	req.ID = records.Hash(canon)

	// Capitalise the motif through the EXISTING CE03 loop (compound.Compound) — the SAME boundary the
	// behaviors/procedures cross. The gesture motif is the design loopback (a procedural recall); the
	// spec motif is the captured design-as-soft-requirement (a behavior candidate via the wall).
	cap, err := compound.Compound(compound.GoalClose{
		GoalID:         "screen-design:" + req.ID,
		Branch:         "main",
		Green:          true,
		GesturePattern: screenGesturePattern(req),
		SpecPattern:    screenSpecPattern(req),
	})
	if err != nil {
		return CapitalisedScreen{}, fmt.Errorf("capitalise screen design: compound capture: %w", err)
	}

	return CapitalisedScreen{
		Capitalised: true,
		Requirement: req,
		Capture:     cap,
	}, nil
}

// screenGesturePattern renders the loopback GESTURE motif (the procedural recall) for the validated
// design — the ordered units a recompile of a similar child replays instead of re-deriving. Deterministic.
func screenGesturePattern(d ScreenDesign) []string {
	return []string{
		"observe_validated_screen_design:" + string(d.ChildTarget),
		"capture_per_coordinate_style_override",
		"content_address_soft_requirement",
		"reproduce_screen_with_capitalised",
	}
}

// screenSpecPattern renders the loopback SPEC motif (the behavior candidate proposed via the wall) —
// the captured design as a reusable soft-requirement shape. Deterministic.
func screenSpecPattern(d ScreenDesign) []string {
	return []string{
		"per_coordinate_screen_design:" + string(d.ChildTarget),
		"reproduce_validated_style_tokens",
	}
}

// ReproduceScreen RECOMPILES a child from the master, APPLYING the capitalised screen designs for that
// child target (the loopback's reproduction). PURE, TOTAL, byte-stable: same (master, target,
// capitalised) → byte-identical child. It folds the matching designs (target ∧ ParentID==m.Hash() ∧
// Validated), sorts by ID, last wins per coordinate, replies the resolved overrides into
// AdaptationOverride.Screen, then calls EmitWeb/Mobile/DesktopChildAdapted — reusing the emitters,
// never re-deriving the form. An empty/non-matching corpus yields the byte-identical BASE child
// (anti-overwrite §9 — the property mirror (c) pins it).
func ReproduceScreen(m MasterView, target ChildTarget, capitalised []ScreenDesign) (ChildView, *blockreason.BlockReason) {
	if !isKnownChildTarget(target) {
		br := blockScreenDesignUnknownTarget(target)
		return ChildView{}, &br
	}

	resolved := resolveScreenOverrides(m, target, capitalised)
	adapt := AdaptationOverride{}
	if len(resolved) > 0 {
		// The documented additive field carries the FIRST resolved override (the front twin mirrors a
		// single ScreenOverride per AdaptationOverride); the full resolved set rides the unexported
		// carrier so a multi-coordinate design reproduces every coordinate (byte-stable). Screen==nil
		// (no resolved override) keeps the base form byte-identical.
		first := resolved[0]
		adapt.Screen = &first
		adapt.screenAll = resolved
	}

	switch target {
	case ChildWeb:
		// The web child re-emits from a spec reconstructed from the master's sections (the actions are
		// not reconstructable into control ASTs — the documented loopback-web limitation, ADR 0071
		// OpenQuestion). The ParentID is the ORIGINAL master m.Hash() (the authoritative `composes`
		// edge) — the reconstructed spec is only a render vehicle, never the parent of record.
		child, br := EmitWebChildAdapted(masterWebSpec(m), adapt)
		if br != nil {
			return ChildView{}, br
		}
		return ChildView{Target: ChildWeb, ParentID: m.Hash(), MasterHash: m.Hash(), Artifacts: child.Artifacts}, nil
	case ChildMobile:
		child, br := EmitMobileChildAdapted(m, MobileAdaptation{Screen: adapt.Screen, screenAll: adapt.screenAll})
		if br != nil {
			return ChildView{}, br
		}
		return ChildView{Target: ChildMobile, ParentID: child.ParentID, MasterHash: child.MasterHash, Artifacts: child.Artifacts}, nil
	case ChildDesktop:
		child, br := EmitDesktopChildAdapted(m, DesktopAdaptation{Screen: adapt.Screen, screenAll: adapt.screenAll})
		if br != nil {
			return ChildView{}, br
		}
		return ChildView{Target: ChildDesktop, ParentID: child.ParentID, MasterHash: child.MasterHash, Artifacts: child.Artifacts}, nil
	default:
		br := blockScreenDesignUnknownTarget(target)
		return ChildView{}, &br
	}
}

// resolveScreenOverrides folds the capitalised designs into the resolved per-coordinate overrides for
// the target — a PURE fold. Only designs that (1) target this child, (2) are parented to THIS master
// (ParentID == m.Hash()), and (3) are Validated are applied; the rest are ignored (the provenance
// frontier). Designs are processed in content-address (ID) order; per coordinate, the LAST matching
// override wins (append-only supersession). The result is canonically sorted (byte-stable). An empty
// corpus yields nil (the canonical base form).
func resolveScreenOverrides(m MasterView, target ChildTarget, capitalised []ScreenDesign) []ScreenOverride {
	parent := m.Hash()
	matching := make([]ScreenDesign, 0, len(capitalised))
	for _, d := range capitalised {
		if d.ChildTarget == target && d.ParentID == parent && d.Validated {
			matching = append(matching, d)
		}
	}
	sort.SliceStable(matching, func(i, j int) bool { return matching[i].ID < matching[j].ID })

	// Last override per coordinate wins (append-only supersession across designs).
	byCoord := make(map[string]ScreenOverride)
	for _, d := range matching {
		for _, o := range d.Overrides {
			// Skip an override whose coordinate is no longer pinned by the master (defensive: a stale
			// design over a removed coordinate never leaks into the bytes).
			if !coordExists(m, o.Coord) {
				continue
			}
			byCoord[o.Coord.coordKey()] = o
		}
	}
	out := make([]ScreenOverride, 0, len(byCoord))
	for _, o := range byCoord {
		out = append(out, o)
	}
	return sortedScreenOverrides(out)
}

// masterWebSpec reconstructs a DETERMINISTIC WebAppSpec from the master's sections so the web
// reproduction path (ReproduceScreen → EmitWebChildAdapted) is byte-stable (the property mirror (b)
// pins it). The master is the projection of (entities ⊕ controls); the entities are reconstructable
// from the sections (name + fields, all string-typed — a valid, projectable entity). The master's
// ACTIONS are NOT reconstructable into full control/action ASTs (the Expr is canonicalised-to-string,
// the control kind is lost) — so the reconstructed web spec carries the entities only (the documented
// loopback-web limitation, ADR 0071 OpenQuestion). The styling overrides are applied at RENDER time
// from AdaptationOverride.Screen (not from the spec). PURE, TOTAL: same master → same spec → same bytes.
func masterWebSpec(m MasterView) WebAppSpec {
	ents := make([]entities.Entity, 0, len(m.Sections))
	for _, sec := range m.Sections {
		attrs := make([]entities.Attribute, 0, len(sec.Fields))
		for _, f := range sec.Fields {
			attrs = append(attrs, entities.Attribute{Name: f, Type: entities.TypeString, Required: true})
		}
		ents = append(ents, entities.Entity{Name: sec.Entity, Attributes: attrs})
	}
	return WebAppSpec{Project: m.Project, Entities: ents, Invariants: m.Invariants}
}

// isKnownChildTarget reports whether target is a member of the closed {web, mobile, desktop} enum.
func isKnownChildTarget(target ChildTarget) bool {
	switch target {
	case ChildWeb, ChildMobile, ChildDesktop:
		return true
	default:
		return false
	}
}

// blockScreenDesignBadToken is the honest refusal for a StyleToken outside the closed ADR-0010
// catalogue (a hex, an arbitrary Tailwind utility, a typo). No prison: the how_to_fix names the catalogue.
func blockScreenDesignBadToken(s StyleToken) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Override de style refusé : le token (" + s.Property + "=" + s.Token + ") est HORS du catalogue " +
			"FERMÉ ADR 0010 (zinc + blue-600 : bg/text/border/radius/pad/gap/align × card/foreground/primary/border/" +
			"muted/sm/md/lg…). Le Design Lab n'accepte JAMAIS un hex ni une utilitaire Tailwind arbitraire (fail-closed, " +
			"déterminisme-first §6) — sinon le style fuirait hors du design system.",
		HowToFix: []string{
			"use_a_catalogue_token : choisissez une property du catalogue (bg|text|border|radius|pad|gap|align) et un token déclaré (card|foreground|primary|…|sm|md|lg).",
			"no_hex_no_arbitrary : un hex (#aabbcc) ou une classe Tailwind libre (text-[13px]) est refusé — le thème ADR 0010 est la seule source.",
			"extend_the_catalogue : pour un nouveau token, étendez le catalogue ADR 0010 above-the-line (idée → miroir → /goal → approbation), jamais en passant.",
		},
	}
}

// blockScreenDesignStructuralCoord is the honest refusal for a coordinate ABSENT from the master — a
// STRUCTURAL gesture (it would add/touch a node the master does not pin). It names the /goal door (the
// wall §2): a structural change is idée→miroir→/goal, never a direct ScreenDesign write. No prison.
func blockScreenDesignStructuralCoord(c ScreenCoord) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Override d'écran refusé : la coordonnée (" + string(c.Kind) + " · " + c.Entity +
			coordSuffix(c) + ") n'existe PAS dans la vue MAÎTRE. Adapter une coordonnée absente serait un geste " +
			"STRUCTUREL (ajouter/retirer/réordonner un champ/section/action) — au-dessus de la ligne (le mur §2). " +
			"Le Design Lab ne re-style QUE des nœuds qui existent déjà ; il n'invente jamais une coordonnée (honnêteté §8).",
		HowToFix: []string{
			"target_an_existing_coordinate : ciblez une section/champ/action que la maître pin déjà (EmitMasterView).",
			"open_a_goal : pour AJOUTER/RETIRER/RÉORDONNER un champ/section/action, ouvrez une idée → miroir → /goal (jamais un write direct).",
			"capture_the_idea : depuis l'écran, send(« capture l'idée : <besoin structurel> ») — la porte structurelle.",
		},
	}
}

// coordSuffix renders the field/control suffix of a coordinate (for the refusal message). PURE.
func coordSuffix(c ScreenCoord) string {
	if c.Field != "" {
		return " · " + c.Field
	}
	if c.Control != "" {
		return " · " + c.Control
	}
	return ""
}

// blockScreenDesignNoMaster is the honest refusal when the master is empty/non-projectable (no parent
// to anchor the design to). No prison.
func blockScreenDesignNoMaster() blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission du ScreenDesign refusée : la vue MAÎTRE est vide ou sans projet — il n'y a aucun parent " +
			"à adresser (ParentID == master.Hash()). Un ScreenDesign étend la voie ViewAdaptation : il a TOUJOURS besoin " +
			"d'une maître projetable (≥1 section et/ou ≥1 action).",
		HowToFix: []string{
			"emit_the_master_first : dérivez la maître via EmitMasterView(spec) depuis un arbre projetable (≥1 entité S35 et/ou ≥1 control→action S11).",
			"complete_the_source : chaque entité porte un nom + des attributs ; chaque control un nom + un bind d'action.",
		},
	}
}

// blockScreenDesignUnknownTarget is the honest refusal for an unknown child target (the closed enum is
// web / mobile / desktop — nothing invented). No prison.
func blockScreenDesignUnknownTarget(target ChildTarget) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "ScreenDesign refusé : la cible enfant " + string(target) + " est inconnue. L'ensemble est CLOS " +
			"(web / mobile / desktop) — le Design Lab n'invente aucune plateforme (honnêteté, le mur §8).",
		HowToFix: []string{
			"use_a_known_child : ciblez ChildWeb, ChildMobile ou ChildDesktop.",
		},
	}
}
