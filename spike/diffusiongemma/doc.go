// Package diffusiongemma is the THROWAWAY DG01 spike (KRD §84: cliquet OFF, rigueur T0, jetable).
// Zone /spike/diffusiongemma/ — rien ici ne gradue: /harvest proposera, /goal figera, le code réel
// sera RÉÉCRIT (DG02+). Le mur est intact (aucune écriture kernel/mirrors/fitness). Module isolé
// (n'importe pas back/). Voir cmd/verdict pour imprimer le résultat, et Decide().Rationale pour la
// décision go/no-go CALCULÉE (jamais déclarée). Gouverné par ADR 0079 + ROADMAP-diffusiongemma.md.
//
// LA QUESTION DE FALSIFIABILITÉ (ADR 0079)
//
//	Comparer >=2 sorties LLM sur UNE SEULE spec révèle-t-il des TYPES de requirement qu'un seul
//	recompile déterministe oublierait? i.e. |types(LLM_A) ∪ types(LLM_B)| est-il sensiblement >
//	|types(single)| pour la MÊME spec — et le surplus vaut-il un port LLM gaté?
//
// CE QUI EST MESURÉ (déterministe — mandat determinism-first §8). La métrique est un COMPTAGE de
// TYPES de requirement (Extract sur chaque sortie, contre une taxonomie CLOSED de 22 kinds ancrée
// dans la verticale AIDOS: view/control/action/operation/entity/invariant/policy + facettes), JAMAIS
// un jugement de qualité du code généré (un jugement LLM hissé en vérité est interdit §8). La sortie
// LLM est TOUJOURS re-jugée par la fonction pure Extract (le juge est déterministe). La LLM est
// l'exception gatée derrière un seam injectable (interface LLM): FixtureLLM (déterministe, sans
// réseau — le test de repro) + ClaudeCLI (réel, optionnel, 2 prompts distincts comme A/B).
//
// RÉSULTAT — DEUX MESURES (le verdict honnête se DÉDOUBLE, anti-Goodhart):
//
//	(1) FIXTURES (déterministe, TestReproducible rejoue 100×, même entrée -> même métrique).
//	    Modélise DEUX modèles GÉNUINEMENT divergents (A instruct/UX, B diffusion/structuré):
//	      single recompile = 8 types   union(A,B) = 20 types   surplus = 12 (floor 4)
//	      union-au-dessus-du-meilleur-modèle = 4   couverture match%: 42.1% -> 100%
//	    => GO sur les fixtures: la divergence des deux modèles ajoute 4 types par-delà le MEILLEUR
//	    seul -> le différentiel paie SI les deux modèles divergent réellement.
//
//	(2) ÉCHANTILLON RÉEL claude-CLI (claude-opus-4-8, 3 appels: single/A/B, 2 runs concordants).
//	    A et B = le MÊME modèle fort sous deux LENTILLES de prompt (UX vs formel):
//	      single recompile = 5 types   union(A,B) = 22 types   surplus = 17 (floor 4)
//	      union-au-dessus-du-meilleur-modèle = 0   couverture match%: 26.3% -> 100%
//	    => NO-GO/INCONCLUSIVE sur le différentiel: A≈B (22==22), le 2ᵉ appel n'ajoute RIEN au-dessus
//	    du meilleur seul. UN modèle fort suffit à révéler les trous; le DIFFERENTIEL >=2 ne se paie
//	    que sous une VRAIE diversité de modèles, pas deux prompts d'un même modèle.
//
// LA DISTINCTION QUE LE SPIKE TRANCHE (les deux runs s'accordent dessus):
//   - SOUS-QUESTION 1 « un LLM révèle-t-il des types qu'un recompile rate? » -> OUI, NET et robuste
//     (surplus 12 fixtures / 17 réel; un seul LLM fort passe la couverture de ~26-42% à 100%). Les
//     types ratés sont exactement ceux qu'un recompile happy-path NE PEUT PAS inférer: invariants ∀,
//     policy authz, error/edge cases, empty states, effets on_success/on_error, guards, events.
//   - SOUS-QUESTION 2 « le DIFFERENTIEL (>=2 modèles) bat-il le meilleur modèle seul? » -> OUI sous
//     vraie divergence (fixtures: +4), NON sous deux prompts d'un même modèle fort (réel: +0).
//
// VERDICT (calculé): GO conditionnel. La valeur du bench est RÉELLE mais ne réside PAS dans le
// différentiel multi-prompt d'un seul modèle: elle réside dans (a) le LLM-vs-recompile (un capteur
// de trous puissant, déjà rentable avec UN modèle fort) et (b) le différentiel SEULEMENT entre
// modèles GÉNUINEMENT divergents (familles différentes / DiffusionGemma vs autorégressif), pas deux
// températures du même. Donc: DG02 vaut la peine — un port `RequirementBench` replaceable qui
// PROPOSE des trous (idée -> miroir -> /goal), avec l'oracle déterministe (loi de complétude) qui
// reste autoritaire (ADR 0072) — MAIS le port doit comparer des modèles RÉELLEMENT distincts et
// peut, au plancher, n'utiliser QU'UN modèle fort vs le recompile (le différentiel multi-modèle est
// un bonus, pas le minimum). Le sujet NE s'arrête PAS, mais sa thèse « multi-LLM » est recadrée.
//
// OPENQUESTIONS (gaps non résolus — provenance, jamais comblés en douce):
//
//	OQ-DG01-1 vraie diversité de modèles: l'échantillon réel n'a qu'UN modèle (claude-opus-4-8) sous
//	  deux prompts -> A≈B. La thèse différentielle exige >=2 FAMILLES (p.ex. DiffusionGemma diffusion
//	  vs un autorégressif). Tant qu'on n'a pas un 2ᵉ modèle offline divergent, le « différentiel
//	  multi-LLM » reste non-prouvé sur le réel; DG04 doit brancher un 2ᵉ modèle réel et re-mesurer.
//	OQ-DG01-2 taxonomie: les 22 kinds sont DÉCLARÉS ici (au-dessus de la ligne). La frontière exacte
//	  « type de requirement » (réutilise-t-elle la taxonomie de check-completeness ou la sienne?)
//	  reste ouverte (ADR 0079 §Conséquences). DG03 doit la figer comme source unique.
//	OQ-DG01-3 ExpectedKinds = oracle humain: le dénominateur match% (les 19 types « attendus ») est
//	  une vérité DÉCLARÉE par un humain-propriétaire pour CETTE spec. En production c'est la loi de
//	  complétude qui est autoritaire, pas le bench; le bench ne fait que proposer des candidats.
//	OQ-DG01-4 extraction par marqueurs: Extract parse une sortie LLM TAGGÉE (le prompt impose le
//	  vocabulaire). Une sortie en prose libre serait sous-comptée. DG03 doit soit contraindre le
//	  format (comme ici) soit ajouter un parseur structuré déterministe — jamais un LLM-juge.
//	OQ-DG01-5 coût/latence: 3 appels réels ~ dizaines de secondes chacun; un bench différentiel
//	  multi-modèle par spec a un coût non nul à budgéter (ADR 0079 OpenQuestion coût/latence).
//
// REPRODUIRE: `cd spike/diffusiongemma && go test ./...` (vert, fixtures hermétiques) puis
// `go run ./cmd/verdict` (fixtures) ou `go run ./cmd/verdict --real` (échantillon claude-CLI, repli
// honnête vers fixtures si claude indisponible -> usedRealLLM=false).
package diffusiongemma
