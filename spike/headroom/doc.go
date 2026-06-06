// Package headroom is the THROWAWAY HR01 spike (KRD §84: cliquet OFF, rigueur T0, jetable).
// Zone /spike/headroom/ — rien ici ne gradue: /harvest proposera, /goal figera, le code réel
// sera RÉÉCRIT (HR02+). Le mur est intact (aucune écriture kernel/mirrors/fitness). Module
// isolé (n'importe pas back/). Voir cmd/verdict pour imprimer le résultat, et le verdict
// Decide().Rationale pour la décision go/no-go calculée (jamais déclarée).
//
// QUESTION DE FALSIFIABILITÉ
//
//	retrieve∘compress réduit-il réellement les tokens sur des prompts AIDOS (ContextPack +
//	transcript) tout en préservant les faits porteurs — et un mode déterminisme-safe existe-t-il?
//
// CE QUI EST MESURÉ (déterministe, sans LLM — mandat determinism-first; TestReproducible
// rejoue 100×, même entrée → même verdict). Deux modes:
//
//   - LOSSLESS reference-replacement (compress.go): remplace les spans répétés (1..8 mots) par
//     un handle §N réversible; Retrieve(Compress(x)) == Normalize(x) EXACTEMENT
//     (TestLosslessRoundTrip). Mode DÉTERMINISME-SAFE: le gate reste invariant par construction.
//   - LOSSY restatement-drop (lossy.go): supprime des redites déclarées; NON byte-réversible;
//     la fidélité des faits porteurs est ASSERTÉE (TestLossyPreservesCarriers), jamais supposée.
//
// MESURES (estimateur ~4 char/token, ratios fiables / absolus approximatifs):
//
//	prompt              tokens  ->  après(lossless)  réduction  porteurs perdus  round-trip
//	context_pack         385         347              9.9%       0                exact
//	transcript           317         282             11.0%       0                exact
//	large_session       6578        1045             84.1%       0                exact   <- cible
//
// Les 10 faits porteurs (goal_id, bounded_context, 2 miroirs rouges, allowed_paths, le mur
// /kernel/** + /mirror/**, le contrat croisé PaymentGateway@hash, la stop condition, le
// pack_hash) sont TOUS préservés dans les deux modes.
//
// VERDICT: GO. Sur le prompt réaliste (session longue ré-envoyant le pack + le transcript
// grossissant — la cible de headroom), le reference-replacement BYTE-LOSSLESS atteint 84.1% de
// réduction en préservant tous les faits porteurs et en round-trippant exactement (donc le
// déterminisme du GateAction est garanti sur ce mode). Un mode déterminisme-safe existe → on
// poursuit vers HR02 (ADR « compression replaceable » + port ContextCompressor).
//
// OPENQUESTIONS (gaps non résolus — provenance, jamais comblés en douce):
//
//	OQ-HR01-1 mode lossy / 60–95%: les gains élevés annoncés exigent une summarization LOSSY
//	  (sémantique, LLM) non byte-réversible. Elle ne doit PAS toucher la boucle tant que HR03
//	  ne l'aura pas encadrée d'un miroir property de fidélité des faits porteurs + invariance du
//	  verdict GateAction. Le probe prouve seulement que le mode lossless suffit déjà au plancher.
//	OQ-HR01-2 tokenizer: heuristique ~4 char/token (tiktoken/claude indisponible offline);
//	  HR03/HR04 recomptent avec le tokenizer réel du provider.
//	OQ-HR01-3 adaptateur réel: ce probe MODÉLISE headroom (reference-replacement), il n'appelle
//	  pas le MCP headroom réel; HR03 branche l'adaptateur derrière le port HR02 et re-mesure.
//	OQ-HR01-4 petits prompts: sur un appel isolé (~300–400 tokens) le gain lossless est modeste
//	  (~10%); headroom ne paie que sur le CONTEXTE CUMULÉ. HR04 doit compresser l'entrée cumulée
//	  envoyée au modèle, pas chaque petit fragment.
//
// REPRODUIRE: `cd spike/headroom && go test ./... && go run ./cmd/verdict`.
package headroom
