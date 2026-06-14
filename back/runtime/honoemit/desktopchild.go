package honoemit

// desktopchild.go — LE DESKTOP CHILD (Electron) : le TROISIÈME enfant distinct de la vue MAÎTRE.
//
// Modèle (utilisatrice, gravé 2026-06-14) : PAS « une vue → N clones ». Une VUE MAÎTRE (le
// requirement canonique, plateforme-agnostique, content-adressée) = le PARENT ; trois enfants
// DISTINCTS (web React / mobile Expo / desktop Electron) en dérivent, chacun ADAPTANT sa
// plateforme. Le web child (EmitWebChild) et le mobile child (EmitMobileChild) portent déjà le
// parentId de la maître ; le desktop child ICI porte le MÊME parentId (master.Hash()) — l'arête
// `composes` (S18) parent → enfant de l'arbre fractal (ADR 0055). Un parent, trois enfants.
//
// L'IDIOME DESKTOP, DISTINCT (le point central) : le desktop child n'est PAS la vue web emballée.
// C'est une VRAIE app Electron avec SA PROPRE vue desktop :
//
//   - main.js      : le main process — BrowserWindow, le cycle de vie app.whenReady, le MENU
//                    applicatif (Menu.buildFromTemplate) et les RACCOURCIS clavier (accelerator),
//                    un item de menu par Action de la maître ;
//   - preload.js   : le pont sécurisé (contextBridge) qui expose l'API à fetch/POST au renderer ;
//   - renderer.tsx : la VUE DESKTOP — des PANNEAUX multi-colonnes denses (grid-cols), un panneau
//                    par Section (tableau dense, une colonne par champ en ordre source, fetch GET
//                    /entities/<e>), une barre d'actions, un bouton par Action (POST /<operation>),
//                    l'Expr évaluée client par le twin embarqué ;
//   - index.html   : le shell HTML du renderer (#root, tokens ADR 0010) ;
//   - package.json : les deps épinglées (electron) + "main": "main.js" + le script start ;
//   - aidos-expr.ts: le twin Expr embarqué (le MÊME catalogue gelé que web/mobile — copié verbatim,
//                    jamais re-implémenté).
//
// DÉTERMINISME-FIRST / LE MUR (§2/§6/§8) : EmitDesktopChild est une FONCTION PURE, byte-stable de
// la MAÎTRE (mêmes sections/actions/invariants → MÊMES octets, ordre canonique, "\n" newlines,
// aucune horloge/RNG/chemin absolu). La projection N'ÉCRIT AUCUNE VÉRITÉ (below-the-line,
// gen/<project>/desktop/…, §9). Une maître vide est un BlockReason typé, jamais un render partiel.
//
// POINT D'ADAPTATION per-plateforme (capitalisable, loopback back/runtime/compound) : le desktop
// child porte un DesktopAdaptation (l'override desktop — p.ex. le titre de fenêtre). L'adaptation
// CHANGE ses octets mais JAMAIS le parentId (la maître reste la même) ; une adaptation validée se
// capitalise contre l'arbre `compose`.
//
// RÉUTILISE, NE RÉINVENTE PAS (ADR 0007) : la maître (EmitMasterView) porte déjà sections + actions
// (la logique métier, dérivée de S35/S11) ; le desktop child ne RE-DÉRIVE aucune règle — il ADAPTE
// la forme à la plateforme. Le twin Expr est le verbatim front (la SEULE source de l'évaluateur).

