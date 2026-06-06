// Package compound is the THROWAWAY CE01 spike (KRD §84: cliquet OFF, rigueur T0, jetable).
// Zone /spike/compound/ — rien ici ne gradue: /harvest proposera, /goal figera, le code réel
// sera RÉÉCRIT (CE02+). Le mur est intact (aucune écriture kernel/mirrors/fitness). Module
// isolé (n'importe pas back/). Voir cmd/verdict pour imprimer le résultat, et le verdict
// Decide().Rationale pour la décision go/no-go CALCULÉE (jamais déclarée).
//
// QUESTION DE FALSIFIABILITÉ (compound-engineering, everyinc/compound-engineering)
//
//	Capturer le MOTIF d'un 1er goal terminé réduit-il réellement l'effort/tokens d'un 2ᵉ goal
//	SIMILAIRE — sans fabriquer de réutilisation là où aucun motif n'est partagé ?
//
// LE MODÈLE (déterministe, sans LLM — mandat determinism-first §6/§8 ; l'EXPANSION d'un motif
// capturé est une FONCTION PURE, PAS un apprentissage de la fitness). Un goal (idée→miroir→
// rouge→vert) est décomposé en work-units ordonnées (charger le ContextPack, dériver le miroir,
// écrire la fixture, scaffolder le paquet, écrire l'opération, projeter Go+TS, câbler le contrôle
// UI, lancer les sensors). Chaque unit a un coût en tokens estimé. Deux goals SIMILAIRES
// partagent le sous-ensemble « shareable » (le motif) et ne diffèrent que par l'unit intrinsèque.
//   - CAPTURE (model.go) extrait le motif du goal-1 : unités-spec (mirror/fixture/contract) →
//     behavior-macro EXPANSÉE (§24.6, fonction pure) ; unités-gesture → recall PROCÉDURAL
//     (KindProcedural, S31). C'est exactement ce que CE03 persisterait en mémoire procédurale +
//     une behavior candidate via firewall.ViaIdea — ici seulement MESURÉ, jamais persisté.
//   - COST (model.go) recoûte le goal-2 : une unit shareable+capturée est REJOUÉE (replayCost=20,
//     plancher conservateur : la requête de recall + lecture de l'artefact) au lieu d'être
//     re-dérivée ; l'unit intrinsèque est TOUJOURS payée plein (pas de réutilisation fabriquée).
//
// MESURE (estimateur de tokens calibré sur la boucle §6 ; ratios fiables / absolus approximatifs):
//
//	paire                        goal-2 sans capture  ->  avec capture   réduction
//	order->invoice (SIMILAIRE)        7800                  1940           75.1%   <- pilote
//	order->migration (DISSIMILAIRE)   7100                  5920           16.6%   <- contrôle (plafond 20%)
//
// Sur la paire similaire, 5 unités sont rejouées par recall procédural et 2 par expansion de
// behavior-macro (les deux modes que CE03/CE04 câbleraient). L'unit intrinsèque (write_operation)
// reste dérivée plein (1800 tokens) dans les deux cas — la capitalisation réutilise le MOTIF,
// jamais la substance propre du goal.
//
// GARDES (anti-Goodhart, honnêteté du modèle):
//   - PLANCHER déclaré 25% (above the line, non appris §8) sur la paire similaire.
//   - PLAFOND déclaré 20% sur le contrôle DISSIMILAIRE : la capture ne doit PAS manufacturer
//     d'économie là où le seul recouvrement est trivial (load_context_pack). 16.6% < 20% → pas
//     de faux positif.
//   - REPRODUCTIBILITÉ : même entrée → même delta + même pattern hash + même verdict (rejoué
//     100× par TestReproducible). Pure fonction, pas d'horloge/rng/LLM.
//
// VERDICT: GO. Capturer le motif du 1er goal réduit l'effort du 2ᵉ goal similaire de 75.1%
// (7800→1940 tokens), bien au-dessus du plancher 25%, SANS fabriquer d'économie sur un goal
// dissimilaire (16.6% ≤ 20%), et de façon reproductible. La capitalisation paie → on poursuit
// vers CE02 (ADR « boucle de capitalisation » : le motif durable devient procédural + behavior
// réutilisable VIA LE MUR — firewall.ViaIdea → idée → miroir → /goal — sans jamais toucher la
// fitness).
//
// OPENQUESTIONS (gaps non résolus — provenance, jamais comblés en douce):
//
//	OQ-CE01-1 estimateur de tokens: les coûts par unit sont des ESTIMATIONS calibrées sur la
//	  boucle §6, pas une mesure d'un vrai run agent (le tokenizer provider est indisponible
//	  offline). CE02+ doit re-mesurer le delta sur des runs /goal réels (telemetry → §) ; le spike
//	  prouve le MÉCANISME (capture → replay) et son SENS, pas le chiffre absolu.
//	OQ-CE01-2 « similarité » non opérationnalisée: ici la similarité est codée dans le partage
//	  d'unités shareable. Le vrai router (CE05 / MatchRole, S33) doit DÉCIDER algorithmiquement
//	  qu'un goal suivant est assez proche pour réutiliser un motif (similarité d'embedding S31,
//	  pgvector) — un algorithme, pas un prompt (determinism-first). Le spike ne mesure pas le
//	  coût/risque d'une fausse correspondance au-delà du contrôle dissimilaire.
//	OQ-CE01-3 le mur: la capture ici ne persiste RIEN. CE03 doit écrire l'entrée procédurale
//	  (KindProcedural, below the wall, autorisé) ET proposer la behavior candidate UNIQUEMENT via
//	  firewall.ViaIdea (idée Status=proposed, aucune écriture kernel) — le spike ne teste pas ce
//	  chemin mur, seulement le payoff qui le justifie.
//	OQ-CE01-4 staleness/curation: un motif capturé peut DÉRIVER (le kernel évolue, le motif ne
//	  s'applique plus). S26 (QD curation, promotion ssi MirrorGreen) gouverne l'admission ; le
//	  spike suppose le motif valide. CE04 doit re-vérifier l'expansion contre un miroir avant
//	  réutilisation (idempotence + même behavior→même expansion, déjà property-testée ici).
//	OQ-CE01-5 Linear: le MCP linear-server n'est pas authentifié dans cet environnement (seuls
//	  authenticate/complete_authentication sont exposés) ; l'issue CE01 n'a pu être déplacée en
//	  In Progress/Done par MCP. À régulariser au prochain restart authentifié.
//
// REPRODUIRE: `cd spike/compound && go test ./... && go run ./cmd/verdict`.
package compound
