// Package besoin is the THROWAWAY EL01 spike (KRD §84: cliquet OFF, rigueur T0, jetable).
// Zone /spike/besoin/ — rien ici ne gradue: /harvest proposera, /goal figera, le code réel
// (le paquet back/runtime/besoin) sera CONSTRUIT en EL02+. Le mur est intact (aucune écriture
// kernel/mirrors/fitness). Module isolé (n'importe pas back/). Voir cmd/verdict pour imprimer le
// résultat, et Decide().Rationale pour la décision go/no-go CALCULÉE (jamais déclarée).
//
// QUESTION DE NÉCESSITÉ (le besoin DOIT-il suivre l'architecture, niveau par niveau ?)
//
//	Une boîte texte-libre (la S64 « capturez votre idée » actuelle) suffit-elle à capturer un
//	besoin d'app, ou une descente top-down rung-par-rung (product→…→entity) avec une porte de
//	forçage produit-elle un backlog d'Ideas STRICTEMENT plus riche/ordonné qu'un prompt plat ?
//
// LE MODÈLE (déterministe, sans LLM — mandat determinism-first §6/§8). Le MÊME besoin (la demo
// checkout S46, « a customer places an order from their cart », corps lus VERBATIM des ancres S46)
// est capturé DEUX façons :
//   - BesoinGraph (model.go/fixture.go) : un nœud par rung SOURCE §23, ordonné top-down, chaque
//     rung mappant typé (les 4 métadonnées forcées par la gate), chaque ref sortante résolvant vers
//     le rung plus profond déclaré ; journey/view sont des nœuds NoEmit qui SEEDENT les ancres des
//     rungs mappants sans émettre d'Idea (jamais un cast silencieux journey→product).
//   - FlatPrompt (model.go) : la boîte texte-libre — un seul blob, aucune structure de rung, aucune
//     métadonnée, aucune arête de dépendance ; l'agent devrait TOUT deviner (un raccourci
//     prompt→code que le mur interdit).
//
// MESURE (richesse COMPTÉE, jamais jugée par LLM ; chaque terme est un entier de fonction pure):
//
//	capture          Ideas  refs-résolues  typées(4 méta)  ancrées  ordonné  NoEmit-seedés
//	BesoinGraph        5          5              5             4       oui         2
//	FlatPrompt         1          0              0             0       non         0
//	delta            +4         +5             +5            +4    dominance      —
//
// GARDES (anti-Goodhart, honnêteté du modèle):
//   - PLANCHER déclaré : gain d'Ideas ≥ 3 (MinIdeaGain, above the line §8) sur le besoin travaillé.
//   - DOMINANCE STRICTE exigée sur CHAQUE axe (Ideas, refs-résolues, typage, ancres) + l'ordre
//     topologique présent côté graphe et absent côté prompt — sinon NO-GO.
//   - REPRODUCTIBILITÉ : même besoin → même comparaison + mêmes hashes + même verdict (rejoué 100×
//     par TestReproducible). Pure fonction, pas d'horloge/rng/LLM.
//
// VERDICT: GO. Sur la demo checkout, capturer le besoin en BesoinGraph top-down avec porte de
// forçage produit 5 Ideas ordonnées, typées, dépendances-résolues (+4 sur le blob unique non-typé
// du prompt plat), versus 1 candidate indifférenciée que l'agent doit deviner — bien au-dessus du
// plancher, de façon reproductible. Le track est NÉCESSAIRE → on poursuit vers EL02 (la grammaire
// close BesoinLevel). On HARVEST l'Idea-ancre « le besoin doit suivre l'architecture, niveau par
// niveau » (harvest.go, DRAFT, sans miroir ni version — promotion = /goal plus tard).
//
// OPENQUESTIONS (gaps non résolus — provenance, jamais comblés en douce ; voir aussi Harvest()):
//
//	OQ-EL01-1 portée v1: seuls les 7 rungs §23 + bandes invariant/policy sont visés ; saga/temporal/
//	  globalinvariant restent hors-grammaire-v1 (à trancher EL02) — déclaré, pas une complétude
//	  prétendue.
//	OQ-EL01-2 métrique de richesse: le spike COMPTE (Ideas/refs/typage/ancres) comme proxy de « plus
//	  riche » ; la vraie gate (EL07 CanDescend + EL08 ShrinkOptionSpace) mesurera le rétrécissement
//	  d'un OptionSpace énumérable déclaré, pas un simple comptage — le spike prouve le MÉCANISME et
//	  son sens, pas la métrique finale.
//	OQ-EL01-3 le mur: la capture ici ne persiste RIEN. EL14/EL15 captureront l'Idea via idea-intake
//	  idea_capture (provenance human, utterance verbatim) — le spike modélise le payoff qui le
//	  justifie, pas le chemin mur.
//	OQ-EL01-4 Linear: le MCP linear-server n'est pas authentifié dans cet environnement (seuls
//	  authenticate/complete_authentication sont exposés) ; l'issue EL01 n'a pu être déplacée par MCP.
//	  À régulariser au prochain restart authentifié.
//
// REPRODUIRE: `cd spike/besoin && go test ./... && go run ./cmd/verdict`.
package besoin
