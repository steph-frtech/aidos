// Package evolvegen is the THROWAWAY EG01 spike (KRD §84: cliquet OFF, rigueur T0,
// jetable). Zone /spike/evolve-generator/ — rien ici ne gradue: /harvest proposera,
// /goal figera, le vrai générateur (si GO) sera branché derrière le seam EXISTANT de
// back/mcp/evolve à EG02+, RÉÉCRIT — jamais soulevé d'ici. Le mur est intact (aucune
// écriture kernel/mirrors/fitness). Module isolé (n'importe pas back/). Voir cmd/verdict
// pour imprimer le résultat, et Decide().Rationale pour la décision go/no-go CALCULÉE
// (jamais déclarée).
//
// QUESTION DE FALSIFIABILITÉ (ADR 0087 / ROADMAP-evolve-generator EG01)
//
//	un générateur de variantes SELF-PLAY (un Proposer LLM derrière le seam) améliore-t-il
//	le taux de passage du gate et/ou la couverture de niches QD par rapport au STUB
//	deterministicSampler existant, quand il alimente la boucle Evolve ?
//
// CE QUI EST MESURÉ (déterministe, sans LLM dans le harness — mandat determinism-first ;
// TestReproducible rejoue 200×, même seed → même verdict). On modélise UNE cellule kernel
// (createOrder, 6 niches déclarées, 4 approuvées par l'autorité, seuil out-of-sample 0.55)
// en pure data — SANS importer le kernel réel. Le GATE est une fonction pure tenant lieu de
// promotion-gate (§66.1) : niche_valide ∧ mirror_green ∧ out_of_sample_green ∧ autorité.
// Le MÊME gate juge les deux samplers (aucun biais) :
//
//   - (a) stubSampler     — RÉ-MODÈLE fidèle du deterministicSampler réel : 1 variante,
//     niche "<cell>/baseline". Le budget/seed ne l'élargissent pas (la limite STRUCTURELLE
//     que le spike sonde). Or "createOrder/baseline" EST une niche déclarée+approuvée → le
//     stub la gagne. Le stub n'est PAS truqué pour échouer : il passe sa seule niche.
//   - (b) selfPlaySampler — un Proposer self-play offrant 5-10 candidats derrière un seam
//     INJECTABLE : fixtureProposer (seedé, splitmix64, sans réseau — pour la repro) OU
//     ClaudeProposer (optionnel, shell vers la CLI claude). Le Proposer choisit SEULEMENT
//     les niches + la force de mutation ; la cellule (Juge) DÉRIVE mirror/oos/fitness — le
//     générateur ne s'auto-note JAMAIS (anti-Goodhart, §8). Une mutation > 0.85 casse le
//     miroir (rouge) ; l'out-of-sample dégrade avec la mutation (1 − 0.6·m) — donc des
//     candidats audacieux ÉCHOUENT légitimement le gate. Rien n'est arrangé pour gagner.
//
// MESURES (fixtureProposer, seed=424242, budget=8 — cf. cmd/verdict et VERDICT.md) :
//
//	sampler     candidats  promus  niches gagnées                     passage  couverture
//	stub             1        1     [createOrder/baseline]               100%       17%
//	self-play        8        ~4    [baseline,bulk,discount,giftcard]    ~50%       67%
//
// Le stub a un passage de 100% (sa seule variante passe) mais ne couvre qu'1/6 des niches.
// Le self-play a un passage RATE plus bas (il propose aussi des variantes audacieuses qui
// échouent — c'est sain) MAIS gagne 4 niches sur 6 : une couverture matériellement
// supérieure (+50 points, ≥ le seuil déclaré de 33,3%), sous le MÊME gate déterministe.
//
// VERDICT : GO. Le self-play couvre matériellement plus de niches gate-validées que le stub
// (uplift de couverture ≥ seuil), le Juge=miroir restant l'arbitre déterministe — le
// générateur propose, le gate dispose. On poursuit vers EG02 (ADR « générateur replaceable
// derrière le seam Sampler », fallback deterministicSampler). Le passage-RATE plus bas du
// self-play n'est PAS un défaut : c'est le prix de l'exploration ; ce qui compte est le
// nombre de niches GAGNÉES, pas le ratio.
//
// OPENQUESTIONS (gaps non résolus — provenance, jamais comblés en douce) :
//
//	OQ-EG01-1 modèle de gate : mirror/out_of_sample sont DÉRIVÉS d'une heuristique de force
//	  de mutation (m>0.85 → rouge ; oos = 1−0.6m). Le vrai gate est le miroir réel + le
//	  backtester out-of-sample (§87) — EG02/EG03 re-mesurent derrière le seam réel.
//	OQ-EG01-2 une seule cellule : le probe sonde createOrder. La généralité (l'uplift tient-il
//	  sur des cellules à 2-3 niches, ou à autorité très restrictive ?) reste à élargir (EG03).
//	OQ-EG01-3 coût/latence du Proposer réel : non chiffré ici (la repro tourne sur la fixture).
//	  --real fait UN appel ; le coût agrégé d'une vraie boucle Evolve (budget × cellules) est
//	  une OpenQuestion de rentabilité pour l'ADR EG02.
//	OQ-EG01-4 stub vs niche "baseline" : le deterministicSampler réel émet la niche
//	  "<cell>/baseline" — le spike la suppose DÉCLARÉE+approuvée pour ne pas truquer le stub.
//	  Si une cellule ne déclare pas de niche baseline, le stub gagne 0 niche (le no-go serait
//	  faux-positif pour le self-play) — à vérifier sur cellules réelles en EG03.
//
// REPRODUIRE : `cd spike/evolve-generator && go test ./... && go run ./cmd/verdict`
// (real LLM : `go run ./cmd/verdict --real`).
package evolvegen
