# ADR 0035 — HR02 ContextCompressor: la compression de contexte est un outil REPLACEABLE derrière un port

- Status: Accepted
- Date: 2026-06-04
- Step: HR02 (`back/runtime/context`)
- KRD: §84 (spike-gate), §141–§145 (ContextRouter / ContextPack), §119.3 (progressive disclosure), CLAUDE.md §2 (le mur), §3 (slots gelés, `replaceable`), §6/§8 (determinism-first)

## Contexte

HR01 a prouvé, par un spike confiné (`/spike/headroom/`, ratchet OFF, T0, jetable), que
`retrieve∘compress` sur des prompts AIDOS réels (ContextPack S33, transcript BA17, grand
contexte) :

- réduit les tokens **avant le LLM** sans relever le cap (385→347 ; 317→282 ; 6578→1045 en
  reference-replacement byte-lossless) ;
- est **byte-lossless** en mode référence (`Retrieve(Compress(x)) == Normalize(x)` exact) ;
- préserve les **10 faits porteurs** (goal, 2 miroirs rouges, mur `/kernel|/mirror`,
  allowed_paths, contrat croisé, stop condition, pack_hash) en lossless ET lossy ;
- est **déterministe** (même entrée → même verdict/compress/dictionnaire, rejoué 100×).

Verdict HR01 : **GO**. HR02 grave le **contrat** (le port) sans encore brancher l'outil
externe (`chopratejas/headroom`, branché en HR03 derrière ce même port).

## Décisions

1. **La compression de contexte est un slot `replaceable` (CLAUDE.md §3), JAMAIS un slot
   gelé.** L'outil concret (`headroom` ou un autre) est branché **derrière un port Go**
   `ContextCompressor` ; on peut le remplacer par un ADR sans toucher l'appelant
   (`agentloop.Drive`, HR04). C'est un *adaptateur*, pas une vérité.

2. **Le port a exactement deux opérations, totales et pures côté contrat :**
   `Compress(pack) → (Compacted, Handle)` et `Retrieve(handle) → original`. Le `Handle`
   est l'état réversible (le dictionnaire CCR du spike) — il accompagne le compacted, il
   ne vit pas ailleurs. L'identité du contrat est **`Retrieve(Compress(x)) == x`** (à la
   normalisation des espaces près, comme le rendu de prompt le ferait de toute façon).

3. **Le port ne s'applique QUE sur l'entrée LLM** (le ContextPack rendu + le transcript),
   **jamais** sur les entrées déterministes ni le truth-store. Il étend la marge **sous**
   le cap budget (HR04), il ne relève jamais le cap. La compression LLM-input est
   l'**exception gatée** de determinism-first : elle n'est jamais autoritaire ; le verdict
   du gate (HR03) doit rester invariant à la compression.

4. **Le port est PUR et au-dessous de la ligne (le mur, CLAUDE.md §2).** Il lit le prompt
   qu'on lui passe et rend un compacted + un handle ; il n'écrit **aucune** vérité
   (`kernel`/`mirrors`/`fitness`), n'a ni DB, ni horloge, ni rng, ni I/O, ni LLM dans le
   contrat. L'adaptateur HR03 (sidecar MCP) fera les I/O ; le **port** reste une interface
   + une **implémentation de référence déterministe** (l'`IdentityCompressor` ci-dessous)
   que le miroir property certifie.

5. **HR02 livre une implémentation de référence déterministe, pas l'outil externe.** Pour
   que le contrat soit testable *avant* HR03 (bootstrap, CLAUDE.md §6 forward-dependency),
   HR02 fournit un `ReferenceCompressor` — la reference-replacement réversible du spike,
   reconstruite *proprement* dans `back/` (le spike ne gradue pas ; `/harvest` propose, le
   code est reconstruit). Il est **byte-lossless** : c'est l'implémentation par défaut du
   port, et l'invariant `Retrieve∘Compress = identité` y est prouvé. *OpenQuestion
   OQ-HR02-lossy : le mode lossy (gain plus fort, faits porteurs préservés mais
   non-byte-lossless) sera porté en HR03/HR04 derrière le même port s'il s'avère
   nécessaire ; HR02 ne grave que l'invariant lossless, le plus fort, comme contrat.*

6. **L'`Handle` est idempotent et auto-suffisant.** `Compress` est déterministe (mêmes
   handles, même ordre stable) : recompresser un prompt déjà compacté avec son handle est
   l'identité (rien de nouveau à collapser sous le handle existant) ; `Retrieve` d'un
   handle vide rend le texte tel quel. Le miroir property épingle ces deux bords.

## Conséquences

- HR03 branche `headroom` (via son MCP) comme un second adaptateur de `ContextCompressor`
  et prouve le **miroir d'invariance** : `GateAction` invariant à la compression.
- L'appelant (HR04, `agentloop.Drive`) dépend de l'**interface**, jamais d'un outil
  concret — substitution par ADR, sans réécriture.
- Le mur est intact : le port lit, ne grave rien ; le cap budget n'est jamais relevé.

## OpenQuestions

- **OQ-HR02-lossy** : le mode lossy reste à porter en HR03/HR04 ; HR02 grave l'invariant
  lossless seul (contrat le plus fort).
- **OQ-HR02-linear** : le `linear-server` MCP n'est pas authentifié dans cette session
  (OAuth requis) ; l'issue `HR02 · …` n'a pas pu être déplacée en `In Progress`/`Done`
  par l'agent — à faire au prochain run authentifié (CLAUDE.md §11, best-effort).
