# ADR 0038 — CE02 : la « boucle de capitalisation » — ce qu'on capitalise, par où, et la frontière (capitalisation ≠ apprentissage de critères ; tout via /goal)

- Status: Accepted
- Date: 2026-06-06
- Step: CE02 (Runtime — un ADR de décision épinglé au code par un miroir de parité ; aucun nouvel enforcer, aucune écriture de vérité)
- KRD: §84 (spike-gate CE01), §24.6 (behaviors-macro), §119.1 (MemoryFirewall), §82 (anti-passthrough), CLAUDE.md §2 (le mur), §6/§8 (determinism-first ; poids déclarés, jamais appris), §11 (Linear = tracker)
- Inputs: CE01 (spike confiné `/spike/compound/` — verdict **GO** calculé, jamais déclaré : paire similaire `order→invoice` 7800→1940 tokens = **75.1%** ↓, bien au-dessus du plancher 25% ; contrôle dissimilaire `order→migration` **16.6%** ≤ plafond 20% ⇒ pas de faux positif ; reproductible 100×)

## Contexte

CE01 a mesuré — par une **fonction pure**, sans aucun LLM (mandat determinism-first §6/§8) — que
**capturer le MOTIF d'un 1er goal terminé réduit réellement l'effort/tokens d'un 2ᵉ goal
SIMILAIRE**, sans fabriquer de réutilisation là où aucun motif n'est partagé. Le modèle
décompose un goal (idée→miroir→rouge→vert) en work-units ordonnées et montre que, sur la paire
similaire, **5 unités sont rejouées par recall procédural** (les gestes) et **2 par expansion de
behavior-macro** (la spec), l'unité **intrinsèque** restant toujours payée plein. Verdict :
**GO → poursuivre vers CE02**.

CE02 ne livre **pas** de code de runtime fonctionnel (la capture est CE03, l'expansion CE04, la
réutilisation par le router CE05) : il **grave la DÉCISION** — la **frontière de la boucle de
capitalisation** — en un ADR **accepté**, et il **épingle cette décision au code** par un miroir
de parité (`back/runtime/compound/capitalisation_adr_test.go`). Le document est une **projection**
de la table autoritaire `capitalisationTable` (`capitalisation.go`), jamais une affirmation
parallèle qui pourrait dériver.

## Décisions

1. **CE QU'ON CAPITALISE — le MOTIF durable, jamais la substance (2 sujets).** À la fermeture d'un
   goal, son **motif partagé** devient réutilisable, sur deux canaux, **tous deux VIA LE MUR** :

   | Sujet (clé code) | Disposition | Canal | Via le mur | Touche la fitness | Ce qu'on capitalise (et pourquoi le mur reste garant) |
   |---|---|---|---|---|---|
   | `gesture_pattern` | `capitalise` | `procedural_memory` | oui | non | Le motif de **GESTES** (charger le ContextPack, dériver le miroir, lancer les sensors, câbler le contrôle) devient un **recall PROCÉDURAL** (`KindProcedural`, S31) — fuel `/brain` **sous la ligne**. Le router (CE05/`MatchRole`) le rejoue pour abaisser l'effort du goal suivant (CE01 : 5 unités). « La mémoire propose ; le noyau déclare le vrai. » |
   | `spec_pattern` | `capitalise` | `behavior_macro` | oui | non | Le motif de **SPEC** (forme miroir/fixture/contrat) devient une **behavior-macro candidate** (§24.6) proposée via **`firewall.ViaIdea` → idée draft → miroir → /goal**. Son **expansion (CE04) est une FONCTION PURE et idempotente**, pas un apprentissage ; elle ne porte ni version ni miroir tant que `/goal` ne l'a pas figée (CE01 : 2 unités). |

