package honoemit

// mobilechild.go — LE MOBILE CHILD : la vue Expo / React-Native DÉRIVÉE de la vue MAÎTRE.
//
// Modèle (utilisatrice, gravé 2026-06-14) : PAS « une vue → N clones ». Une VUE MAÎTRE (le
// requirement canonique, plateforme-agnostique, content-adressée) = le PARENT ; les TROIS enfants
// (web React / mobile Expo / desktop Electron) en DÉRIVENT et portent parentId = le Hash de la
// maître (l'arête `composes` S18 / fractal ADR 0055). Chaque enfant ADAPTE sa plateforme (idiomes,
// layouts différents — PAS un clone). Le mobile child est le DEUXIÈME enfant : l'IDIOME MOBILE
// (tactile, écrans), DISTINCT du web (table/page) et du desktop (panneaux/menu).
//
// EmitMobileChild(MasterView) → MobileChild { artefacts Expo byte-stables sous gen/<project>/mobile/ } :
//
//   - app.json          : le manifeste Expo (le nom, le slug, la plateforme) ;
//   - package.json      : les deps épinglées (expo + react-native + nativewind + react) ;
//   - babel.config.js   : le preset Expo + le plugin NativeWind (le pipeline RN) ;
//   - global.css        : les directives Tailwind que NativeWind compile (les tokens ADR 0010) ;
//   - aidos-expr.ts     : LE TWIN de l'évaluateur Expr (le MÊME catalogue gelé que le web/desktop,
//                         copié verbatim — jamais re-implémenté) ;
//   - <Entity>List.tsx  : UNE FlatList par section (View/Text + classes NativeWind) — l'idiome
//                         tactile, fetchée via EXPO_PUBLIC_API_URL + GET /entities/<e> ;
//   - <Control>.tsx     : UN Pressable par action — évalue visible_when/enabled_when CÔTÉ CLIENT
//                         (le twin evalState), POST /<operation> via onInvoke ;
//   - App.tsx           : compose les FlatLists + les Pressables, câble onInvoke → POST
//                         /<operation> contre l'API Hono LIVE (EXPO_PUBLIC_API_URL).
//
// DÉRIVÉ DE LA MAÎTRE, PAS DE LA SPEC : EmitMobileChild prend la MasterView en entrée (le MÊME
// contrat que le desktop child) — il projette les Sections/Actions déjà calculés par EmitMasterView,
// sans re-dériver aucune règle métier. ParentID == master.Hash() (l'arête composes).
//
// DÉTERMINISME-FIRST / LE MUR (§2/§6/§8) : EmitMobileChild est une FONCTION PURE, TOTALE, byte-stable
// de la maître — aucune horloge, aucun RNG, aucun chemin absolu ; ordre canonique (sections/actions
// déjà triées par la maître, imports re-triés), versions épinglées, "\n" newlines (le miroir de
// reproductibilité le scelle). La projection N'ÉCRIT AUCUNE VÉRITÉ (below-the-line,
// gen/<project>/mobile/…, §9). Un master vide est un BlockReason typé (la forme S13), jamais partiel.
//
// POINT D'ADAPTATION (le loopback, back/runtime/compound) : MobileAdaptation est l'override
// per-plateforme qu'une adaptation validée capitalise. EmitMobileChildAdapted applique l'override
// (ex. le nom d'app affiché) — il change les bytes MAIS JAMAIS le parentId (la maître est la même
// requirement ; l'override est mobile, pas un nouveau besoin). Le contrat MIROIR du desktop child.
//
// ANTI-OVERWRITE §9 : émettre le mobile child est ADDITIF — un nouveau nœud sous gen/<project>/mobile/.
// Il ne touche AUCUN octet du web child (gen/<project>/web/ reste byte-identique à EmitWebApp).

import "github.com/steph-frtech/aidos/back/runtime/blockreason"

// TargetMobileApp — the emitted app's Expo / React-Native MOBILE VIEW (the touch child derived from
// the master). Lands under gen/<project>/mobile/. The set of honoemit targets grows additively; this
// is the one the mobile child emitter adds.
const TargetMobileApp = "mobile-app"

