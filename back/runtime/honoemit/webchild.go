package honoemit

// webchild.go — LE WEB CHILD : la vue web React DÉRIVÉE de la vue MAÎTRE.
//
// Modèle (utilisatrice, gravé 2026-06-14) : la maître = le PARENT canonique ; le web child =
// le PREMIER des trois enfants distincts (web React / mobile Expo / desktop Electron). Chacun
// dérive de la maître MAIS adapte sa plateforme (idiomes, layouts différents — PAS un clone).
// Le web child porte l'IDIOME WEB : table/page React (ce que EmitWebApp émet DÉJÀ, live sur
// shopapp). On le REFRAME comme dérivant de la maître, SANS changer un octet (anti-overwrite
// §9 : shopapp web reste byte-identique).
//
// DEUX FRONTIÈRES, UN SEUL CORPS DE LOGIQUE :
//
//   - EmitWebApp(spec)        : l'API HISTORIQUE — les artefacts web React byte-stables sous
//                               gen/<project>/web/. INCHANGÉE (shopapp continue d'appeler ça,
//                               byte-identique). C'est la FORME du web child.
//   - EmitWebChild(spec)      : la VUE de DÉRIVATION — appelle EmitMasterView (le parent), puis
//                               EmitWebApp (la forme web, byte-identique), et ANNEXE le parentId
//                               (le Hash de la maître) en MÉTADONNÉE. Les artefacts retournés sont
//                               BYTE-ÉGAUX à ceux d'EmitWebApp ; seul le WebChild qui les enveloppe
//                               porte le parentId. Aucun octet d'artefact ne change.
//
// LE LIEN composes (S18) : WebChild.ParentID == MasterViewHash(spec) — l'arête parent → enfant
// de l'arbre fractal (ADR 0055). Le mobile et le desktop porteront le MÊME parentId (la même
// maître), trois enfants distincts d'un seul parent. La maître les contraint (même sémantique :
// mêmes sections, mêmes actions, mêmes invariants) ; chaque enfant en adapte la FORME.
//
// DÉTERMINISME-FIRST / LE MUR (§2/§6/§8) : EmitWebChild est une FONCTION PURE, byte-stable. Le
// parentId est un CONTENT-ADDRESS (records.Hash de la maître), pas un id inventé. La projection
// n'écrit aucune vérité (below-the-line, anti-overwrite §9 — les bytes web ne bougent pas).

import "github.com/steph-frtech/aidos/back/runtime/blockreason"

// ChildTarget names a platform child of the master view (the THREE distinct children: web /
// mobile / desktop). It is the platform an emitted child adapts the master's semantics to.
type ChildTarget string

const (
	// ChildWeb — the React web view (table/page idiom). The first child; EmitWebApp's form.
	ChildWeb ChildTarget = "web"
	// ChildMobile — the Expo / React-Native view (FlatList/View/Text/Pressable + NativeWind, the
	// touch idiom, screens). Emitted by a later sibling (the mobile child emitter).
	ChildMobile ChildTarget = "mobile"
	// ChildDesktop — the Electron view (panels/menu/shortcuts, NOT the web view wrapped). Emitted
	// by a later sibling (the desktop child emitter).
	ChildDesktop ChildTarget = "desktop"
)

// WebChild is the WEB CHILD of the master view: the React web artifacts (the web idiom) PLUS the
// DERIVATION metadata that ties them to the master. The Artifacts are BYTE-IDENTICAL to
// EmitWebApp's output (anti-overwrite §9); the ParentID is the content address of the master the
// child derives from (the `composes` edge, S18) — so the child node knows its parent without the
// bytes changing. Adaptation is the per-platform override point a validated adaptation capitalises
// into (the loopback, back/runtime/compound) — the web child's form is already frozen, so it
// carries no override yet (the web idiom IS the historical EmitWebApp output).
type WebChild struct {
	// Target is always ChildWeb for this emitter (the web idiom). Carried so the three siblings
	// share one shape (a child knows which platform it adapts).
	Target ChildTarget `json:"target"`
	// ParentID is the content address of the MASTER this child derives from (MasterViewHash) — the
	// `composes` parent edge (S18). The mobile + desktop siblings carry the SAME ParentID (one
	// parent, three distinct children).
	ParentID string `json:"parent_id"`
	// MasterHash is an alias of ParentID kept explicit for the call sites that read "the master
	// hash" (the signature the mobile/desktop emitters consume). Always == ParentID.
	MasterHash string `json:"master_hash"`
	// Artifacts are the emitted web React files — BYTE-IDENTICAL to EmitWebApp(spec) (anti-overwrite
	// §9: shopapp web is unchanged). The derivation does not touch the bytes; it only annexes the
	// parent linkage.
	Artifacts []Artifact `json:"artifacts"`
}

// EmitWebChild derives the WEB CHILD from the master view: it emits the master (the parent node),
// then the web React artifacts (EmitWebApp — byte-identical to the historical output), and ties
// them together by the master's content address (ParentID). The Artifacts are BYTE-EQUAL to
// EmitWebApp(spec); only the WebChild wrapper carries the parent linkage. A malformed spec is the
// SAME typed BlockReason EmitWebApp returns (one refusal shape across the family), never a partial
// child.
//
// This is the reframe the model demands: the web view is no longer a standalone emitter, it is the
// FIRST CHILD of the master — but the reframe is byte-transparent (the wall + anti-overwrite §9).
func EmitWebChild(s WebAppSpec) (WebChild, *blockreason.BlockReason) {
	// The parent address — emit the master and take its content hash. A refusal here is the same
	// refusal EmitWebApp would return (shared validateWebApp), reshaped to name the master source.
	parentID, br := MasterViewHash(s)
	if br != nil {
		return WebChild{}, br
	}

	// The web form — the HISTORICAL EmitWebApp output, byte-identical (anti-overwrite §9). The
	// child derives FROM the master but its bytes are exactly what shopapp already ships.
	arts, br := EmitWebApp(s)
	if br != nil {
		return WebChild{}, br
	}

	return WebChild{
		Target:     ChildWeb,
		ParentID:   parentID,
		MasterHash: parentID,
		Artifacts:  arts,
	}, nil
}
