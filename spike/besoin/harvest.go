// harvest.go — THROWAWAY (EL01 spike). The /harvest output: the ONE durable lesson lifted out of
// the throwaway probe as a DRAFT candidate-Idea (no frozen version, no mirror) — the anchor that
// EL02+ reads. Harvest PROPOSES; the human freezes later via /goal. The wall is intact: this struct
// is a PROPOSAL the real idea-intake MCP would capture via idea_capture (provenance human), NEVER a
// kernel/mirror write (HARVEST_CANNOT_FREEZE). The spike persists nothing — it only MODELS the
// proposal so the verdict can hand it off honestly.
package besoin

// DraftIdea is the harvested candidate-truth: an Idea proposal with NO frozen version and NO mirror
// (the double absence = it is a NEED, not a truth — exactly what distinguishes an Idea from a
// Truth). Proposes "product" (the durable lesson is a product-level intention about HOW need is
// captured). Status is "draft" — it has not even been grilled yet. Provenance is the spike.
type DraftIdea struct {
	Proposes       string   // "product" — the lesson is a product-level intention
	Intent         string   // the verbatim durable lesson, in the ubiquitous language
	ProvenanceKind string   // "human" — captured from the human-run spike
	ProvenanceFrom string   // the source spike (EL01)
	Status         string   // "draft" — never frozen, never grilled here
	HasMirror      bool     // ALWAYS false (a harvested Idea carries no mirror)
	HasVersion     bool     // ALWAYS false (a harvested Idea carries no frozen version)
	OpenQuestions  []string // every gap, never an invented fact (§8 honesty)
}

// Harvest lifts the ONE durable lesson of the EL01 spike into a DRAFT candidate-Idea. It is a
// PROPOSAL, not a truth: HasMirror and HasVersion are always false, the wall holds. Pure function
// (the lesson is fixed; no clock/rng/LLM). EL02+ reads this anchor.
func Harvest() DraftIdea {
	return DraftIdea{
		Proposes:       "product",
		Intent:         "le besoin doit suivre l'architecture, niveau par niveau : avant l'app-builder, forcer l'utilisateur à expliquer son app rung par rung (product→journey→view→control→action→operation→entity) au-dessus du mur, plutôt qu'une boîte texte-libre plate — la sortie est un BesoinGraph ordonné, typé et content-adressé, strictement plus riche qu'un prompt plat.",
		ProvenanceKind: "human",
		ProvenanceFrom: "spike:EL01 (spike/besoin)",
		Status:         "draft",
		HasMirror:      false,
		HasVersion:     false,
		OpenQuestions: []string{
			"OQ-EL01-1 portée v1 : seuls les 7 rungs §23 + bandes invariant/policy sont visés ; saga/temporal/globalinvariant restent hors-grammaire-v1 (à trancher en EL02, OpenQuestion déclarée, pas une complétude prétendue).",
			"OQ-EL01-2 métrique de richesse : le spike compte Ideas/refs-résolues/typage/anchors comme proxy de « plus riche » ; la vraie gate (EL07 CanDescend + EL08 ShrinkOptionSpace) doit mesurer le rétrécissement de l'OptionSpace énumérable, pas juste compter — le spike prouve le MÉCANISME et son sens, pas la métrique finale.",
			"OQ-EL01-3 le mur : la capture ici ne persiste RIEN ; EL14/EL15 doivent capturer l'Idea via idea-intake idea_capture (provenance human, utterance verbatim) — le spike modélise le payoff qui le justifie, pas le chemin mur.",
			"OQ-EL01-4 Linear : le MCP linear-server n'est pas authentifié dans cet environnement (seuls authenticate/complete_authentication sont exposés) ; l'issue EL01 n'a pu être déplacée en In Progress/Done par MCP — à régulariser au prochain restart authentifié.",
		},
	}
}