// Pinned dependency versions the Expo mobile app ships. Pinned (no resolver, no clock) so the emitted
// package.json is byte-stable + content-addressed. Expo SDK 51 + React Native 0.74 + NativeWind 4
// (the current May-2026 stable Expo toolchain).
const (
	expoVersion        = "~51.0.0"
	reactNativeVersion = "0.74.5"
	nativeWindVersion  = "^4.0.36"
	rnSafeAreaVersion  = "4.10.5"
	rnScreensVersion   = "3.31.1"
	expoStatusBarPkg   = "expo-status-bar"
	expoStatusBarVer   = "~1.12.1"
	tailwindCSSVersion = "^3.4.0"

	// The web-export deps. The mobile child is web-exportable out of the box (`npx expo export -p web`):
	// react-native-web BRIDGES the RN primitives (View/Text/FlatList/Pressable) to the DOM, react-dom
	// MOUNTS the bridged tree, @expo/metro-runtime is the Expo web runtime, react-native-worklets is the
	// reanimated worklets plugin that babel-preset-expo's `jsxImportSource: nativewind` pipeline
	// references (its absence breaks the web bundle). Pinned to the Expo SDK 51 web toolchain.
	reactNativeWebVersion = "~0.19.10"
	expoMetroRuntimeVer   = "~3.2.1"
	rnWorkletsVersion     = "^0.9.2"

	// reactMobileVersion is the React version the Expo SDK 51 / RN 0.74 toolchain expects. It is pinned
	// EXACTLY (no caret) and is DISTINCT from the web child's reactVersion (^19.1.0): Expo 51 ships React
	// 18.3.1, and react + react-dom MUST match it or the metro web bundle breaks. react-dom is pinned to
	// the same version (the DOM renderer the web export mounts with).
	reactMobileVersion = "18.3.1"
)

// MobileAdaptation is the per-platform OVERRIDE point the mobile child carries — the capitalisable
// adaptation a validated mobile tweak loops back into (back/runtime/compound). It is the smallest
// surface that adapts the master's semantics to the touch platform WITHOUT changing the requirement:
// the master (and so the parentId) is unchanged; only the mobile FORM bends. Empty by default (the
// child derives the canonical mobile form); a non-empty override changes the bytes, never the parent.
// The MIRROR of the desktop child's DesktopAdaptation (the three siblings share one adaptation shape).
type MobileAdaptation struct {
	// AppName overrides the displayed Expo app name (app.json `expo.name`). Empty → the project name
	// (the canonical default). A per-platform label tweak — it never alters the master requirement.
	AppName string `json:"app_name,omitempty"`
	// Screen is the NEW ScreenDesign override (ADR 0071) — per-coordinate ADR-0010 style tokens applied
	// to the matching data-aidos-screen / data-aidos-field / data-aidos-invoke element at RENDER time.
	// NIL → the canonical form UNCHANGED (anti-overwrite §9, byte-identity preserved). The single
	// documented coordinate; the full multi-coordinate set rides screenAll (ReproduceScreen).
	Screen *ScreenOverride `json:"screen,omitempty"`
	// screenAll carries the FULL resolved override set for a multi-coordinate ScreenDesign reproduction.
	// UNEXPORTED + excluded from the content address: the styling is a RENDER-time class change, not a
	// structural source change.
	screenAll []ScreenOverride
}

// screenOverrides returns the effective override set the mobile renderers apply. PURE.
func (a MobileAdaptation) screenOverrides() []ScreenOverride {
	if len(a.screenAll) > 0 {
		return a.screenAll
	}
	if a.Screen != nil {
		return []ScreenOverride{*a.Screen}
	}
	return nil
}

// MobileChild is the MOBILE CHILD of the master view: the Expo / React-Native artifacts (the touch
// idiom) PLUS the derivation metadata that ties them to the master. The ParentID is the content
// address of the master (the `composes` edge, S18) — the SAME parentId the web + desktop children
// carry (one parent, three distinct children). The Artifacts are a PURE projection of the master,
// byte-stable. Adaptation is the per-platform override the child was emitted with (empty for the
// canonical child) — the capitalisable loopback slot. The MIRROR of DesktopChild's shape.
type MobileChild struct {
	// Target is always ChildMobile for this emitter (the touch idiom). Carried so the three siblings
	// share one shape (a child knows which platform it adapts).
	Target ChildTarget `json:"target"`
	// ParentID is the content address of the MASTER this child derives from (master.Hash()) — the
	// `composes` parent edge (S18). The web + desktop siblings carry the SAME ParentID.
	ParentID string `json:"parent_id"`
	// MasterHash is an alias of ParentID kept explicit for the call sites that read "the master
	// hash" (the family signature). Always == ParentID.
	MasterHash string `json:"master_hash"`
	// Adaptation is the per-platform override the child was emitted with (the capitalisable loopback
	// slot, back/runtime/compound). The zero value is the canonical mobile form.
	Adaptation MobileAdaptation `json:"adaptation"`
	// Artifacts are the emitted Expo / React-Native files (the touch idiom), under gen/<project>/mobile/.
	// A PURE projection of the master — byte-stable, additive (anti-overwrite §9 leaves the web child
	// untouched).
	Artifacts []Artifact `json:"artifacts"`
}