2. **CE QU'ON NE TOUCHE JAMAIS — les FRONTIÈRES (3 sujets).** Trois choses sont **interdites** à la
   boucle ; aucune n'a de canal de capitalisation, aucune ne franchit le mur :

   | Sujet (clé code) | Disposition | Pourquoi c'est une frontière |
   |---|---|---|
   | `intrinsic_substance` | `forbidden` | La **substance propre** d'un goal (son opération spécifique, son intent unique) n'est **jamais** réutilisée — la capitalisation réutilise le **motif partagé**, pas le contenu intrinsèque. Fabriquer une réutilisation sans motif partagé est le **faux positif** que le contrôle dissimilaire de CE01 plafonne (16.6% ≤ 20%). Le goal suivant paie toujours plein son unité intrinsèque. |
   | `fitness_weights_criteria` | `forbidden` | La **fitness** (grammaire NIVEAU 3, waterline, définition de « passé », **poids**, **seuils**) n'est **jamais** touchée. **CAPITALISATION ≠ APPRENTISSAGE DE CRITÈRES** : les poids sont **DÉCLARÉS** au-dessus de la ligne, **jamais appris** (CLAUDE.md §8). La boucle rend le goal suivant moins cher ; elle ne change pas ce qui définit « réussi ». **C'est la frontière porteuse de CE02.** |
   | `direct_kernel_write` | `forbidden` | Écrire une vérité (`kernel`/`mirrors`) **directement** depuis la capture est **interdit** : **TOUT passe par /goal**. La seule porte est `firewall.ViaIdea` (idée → miroir → /goal → approbation humaine). Le `ToKernel` direct est toujours refusé (`MEMORY_CANNOT_DECLARE_TRUTH`) quelle que soit la confiance. **Aucun raccourci mémoire → kernel.** |

3. **LA FRONTIÈRE CLAIRE (la décision portée par cet ADR).** **Capitalisation ≠ apprentissage de
   critères.** La boucle *réutilise* un motif capturé pour rendre le goal suivant moins cher ; elle
   ne *modifie* **jamais** un poids, un seuil, la waterline, ni la grammaire de fitness — ces vérités
   sont **déclarées** au-dessus de la ligne (NIVEAU 3), jamais apprises. **Tout ce qui changerait une
   vérité passe par /goal** ; rien ne le contourne. L'invariant porteur, épinglé par le miroir de
   parité, est double : sur **chaque** ligne `capitalise`, **`ViaWall = true`** (aucun raccourci au
   kernel) **et** **`TouchesFitness = false`** (la fitness est intacte).

4. **LA DÉCISION EST DÉTERMINISTE ET ÉPINGLÉE AU CODE (determinism-first, CLAUDE.md §6/§8).** La table
   `capitalisationTable` (`back/runtime/compound/capitalisation.go`) est la **source autoritaire
   unique**, dérivée du verdict GO de CE01. Cet ADR en est une **projection** : `ADRParity()` dérive,
   sujet par sujet, exactement les lignes ci-dessus, et le **miroir de parité**
   (`capitalisation_adr_test.go`) vérifie — sans aucun LLM — que (a) les lignes de l'ADR égalent la
   table, (b) chaque ligne `capitalise` franchit le mur (`firewall.ViaIdea`) et ne touche pas la
   fitness, (c) chaque ligne `forbidden` n'a aucun canal et ne franchit pas le mur, (d) les compteurs
   du résumé (2 capitalise / 3 forbidden) égalent `Compute()`, et (e) **ce fichier ADR** existe, est
   **`Accepted`**, nomme chaque sujet + sa disposition, et **énonce la frontière verbatim** (« tout via
   /goal », la fitness jamais touchée, capitalisation ≠ apprentissage de critères). Un ADR `Proposed`,
   manquant, ou qui oublierait un sujet/la frontière passe **rouge**. Le document ne peut pas diverger
   du code.

