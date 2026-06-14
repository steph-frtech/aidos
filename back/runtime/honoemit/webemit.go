package honoemit

// webemit.go — L'ÉMETTEUR DE LA VUE REACT (la vue DÉRIVÉE de l'arbre de requirements).
//
// Intention (utilisatrice, gravée 2026-06-14) : « une VUE n'est pas inventée, elle est
// DÉRIVÉE de l'arbre. Un requirement de vue = (quelles ENTITÉS elle montre S35) + (quelles
// OPERATIONS elle déclenche, via des CONTROLS→ACTIONS S11) + (quels INVARIANTS la gatent,
// visible_when/enabled_when = Expr S08). La FORME = le design system hérité (tokens ADR
// 0010). L'émetteur compile ça DÉTERMINISTIQUEMENT. » L'app-builder émet DÉJÀ le SERVEUR
// (honoemit, ADR 0040) ; il manquait la VUE — l'UI React servie par l'app, qui LISTE les
// entités et DÉCLENCHE les operations (POST /<operation>) contre l'API Hono déjà LIVE.
//
// EmitWebApp(spec) → []Artifact byte-stables sous gen/<project>/web/ :
//
//   - aidos-expr.ts        : LE TWIN DE L'ÉVALUATEUR EXPR embarqué (back/kernel/expr, le
//                            catalogue gelé >, length, &&, !) — le MÊME que front/web/lib/
//                            aidos-expr.ts, copié verbatim, jamais re-implémenté. Le bouton
//                            évalue visible_when/enabled_when CÔTÉ CLIENT avec lui (S38) ;
//   - <Entity>List.tsx     : UNE vue LISTE par entité — un tableau dont les COLONNES sont
//                            les attributs de l'entité EN ORDRE SOURCE (la projection de
//                            l'AST entité, S35) ; les lignes sont fetchées GET /entities/<e> ;
//   - <Control>.tsx        : UN bouton par control→action — RÉUTILISE webcomponent.Emit (S38)
//                            VERBATIM (jamais reforké ni redesigné), seul l'import du twin
//                            est réécrit en chemin relatif (l'app embarque le twin localement) ;
//   - app.tsx              : compose les vues liste + les boutons, câble onInvoke → POST
//                            /<operation> contre l'API Hono LIVE (la vue DÉCLENCHE l'op) ;
//   - main.tsx             : le point de montage React (createRoot) ;
//   - index.html           : le shell HTML (tokens ADR 0010, charge main.tsx via Vite) ;
//   - package.json         : les deps épinglées (react + react-dom + vite) ;
//   - vite.config.ts       : le build statique (vite build → dist/, servable par le Hono) ;
//   - Dockerfile           : l'image qui build l'app et expose dist/ (assemblage statique).
//
// DÉTERMINISME-FIRST / LE MUR (§2/§6/§8). EmitWebApp est une FONCTION PURE, TOTALE, byte-stable
// de (entities ⊕ controls/actions) — aucune horloge, aucun RNG, aucune fuite d'ordre de map,
// aucun chemin absolu ; ordre canonique (entités/boutons triés par nom), versions épinglées,
// "\n" newlines (le miroir de reproductibilité, webemit_property_test.go, le scelle). L'UI
// est une FONCTION PURE des controls/actions/entités : jamais un LLM, jamais du hand-design ;
// la forme vient des tokens ADR 0010. La projection N'ÉCRIT AUCUNE VÉRITÉ (below-the-line,
// gen/<project>/web/…, anti-overwrite §9). Un spec malformé est un BlockReason typé (la forme
// S13), jamais un render partiel — exactement comme EmitServer.
//
// RÉUTILISE, NE RÉINVENTE PAS (ADR 0007). Le bouton est webcomponent.Emit (S38) verbatim ; la
// liste est la projection de l'entité (entities.AttributeSet, S35) ; le twin Expr est copié
// depuis front/web/lib/aidos-expr.ts (la SEULE source du twin). L'émetteur ne re-render aucune
// règle métier — visible_when/enabled_when restent les ASTs Expr du control, évalués par le twin.

import (
	"fmt"
	"sort"
	"strings"

	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators/webcomponent"
)

// TargetWebApp — the emitted app's React WEB VIEW (the view derived from the tree). Lands
// under gen/<project>/web/. The set of honoemit targets grows additively; this is the one
// the view emitter adds (no target beyond it here).
const TargetWebApp = "web-app"

// Pinned dependency versions the web app ships. Pinned (no resolver, no clock) so the emitted
// package.json is byte-stable + content-addressed. React 19 + Vite 6 (the current May-2026
// stable React toolchain; the Workbench itself is Next/React 19).
const (
	reactVersion       = "^19.1.0"
	reactDOMVersion    = "^19.1.0"
	viteVersion        = "^6.3.0"
	viteReactVersion   = "^4.4.0"
	vitePluginReactPkg = "@vitejs/plugin-react"
)