import (
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// TargetDesktopApp — the emitted app's Electron DESKTOP VIEW (the third distinct child). Lands
// under gen/<project>/desktop/. The set of honoemit targets grows additively; this is the one the
// desktop child emitter adds (the web child is TargetWebApp, the mobile child TargetMobileApp).
const TargetDesktopApp = "desktop-app"

// Pinned Electron dependency versions the desktop app ships. Pinned (no resolver, no clock) so the
// emitted package.json is byte-stable + content-addressed. Electron 31 (the current May-2026 stable
// line), React 19 (the SAME React the web/mobile children run, so the renderer reuses the family).
const (
	electronVersion        = "^31.0.0"
	electronBuilderVersion = "^25.0.0"
)

// DesktopAdaptation is the PER-PLATFORM override point a validated desktop adaptation capitalises
// into (the loopback, back/runtime/compound). It is the desktop child's adaptable surface: an
// override CHANGES the child's bytes but NEVER its parentId (the master is unchanged — the
// adaptation is platform-specific, not a new requirement). The zero value is "no override" (the
// default desktop form, derived purely from the master). Held minimal on purpose; a real loopback
// grows this with the desktop affordances a validated adaptation pins (window chrome, shortcuts…).
type DesktopAdaptation struct {
	// WindowTitle overrides the BrowserWindow title (the default is the project name). A non-empty
	// value is applied in main.js — the visible proof the per-platform adaptation point is live.
	WindowTitle string `json:"window_title,omitempty"`
}

// DesktopChild is the DESKTOP CHILD of the master view: the Electron artifacts (the desktop idiom —
// panels/menu/shortcuts, NOT the web view wrapped) PLUS the derivation metadata that ties them to
// the master. The ParentID is the content address of the master the child derives from (the
// `composes` edge, S18) — the SAME parentId the web + mobile children carry (one parent, three
// distinct children). The Adaptation is the per-platform override point (capitalisable).
type DesktopChild struct {
	// Target is always ChildDesktop for this emitter (the desktop idiom). Carried so the three
	// siblings share one shape (a child knows which platform it adapts).
	Target ChildTarget `json:"target"`
	// ParentID is the content address of the MASTER this child derives from (master.Hash()) — the
	// `composes` parent edge (S18). The web + mobile siblings carry the SAME ParentID.
	ParentID string `json:"parent_id"`
	// MasterHash is an alias of ParentID kept explicit for the call sites that read "the master
	// hash" (the family signature). Always == ParentID.
	MasterHash string `json:"master_hash"`
	// Adaptation is the per-platform override applied to this child (the capitalisable loopback
	// point). The zero value is the default desktop form (a pure projection of the master).
	Adaptation DesktopAdaptation `json:"adaptation"`
	// Artifacts are the emitted Electron files (the desktop idiom), path-sorted + content-addressed.
	Artifacts []Artifact `json:"artifacts"`
}

// EmitDesktopChild derives the DESKTOP CHILD from the master view — the third distinct child. It is
// a FUNCTION PURE, byte-stable of the master: an Electron app (main.js + preload.js + package.json +
// renderer.tsx + index.html + the Expr twin) whose renderer is a TRUE desktop view (panels/menu/
// shortcuts), each Section a dense panel, each Action a menu item + a button (POST /<operation>),
// fetching GET /entities/<e>, evaluating the Expr client-side. It carries the EMPTY DesktopAdaptation
// (the default form) and ties the artifacts to the master by its content address (ParentID). An
// empty/malformed master is a typed BlockReason (the honesty rule), never a partial child.
//
// The task contract: EmitDesktopChild(master MasterView) → the desktop artifacts + the parent link.
// It DERIVES from the SAME master the web/mobile children do — the wall + anti-overwrite §9 hold (it
// writes no truth; the desktop form is a runtime projection under gen/<project>/desktop/).
func EmitDesktopChild(m MasterView) (DesktopChild, *blockreason.BlockReason) {
	return EmitDesktopChildAdapted(m, DesktopAdaptation{})
}

// EmitDesktopChildAdapted is EmitDesktopChild with an explicit per-platform adaptation override (the
// capitalisable loopback point). The adaptation changes the emitted bytes (e.g. the window title) but
// NOT the parentId — the master is unchanged, the adaptation is platform-specific. The artifacts stay
// byte-stable for a given (master, adaptation) pair (the determinism contract).
func EmitDesktopChildAdapted(m MasterView, adapt DesktopAdaptation) (DesktopChild, *blockreason.BlockReason) {
	if br := validateMaster(m); br != nil {
		return DesktopChild{}, br
	}

	// The parent address — the master's own content hash (the `composes` edge each child pins). The
	// SAME address EmitWebChild/EmitMobileChild compute, so the three children share one parent.
	parentID := m.Hash()

	// The form's source hash content-addresses the artifacts. It folds BOTH the master address (the
	// parent the form derives from) AND the adaptation (the per-platform override), so an adaptation
	// yields new bytes + a new source hash, but the SAME parentId.
	sourceHash := desktopFormHash(m, adapt)

	dir := "gen/" + m.Project + "/desktop/"
	arts := []Artifact{
		artifact(dir+"main.js", TargetDesktopApp, emitDesktopMain(m, adapt, sourceHash), sourceHash),
		artifact(dir+"preload.js", TargetDesktopApp, emitDesktopPreload(sourceHash), sourceHash),
		artifact(dir+"index.html", TargetDesktopApp, emitDesktopIndexHTML(m, sourceHash), sourceHash),
		artifact(dir+"renderer.tsx", TargetDesktopApp, emitDesktopRenderer(m, sourceHash), sourceHash),
		artifact(dir+"package.json", TargetDesktopApp, emitDesktopPackageJSON(m, sourceHash), sourceHash),
		artifact(dir+"aidos-expr.ts", TargetDesktopApp, []byte(exprTwinSource), sourceHash),
	}
	sortArtifacts(arts)

	return DesktopChild{
		Target:     ChildDesktop,
		ParentID:   parentID,
		MasterHash: parentID,
		Adaptation: adapt,
		Artifacts:  arts,
	}, nil
}

// validateMaster checks the master is projectable into a desktop view: a project namespace + at
// least one section OR one action (an empty master derives nothing). It invents nothing — an empty
// master is a cause, never a default form.
func validateMaster(m MasterView) *blockreason.BlockReason {
	if m.Project == "" {
		br := blockDesktop(ErrNoProject)
		return &br
	}
	if len(m.Sections) == 0 && len(m.Actions) == 0 {
		br := blockDesktop(ErrEmptyApp)
		return &br
	}
	return nil
}

// desktopFormBody re-serialises the (master, adaptation) into a canonical, key-sorted JSON body so
// the form's SourceHash is a content address: same master + same adaptation → same bytes. It folds
// the master's own content address (the parent) so the form is anchored to the master it derives
// from, plus the adaptation (the per-platform override) so an override yields a distinct form hash.
func desktopFormBody(m MasterView, adapt DesktopAdaptation) ([]byte, error) {
	body := map[string]any{
		"target":     string(ChildDesktop),
		"parent":     m.Hash(),
		"adaptation": adapt,
	}
	return records.Canonicalize(mustJSON(body))
}

// desktopFormHash is the content address of the desktop FORM (the SourceHash every artifact carries).
// Distinct from the parentId (the master address): the form hash folds the adaptation, so a per-
// platform override changes the form hash while the parentId stays the master's. A serialisation
// failure (impossible for a well-formed value) hashes the empty body (never silently equal).
func desktopFormHash(m MasterView, adapt DesktopAdaptation) string {
	body, err := desktopFormBody(m, adapt)
	if err != nil {
		return records.Hash([]byte("{}"))
	}
	return records.Hash(body)
}

// blockDesktop renders the canonical S13 BlockReason for a non-projectable desktop master. It carries
// a non-empty French how_to_fix (no prison) and names the DESKTOP child source so the panel + `aidos
// explain` distinguish "the desktop child refused" from the web/mobile/master refusals.
func blockDesktop(cause error) blockreason.BlockReason {
	return blockreason.BlockReason{
		Code:     blockreason.CodeOutOfScope,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Émission du DESKTOP CHILD (Electron) refusée : la vue MAÎTRE est vide ou sans projet (" +
			cause.Error() + "). Le desktop child est un ENFANT DISTINCT dérivé de la maître — il n'invente ni un " +
			"panneau, ni une action, ni un raccourci (honnêteté, le mur §8). Une maître sans section ni action ne " +
			"dérive aucune vue desktop.",
		HowToFix: []string{
			"emit_the_master : émettez d'abord la vue MAÎTRE (EmitMasterView) depuis un arbre projetable (≥1 entité S35 et/ou ≥1 control→action S11).",
			"complete_the_master : la maître doit porter ≥1 section (une entité) OU ≥1 action (un control→action) — un projet est requis.",
			"rerun aidos project --desktop : relancez l'émission du desktop child une fois la maître non vide.",
		},
	}
}

// desktopPanelTitle is the panel header for a section (the entity name). Kept trivial + total so the
// renderer never invents a label the master does not pin.
func desktopPanelTitle(sec MasterSection) string { return sec.Entity }

// desktopEntityRoute is the live read route a panel fetches (GET /entities/<lowercased entity>) — the
// SAME route EmitServer serves and the web/mobile children fetch (no route the master does not pin).
func desktopEntityRoute(sec MasterSection) string {
	return "/entities/" + strings.ToLower(sec.Entity)
}
