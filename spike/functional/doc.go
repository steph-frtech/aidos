// Package functional is the THROWAWAY FN01 spike (KRD §84: cliquet OFF, rigueur T0,
// jetable). Zone /spike/functional/ — rien ici ne gradue: /harvest proposera, /goal
// figera, les vrais émetteurs seront re-formés en FN02+. Le mur est intact (aucune
// écriture kernel/mirrors/fitness). Module isolé (n'importe pas back/ —
// TestConfinement le prouve). Voir cmd/verdict pour imprimer le résultat, et
// Decide().Rationale pour la décision go/no-go CALCULÉE (jamais déclarée).
//
// QUESTION DE FALSIFIABILITÉ
//
//	un émetteur peut-il produire le slice checkout (S46/S34 : entité Order →
//	struct Go / DDL Postgres / interface TS) en style PUR-FONCTIONNEL — chaque
//	renderer fonction pure, ZÉRO globale mutable, composition explicite (graphe
//	d'appel acyclique) — SANS perdre le déterminisme S34 (sortie byte-identique
//	à l'émetteur impératif) ?
//
// CE QUI EST MESURÉ (déterministe, sans LLM — mandat determinism-first ; la pureté EST
// ce mandat appliqué à la sortie. TestReproducible rejoue 100×, même entrée → même
// sortie). L'émetteur impératif vit dans back/runtime/generators/emit.go : il tient
// `var typeMap = …` au scope PAQUET (une globale) et accumule la sortie en MUTANT un
// strings.Builder. La ré-émission fonctionnelle (funcemit.go) supprime les deux :
//
//   - typeBindings() est un constructeur PUR qui RETOURNE la table de types par valeur
//     (pas de var module) ; elle est threadée explicitement dans la composition ;
//   - le rendu est fold/map/concat sur des slices immuables (mapFields, strings.Join),
//     aucun accumulateur muté ;
//   - EmitFunctional compose explicitement renderGo ∘ renderDDL ∘ renderTS sur la même
//     entité — graphe d'appel ACYCLIQUE documenté dans funcemit.go.
//
// MESURES (sur le slice Order = id/total/discount) :
//
//	cible    parité byte vs impératif   reproductible(100×)   globales introduites
//	go-sqlc  OUI                         OUI                   0
//	pg-ddl   OUI                         OUI                   0
//	ts-types OUI                         OUI                   0
//
//	TestNoGlobalMutableVar : 0 `var` au niveau paquet dans funcemit/slice/measure.go.
//	TestConfinement : 0 import de steph-frtech/aidos (le mur + isolation module).
//	Fault-injection (FN01 build) : injecter une globale → TestNoGlobalMutableVar ROUGE ;
//	  casser un séparateur → TestByteParityDDL ROUGE. Les miroirs sont VIVANTS.
//
// VERDICT : GO. La ré-émission pur-fonctionnelle reproduit le slice checkout
// BYTE-IDENTIQUE sur les trois cibles, est reproductible, et n'introduit aucune globale
// — le déterminisme S34 est préservé et le coût est comparable (même nombre de cibles,
// composition lisible, pas d'explosion de code). Faisable et porteur de valeur (un
// graphe de fonctions pures donne un index call-graph naturel pour FN05) → on poursuit
// vers FN02 (ADR « mandat fonctionnel du code émis »).
//
// OPENQUESTIONS (gaps non résolus — provenance, jamais comblés en douce) :
//
//	OQ-FN01-1 portée : le probe ne réémet QUE l'entité Order (3 cibles). Les opérations
//	  (createOrder : Validate/Authorize/Mutate/Return, S36) et les contrôles/actions
//	  (boutons, S11) ne sont pas couverts. FN03 doit étendre la pureté à TOUTES les
//	  cibles émises (handlers Go, composants Next) et re-mesurer la parité.
//	OQ-FN01-2 source_hash : la valeur du header est ÉPINGLÉE (constante prise au dump de
//	  l'émetteur live), pas recalculée — le hashing reste le job de l'émetteur réel
//	  (records.Hash, S02). FN03 branche le vrai calcul et re-prouve la parité.
//	OQ-FN01-3 confinement vs vrai code : le probe COPIE le slice (slice.go) au lieu
//	  d'importer back/ (isolation module §84). FN03 travaillera sur l'arbre gen/ réel ;
//	  la règle arch-fitness EMITTED_NO_GLOBAL_MUTABLE (FN04) remplacera TestNoGlobalMutableVar
//	  par un gate fail-closed (depguard/go-arch-lint), jamais un jugement LLM.
//	OQ-FN01-4 graphe acyclique : ici l'acyclicité est garantie par construction (pas de
//	  récursion mutuelle) et documentée, non VÉRIFIÉE par un outil. FN04 ajoute la règle
//	  EMITTED_CALL_GRAPH_ACYCLIC déterministe + sa fault-injection.
//	OQ-FN01-5 Linear : l'issue FN01 n'a pu être tracée (MCP linear-server non authentifié,
//	  OAuth requis). À créer/passer Done quand l'auth Linear est disponible.
//
// REPRODUIRE : `cd spike/functional && go test ./... && go run ./cmd/verdict`.
package functional
