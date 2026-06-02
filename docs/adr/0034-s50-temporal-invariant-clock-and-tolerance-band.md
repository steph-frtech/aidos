# ADR 0034 — S50 TemporalInvariant: the clock-required rule and the one-sided tolerance band

- Status: Accepted
- Date: 2026-06-02
- Step: S50 (`back/kernel/temporal`)
- KRD: §49.3 (TemporalInvariant — "toute vérité temporelle doit déclarer son horloge"), §44.5 (BlockReason), §13.4 (truth_kind), §778/§796 (Tome verdicts on temporal mirror forms)

## Contexte

KRD §49.3 décrit le `TemporalInvariant` — une vérité dont la propriété dépend du temps
(délais, ordre des événements, expiration, retries, timeouts, idempotence, eventual
consistency) — comme un YAML minimal :

```yaml
TemporalInvariant:
  property: "payment_captured implies order_confirmed within 5 minutes"
  clock: system | external | logical
  tolerance: ...
  mirror: statechart | TLA+ | UPPAAL
```

`tolerance: ...` est laissé **opaque** par §49.3. Quatre branches devaient être tranchées
avant d'écrire le moindre code, et plusieurs ne sont pas épinglées par le Tome — elles
sont donc décidées ici (et tracées comme OpenQuestions là où §49.3 ne tranche pas).

## Décisions

1. **La règle de l'horloge obligatoire est portante.** `Validate` **refuse** un invariant
   temporel sans horloge déclarée (horloge vide) — c'est la loi §49.3 « toute vérité
   temporelle doit déclarer son horloge ». Le cas « horloge absente » (`ErrMissingClock`)
   est distingué du cas « horloge hors-enum » (`ErrUnknownClock`), exactement comme S14
   distingue `missing-truth-kind` de `unknown-truth-kind`.

2. **La bande de tolérance est appliquée exactement une fois, et elle est UNILATÉRALE pour
   une relation `within`.** §49.3 ne fixe pas la symétrie. Pour un **délai** (`within`),
   la lecture conservatrice est : on viole une échéance en étant **en retard**, jamais en
   étant en avance. Donc `elapsed ≤ bound + tolerance ⇒ held` ; `elapsed > bound +
   tolerance ⇒ violated`. La borne est **inclusive** (`5m` et `5m+10s` sont `held` ; une
   nanoseconde au-delà est `violated`). Si une future relation symétrique apparaît
   (p. ex. « exactement à T ± tolérance »), elle ajoutera une branche `Relation`, sans
   changer celle-ci (additif). *OpenQuestion OQ-S50-band-symmetry : §49.3 ne fixe pas la
   symétrie ; la décision unilatérale vaut pour `within`.*

3. **`temporal` n'est PAS un nouveau membre de `truth_kind` (§13.4).** §13.4 ne liste pas
   `temporal` ; on **n'invente pas** de membre d'enum (CLAUDE.md §8). La nature temporelle
   d'une vérité vit dans un **fragment `temporal` jsonb nullable** sur `kernel.truth`
   (discipline expand-only de S14, à l'identique) **et** dans la `cert_language` du miroir,
   jamais comme une `truth_kind` forgée.

4. **L'enum `cert_language` du `mirror_record` (S06) est ÉLARGI à `statechart` + `tla+`,
   pas `uppaal`.** Élargir un CHECK pour admettre **plus** de valeurs est expand-only
   (aucune ligne existante ne le viole). `uppaal` n'est **pas** ajouté à l'enum
   `mirror_record` : aucune ligne ne l'utilise encore, et un membre d'enum mort est un
   monstre (§5 hook-honesty appliqué aux membres d'enum). L'enum Go `MirrorForm` connaît
   les trois (c'est l'enum §49.3) et le CHECK du fragment `temporal` sur `kernel.truth`
   admet les trois ; seul l'enum `cert_language` du `mirror_record` est élargi aux deux
   formes qu'une ligne utilisera réellement (`uppaal` sera ajouté au pas qui persiste un
   miroir temps-réel dur catastrophique, §778).

5. **Une horloge `logical` ne porte pas de tolérance murale (non nulle).** Une horloge
   logique compte des pas causaux, pas des secondes ; une tolérance `10s` sur une horloge
   `logical` est une contradiction et est refusée. *OpenQuestion OQ-S50-logical-tolerance :
   §49.3 ne fixe pas la sémantique d'une tolérance sur une horloge logique ; la lecture
   conservatrice est de refuser le couple plutôt que de le coercer silencieusement.*

6. **Cette étape ne lit AUCUNE horloge réelle.** `Evaluate` est pure : le datum `elapsed`
   et l'ordre des événements sont **passés** via l'`Observation`. Le champ `clock` **nomme**
   l'horloge que le runtime échantillonnera **plus tard** ; il ne l'échantillonne pas ici
   (determinism-first, CLAUDE.md §6/§8). Le miroir de reproductibilité (même (invariant,
   observation) ⇒ même verdict) le prouve.

## Conséquences

- Le code `TEMPORAL_INVARIANT_VIOLATED` est un code d'évaluation **local** (comme
  `sagas.CodeSagaInvariantViolated`), réutilisant la **forme** S13 du BlockReason — il
  n'est **pas** ajouté à l'enum fermé `runtime/blockreason.Code` (ce serait un ChangeSet +
  SemanticDiff ; il nomme une décision de runtime, pas une écriture du mur).
- La migration est expand-only / append-only : fragment `temporal` nullable + CHECK
  élargi ; aucune ligne existante n'est touchée, aucun GRANT n'est modifié (le mur tient,
  l'agent reste SELECT-only sur `kernel.truth` et `mirrors.mirror_record`).
- Hors périmètre (étapes ultérieures) : le sensor runtime qui échantillonne l'horloge
  déclarée et alimente les `Observation`, et tout model-checker TLA+ / UPPAAL.