// ControlAction is one control→action pair the view derives a BUTTON from (S11): the control
// (the button-as-a-source: view + label + visible_when + enabled_when + triggers) bound to its
// action (on:click(control) + invoke:operation). The emitter projects it via webcomponent.Emit
// (S38), never re-rendering it by hand.
type ControlAction struct {
	Control control.Control
	Action  action.Action
}

// WebAppSpec is the web-view emitter's input — the slice of the requirements tree the view is
// DERIVED from: the project namespace + the ENTITIES it lists (S35) + the control→action pairs
// it triggers (S11) + the declared INVARIANTS that gate it (∀, KRD §8). The emitter authors no
// entity/control/action/invariant (the wall, SELECT-only); it reads the cut and renders exactly
// what it pins. The master view (EmitMasterView) reads the SAME spec — the children all derive
// from this one cut, so the spec is the single source the whole family projects from.
type WebAppSpec struct {
	Project  string
	Entities []entities.Entity
	Buttons  []ControlAction
	// Invariants are the DECLARED ∀ that gate the view (KRD §8). They flow into the MASTER view
	// (EmitMasterView) — the canonical, platform-agnostic node every child constrains itself by.
	// They do NOT change the WEB child's bytes (EmitWebApp stays byte-identical, anti-overwrite
	// §9): the web child's form was already frozen on shopapp; invariants live in the master, not
	// in the emitted web React. Optional — empty when the source pins none (never invented).
	Invariants []string
}

// EmitWebApp renders the React web view for the project, byte-stable under gen/<project>/web/:
// the Expr twin, one list view per entity, one button per control→action (S38 reused), the app
// composition (lists + buttons wired to POST /<operation>), the React mount, the HTML shell, and
// the buildable Vite scaffold (package.json + vite.config.ts + Dockerfile). The artifacts come
// back in a FIXED, path-sorted order so the slice is byte-stable. A malformed spec is a typed
// BlockReason (the honesty rule), never a partial render.
func EmitWebApp(s WebAppSpec) ([]Artifact, *blockreason.BlockReason) {
	if br := validateWebApp(s); br != nil {
		return nil, br
	}
	sourceHash, err := webAppSourceHash(s)
	if err != nil {
		br := blockWebApp(err)
		return nil, &br
	}

	// Canonical order: entities and buttons sorted by name so input order never leaks into the
	// bytes (the determinism contract). Pure copies — the caller's slices are never mutated.
	ents := sortedEntities(s.Entities)
	btns := sortedButtons(s.Buttons)

	dir := "gen/" + s.Project + "/web/"
	arts := []Artifact{
		artifact(dir+"aidos-expr.ts", TargetWebApp, []byte(exprTwinSource), sourceHash),
		artifact(dir+"index.html", TargetWebApp, emitIndexHTML(s, sourceHash), sourceHash),
		artifact(dir+"main.tsx", TargetWebApp, emitMainTSX(sourceHash), sourceHash),
		artifact(dir+"package.json", TargetWebApp, emitWebPackageJSON(s, sourceHash), sourceHash),
		artifact(dir+"vite.config.ts", TargetWebApp, emitViteConfig(sourceHash), sourceHash),
		artifact(dir+"Dockerfile", TargetWebApp, emitWebDockerfile(sourceHash), sourceHash),
	}

	// One LIST view per entity (columns = attributes in source order).
	for _, e := range ents {
		arts = append(arts, artifact(dir+listComponentName(e)+".tsx", TargetWebApp, emitListView(e, sourceHash), sourceHash))
	}

	// One BUTTON per control→action — webcomponent.Emit (S38) reused verbatim, import rewritten.
	for _, ca := range btns {
		art, br := emitButton(ca, dir)
		if br != nil {
			return nil, br
		}
		arts = append(arts, art)
	}

	// The app composition (lists + buttons, wired to POST /<operation>) — emitted LAST because
	// it imports every list + button name (the canonical order owns its import block).
	arts = append(arts, artifact(dir+"app.tsx", TargetWebApp, emitAppTSX(ents, btns, sourceHash), sourceHash))

	sortArtifacts(arts)
	return arts, nil
}

// validateWebApp checks the spec is projectable: a project namespace, at least one entity OR
// one button (an empty app derives nothing), and every entity/control/action well-formed. It
// invents nothing — an unpinned name is a cause, never a default.
func validateWebApp(s WebAppSpec) *blockreason.BlockReason {
	if s.Project == "" {
		br := blockWebApp(ErrNoProject)
		return &br
	}
	if len(s.Entities) == 0 && len(s.Buttons) == 0 {
		br := blockWebApp(ErrEmptyApp)
		return &br
	}
	for _, e := range s.Entities {
		if err := entities.Validate(e); err != nil {
			br := blockWebApp(fmt.Errorf("entity: %w", err))
			return &br
		}
	}
	for _, ca := range s.Buttons {
		// The control+action bind is checked by S38's validateBind (the only place the two
		// prior truths are checked to agree) — reused here so the rule never drifts. We surface
		// a minimal pre-check for the empty-name case so the refusal is web-shaped + actionable.
		if ca.Control.Name == "" {
			br := blockWebApp(fmt.Errorf("control: %w", control.ErrMissingView))
			return &br
		}
	}
	return nil
}