// EmitMobileChild derives the canonical MOBILE CHILD from the master view: the Expo scaffold (app.json
// + package.json + babel + global.css), the bundled Expr twin, one FlatList per section, one Pressable
// per action, and the App composition wired to POST /<operation> via EXPO_PUBLIC_API_URL. It is a
// FUNCTION PURE, TOTALE, byte-stable of the master. ParentID == master.Hash() (the composes edge). An
// empty/malformed master is a typed BlockReason (the honesty rule), never a partial child.
//
// This is the SECOND distinct child: the touch idiom (screens/FlatList/Pressable + NativeWind), NOT
// the web table/page, NOT the desktop panels — derived from the SAME master the web + desktop are.
func EmitMobileChild(m MasterView) (MobileChild, *blockreason.BlockReason) {
	return EmitMobileChildAdapted(m, MobileAdaptation{})
}

// EmitMobileChildAdapted derives the mobile child applying a per-platform ADAPTATION (the override
// the loopback capitalises). It changes the emitted bytes (e.g. the displayed app name) but NEVER the
// parentId — the master is the same requirement; the adaptation is mobile, not a new need. The
// canonical child (EmitMobileChild) is exactly this with the zero adaptation.
func EmitMobileChildAdapted(m MasterView, adapt MobileAdaptation) (MobileChild, *blockreason.BlockReason) {
	// The master must be projectable: a project namespace + at least one section OR one action (an
	// empty master derives no mobile view). The refusal is the MOBILE-named BlockReason (the honesty
	// rule — `aidos explain` distinguishes "the mobile child refused" from the web/desktop siblings).
	if m.Project == "" {
		br := blockMobileChild(ErrNoProject)
		return MobileChild{}, &br
	}
	if len(m.Sections) == 0 && len(m.Actions) == 0 {
		br := blockMobileChild(ErrEmptyApp)
		return MobileChild{}, &br
	}

	parentID := m.Hash()

	// The source hash the artifacts carry: the content address of (master ⊕ adaptation), so a changed
	// master OR a changed mobile override yields new artifact source hashes (content-addressed).
	sourceHash, err := mobileSourceHash(m, adapt)
	if err != nil {
		br := blockMobileChild(err)
		return MobileChild{}, &br
	}

	overrides := adapt.screenOverrides()

	dir := "gen/" + m.Project + "/mobile/"
	arts := []Artifact{
		artifact(dir+"aidos-expr.ts", TargetMobileApp, []byte(exprTwinSource), sourceHash),
		// aidos-bridge.ts — the Design Lab runtime (ADR 0071), embedded verbatim (calque aidos-expr.ts).
		artifact(dir+"aidos-bridge.ts", TargetMobileApp, []byte(aidosBridgeSource), sourceHash),
		artifact(dir+"app.json", TargetMobileApp, emitExpoAppJSON(m, adapt, sourceHash), sourceHash),
		artifact(dir+"babel.config.js", TargetMobileApp, emitExpoBabelConfig(sourceHash), sourceHash),
		artifact(dir+"global.css", TargetMobileApp, emitMobileGlobalCSS(sourceHash), sourceHash),
		// index.js is the Expo entry. It registers the root component AND imports "./global.css" — the
		// NativeWind v4 CSS injection point: without this import metro never bundles the compiled CSS into
		// the web export, and `npx expo export -p web` ships an unstyled page.
		artifact(dir+"index.js", TargetMobileApp, emitMobileEntry(sourceHash), sourceHash),
		// metro.config.js wires withNativeWind(config, { input: "./global.css" }) — the metro transformer
		// that compiles the className utilities to CSS for the web export.
		artifact(dir+"metro.config.js", TargetMobileApp, emitMobileMetroConfig(sourceHash), sourceHash),
		artifact(dir+"package.json", TargetMobileApp, emitMobilePackageJSON(m, sourceHash), sourceHash),
		// tailwind.config.js carries the nativewind preset + PRECISE content globs (never node_modules).
		artifact(dir+"tailwind.config.js", TargetMobileApp, emitMobileTailwindConfig(sourceHash), sourceHash),
	}

	// One FlatList SCREEN per section (fields = the section's fields in source order). The screen
	// overrides re-style the matching data-aidos-screen / data-aidos-field (nil → bytes unchanged).
	for _, sec := range m.Sections {
		arts = append(arts, artifact(dir+pascal(sec.Entity)+"List.tsx", TargetMobileApp, emitMobileList(sec, sourceHash, overrides), sourceHash))
	}

	// One Pressable per action — evaluating the Expr twin client-side, POSTing /<operation> via onInvoke.
	for _, act := range m.Actions {
		arts = append(arts, artifact(dir+pascal(act.Control)+".tsx", TargetMobileApp, emitMobilePressable(act, sourceHash, overrides), sourceHash))
	}

	// The App composition (FlatLists + Pressables, wired to POST /<operation> against EXPO_PUBLIC_API_URL).
	arts = append(arts, artifact(dir+"App.tsx", TargetMobileApp, emitMobileApp(m, sourceHash), sourceHash))

	sortArtifacts(arts)
	return MobileChild{
		Target:     ChildMobile,
		ParentID:   parentID,
		MasterHash: parentID,
		Adaptation: adapt,
		Artifacts:  arts,
	}, nil
}