5. **L'EXPANSION D'UNE BEHAVIOR EST UNE FONCTION PURE, PAS UN APPRENTISSAGE (determinism-first).** La
   behavior-macro candidate de `spec_pattern` (canal `behavior_macro`) s'**expanse** (CE04, §24.6) de
   façon **déterministe et idempotente** (même behavior → même expansion) en attributs/relations/
   opérations/policies/fixtures. Ce n'est **pas** un modèle qui apprend ; c'est une dérivation pure
   sous le mur. Choisir un LLM pour décider « quoi capitaliser » serait une **lacune de déterminisme**.

6. **CE02 RESPECTE LE MUR ET N'ÉCRIT AUCUNE VÉRITÉ.** CE02 écrit un ADR (document de décision,
   provenance) + un miroir de parité + un panneau Workbench (`/compound`, lecture seule au-dessus de
   la ligne ; il *rejoue* la table pure de la frontière, il ne *propose* rien à écrire). Aucune
   écriture dans `kernel`/`mirrors`/`fitness`. Le seul canal de capitalisation nommé,
   `firewall.ViaIdea`, est l'**unique porte légale** (idée → miroir → /goal).

7. **ÉLARGIR LA CAPITALISATION, APPRENDRE UN CRITÈRE, OU CONTOURNER /goal SONT DES CHANGEMENTS DE
   VÉRITÉ.** La liste (2 capitalise / 3 forbidden), les deux invariants porteurs (chaque `capitalise`
   via le mur ∧ aucun ne touche la fitness), et le statut `Accepted` sont des vérités **déclarées**
   (au-dessus de la ligne). Les modifier passe par **idée → miroir → /goal → approbation humaine**
   (CLAUDE.md §2), jamais par une édition silencieuse.

## Conséquences

- **CE03** livre la gesture/skill `/compound` (fin de goal) : capture le motif en **mémoire
  procédurale** (`KindProcedural`, S31) **+** propose une behavior candidate via `firewall.ViaIdea` —
  miroir fixture **rouge d'abord** : un goal vert produit une entrée procédurale + une idée draft
  `Status=proposed`, **aucune écriture kernel** (le mur).
- **CE04** complète les behaviors-macro (§24.6) : une behavior attachée s'**expanse** (fonction pure,
  dry-run, idempotente) sans créer aucune vérité hors /goal — miroir property **rouge d'abord**.
- **CE05** : le router/`MatchRole` (S33) réutilise behaviors+procédures aux goals suivants similaires
  + panneau `/agents` « Compounding » + e2e + 2 pages Mintlify.
- Le mur reste intact ; aucun des neuf `phases` du contrat de step n'est altéré (garde ajoutée,
  jamais retirée — méta-loop §5).

## OpenQuestions

- **OQ-CE02-similarity** : la « similarité » qui décide qu'un goal suivant est assez proche pour
  réutiliser un motif n'est **pas** opérationnalisée par CE02 (héritée d'OQ-CE01-2). C'est CE05
  (`MatchRole`, S33, similarité d'embedding S31) qui devra la **calculer** algorithmiquement — pas un
  prompt. CE02 fixe seulement *ce qui* est capitalisable et *par où*, pas *quand* réutiliser.
- **OQ-CE02-tokens** : les chiffres de CE01 (75.1% / 16.6%) sont des **estimations** calibrées sur la
  boucle §6, pas la mesure d'un vrai run agent (tokenizer provider indisponible offline,
  OQ-CE01-1). CE03+ devra re-mesurer le delta sur des runs /goal réels (télémétrie). L'ADR épingle le
  **mécanisme et son sens** (capture → replay via le mur), pas le chiffre absolu.
- **OQ-CE02-linear** : le `linear-server` MCP n'est pas authentifié dans cette session isolée (OAuth
  requis) ; l'issue `CE02 · …` (projet AIDOS `aidos-2a9085453be8`, label `adr`) n'a pu être
  créée/déplacée en `Done` par l'agent — à faire au prochain run authentifié (CLAUDE.md §11,
  best-effort, ne bloque pas le step).