// webAppSourceBody re-serialises the spec into a canonical, key-sorted JSON body so the
// SourceHash is a content address: same tree cut (modulo input order) → same hash. It walks the
// CANONICAL entity/button order (sorted by name) so input order never leaks; the button hash is
// S38's content address (control ⊕ action), reused not forked.
func webAppSourceBody(s WebAppSpec) ([]byte, error) {
	type entView struct {
		Name string   `json:"name"`
		Cols []string `json:"cols"`
	}
	type btnView struct {
		Control string `json:"control"`
		Hash    string `json:"hash"`
	}
	ents := make([]entView, 0, len(s.Entities))
	for _, e := range sortedEntities(s.Entities) {
		ents = append(ents, entView{Name: e.Name, Cols: entities.AttributeSet(e)})
	}
	btns := make([]btnView, 0, len(s.Buttons))
	for _, ca := range sortedButtons(s.Buttons) {
		h, br := webcomponent.SourceHash(ca.Control, ca.Action)
		if br != nil {
			return nil, fmt.Errorf("button %q: %s", ca.Control.Name, br.Explanation)
		}
		btns = append(btns, btnView{Control: ca.Control.Name, Hash: h})
	}
	body := map[string]any{"project": s.Project, "entities": ents, "buttons": btns}
	return records.Canonicalize(mustJSON(body))
}

// WebAppSourceHash is the content address of a web-app spec (the SourceHash every artifact
// carries). Any byte change (a new entity, a new column, a new button) yields a new hash.
func WebAppSourceHash(s WebAppSpec) (string, error) {
	body, err := webAppSourceBody(s)
	if err != nil {
		return "", err
	}
	return records.Hash(body), nil
}

func webAppSourceHash(s WebAppSpec) (string, error) { return WebAppSourceHash(s) }

// sortedEntities / sortedButtons return canonical-name-ordered COPIES (never mutating the
// caller's slice) so input order never leaks into the bytes.
func sortedEntities(in []entities.Entity) []entities.Entity {
	out := append([]entities.Entity(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

func sortedButtons(in []ControlAction) []ControlAction {
	out := append([]ControlAction(nil), in...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Control.Name < out[j].Control.Name })
	return out
}

// emitButton projects a control→action to a button by REUSING webcomponent.Emit (S38) verbatim,
// then rewriting ONLY the aidos-expr import to a relative path (the app bundles the twin locally)
// and re-pathing the artifact under gen/<project>/web/. The button's source_hash is S38's content
// address (control ⊕ action), reused not forked — so the wall + determinism are inherited.
func emitButton(ca ControlAction, dir string) (Artifact, *blockreason.BlockReason) {
	s38, br := webcomponent.Emit(ca.Control, ca.Action, webcomponent.TargetTSNext)
	if br != nil {
		// Re-shape S38's refusal into the web-shaped BlockReason so the panel names the web target.
		web := blockWebApp(fmt.Errorf("button %q: %s", ca.Control.Name, br.Explanation))
		return Artifact{}, &web
	}
	out := []byte(rewriteExprImport(string(s38.Bytes)))
	name := buttonComponentName(ca.Control)
	return Artifact{
		Path:       dir + name + ".tsx",
		Target:     TargetWebApp,
		Bytes:      out,
		SourceHash: s38.SourceHash, // S38's content address (control ⊕ action) — reused, not forked.
		OutputHash: records.Hash(out),
		Protected:  true,
	}, nil
}

// rewriteExprImport rewrites the ONE aidos-expr import S38 emits ("@/lib/aidos-expr", the
// Workbench alias) to a relative path ("./aidos-expr", the bundled twin) — a deterministic,
// single-line substitution. It is the ONLY transform applied to S38's bytes; the button body is
// otherwise byte-equal (the no-fork proof, asserted by the mirror).
func rewriteExprImport(s string) string {
	return strings.Replace(s, `from "@/lib/aidos-expr"`, `from "./aidos-expr"`, 1)
}

// buttonComponentName pascal-cases a control name into the React component identifier S38 uses
// ("checkout-button" → "CheckoutButton"), so the emitted file name matches the exported symbol.
func buttonComponentName(c control.Control) string { return pascal(c.Name) }

// listComponentName is the list view's component/file stem for an entity ("Order" → "OrderList").
func listComponentName(e entities.Entity) string { return pascal(e.Name) + "List" }

// pascal pascal-cases a kebab/snake/space name into a React identifier. Deterministic, no
// invented inflection (the SAME rule as S38's componentName, kept local so this package owns no
// dependency on S38's unexported helper).
func pascal(name string) string {
	parts := strings.FieldsFunc(name, func(r rune) bool { return r == '-' || r == '_' || r == ' ' })
	var b strings.Builder
	for _, p := range parts {
		if p == "" {
			continue
		}
		b.WriteString(strings.ToUpper(p[:1]))
		b.WriteString(p[1:])
	}
	out := b.String()
	if out == "" {
		return "View"
	}
	return out
}
