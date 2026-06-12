# DP06 — l'ensemble clos `scope.Environment` s'élargit à 5 (addendum ADR 0006 : Doltgres hors prod uniquement)

- Status: accepted
- Date: 2026-06-13
- Step: DP06 (piste DP — provisioning & déploiement réel, EPIC B)
- Amends: ADR 0006 (emitted-app datastore = Doltgres) — **addendum**, résout son OPEN QUESTION « défaut vs opt-in » ; étend l'ensemble clos S15 `scope.Environment`.

## Contexte

Deux décisions couplées (Amendements A1 + A6 du roadmap `ROADMAP-provisioning-deploy.md`)
devaient s'ouvrir **au-dessus du mur avant DP06** — elles atterrissent ensemble, dans le
même ChangeSet, parce que la seconde (le gate par environnement) n'a de sens qu'avec la
première (l'environnement comme dimension de scope complète) :

1. **A6 — élargir `scope.Environment`.** S15 a gravé l'ensemble clos `{prod, staging, dev}`
   (KRD §13.7 verbatim). La piste DP a besoin de `local` (la machine du développeur) et de
   `future_cloud` (la portabilité managée, EPIC G) — **la spec canonique
   `docs/plan/SPEC-stack-2026.md` (gravée verbatim par l'humain) déclare déjà
   `stack{environments local/dev/staging/prod/future_cloud, …}`** : la vérité est la
   sienne, ce pas ne fait que l'enforcer. Changer un ensemble clos asserté en aval
   (`scope_property_test.go` flip 3→5) est un **changement de vérité** : idée → miroir →
   /goal → approbation — l'approbation humaine est la spec gravée elle-même.
2. **A1 — Doltgres hors prod uniquement.** ADR 0006 adoptait Doltgres comme datastore de
   l'app émise en laissant « défaut vs opt-in » en OPEN QUESTION, **sans gate par
   environnement**. La spec canonique tranche, verbatim : « **PostgreSQL = la prod.
   Doltgres = hors prod uniquement.** » (SPEC-stack-2026, principes non négociables ;
   niveau 3 « hors prod » liste Doltgres). Le miroir DP06 peut donc graver le refus
   `prod` + Doltgres — il n'aurait PAS pu sans cet addendum (un miroir ne fige jamais
   une décision non actée).

## Décision

1. **`scope.Environment` devient l'ensemble clos à CINQ membres**
   `{prod, staging, dev, local, future_cloud}` — extension **ADDITIVE** : l'ordre
   canonique existant (`prod, staging, dev`) est préservé en préfixe, les deux nouveaux
   membres sont APPENDUS. Aucune vérité scopée existante n'est invalidée (le SemanticDiff
   de l'extension classe **refine**, jamais override — prouvé au miroir). Le même
   ChangeSet met à jour `environmentOrder`, le message d'erreur de `ValidateShape`,
   `IsKnownEnvironment` (dérivé de l'ordre), `scope_property_test.go` (cardinalité 5 +
   loi d'additivité) et `migration_roundtrip` (round-trip jsonb des nouveaux membres —
   la colonne `scope jsonb` est sans contrainte d'énum : **aucune migration DDL**).
   `scope.Validate` reste fail-closed : une vérité active sans scope est toujours rejetée.
2. **Addendum ADR 0006 — Doltgres est NON-PROD uniquement (opt-in).** L'OPEN QUESTION
   « défaut vs opt-in » de 0006 est résolue : **Postgres est le défaut en `prod` et en
   `future_cloud` (managé) ; Doltgres est le défaut en `local`/`dev`/`staging`
   (git-for-data là où l'on itère) ; `prod` + Doltgres est REFUSÉ** — code de refus clos
   `DOLTGRES_NOT_ALLOWED_IN_PROD` (package-local, motif DP02 `UNKNOWN_SERVICE_ROLE`,
   pas un nouveau membre de l'enum gelé `blockreason`). Le slot reste `replaceable`
   par app **hors prod** (fallback plain-Postgres, ADR 0006 verbatim).
3. **Les bindings de connexion par environnement sont une PROJECTION below-the-line**
   (`back/runtime/envbindings`, DP06) : chaque environnement déclare datastore défaut +
   autorisés, motif d'URL (références `${VAR}` **uniquement** — `${APP_NAME}`,
   `${DOMAIN}`, `${APP_PORT}`, `${MANAGED_URL}` — jamais une valeur), TLS, réseau,
   managé. La projection est une fonction pure totale, content-adressée via
   `records.Hash(records.Canonicalize(...))` (S02 réutilisé, jamais forké) ; l'Environment
   résolu est une projection, **jamais une source** (fork DP06 du roadmap, recommandation
   retenue).

## Conséquences

- DP07 (`resolveConnection`) et DP11 (profils, `non-prod` + `prod` ⇒ Doltgres refusé) et
  DP15-DP18 (substrat Pulumi) consomment ce gate et ces bindings.
- Le rayon d'impact code : `back/kernel/scope` (enum élargi, additive), le nouveau
  `back/runtime/envbindings`, le jumeau TS `front/web/lib/environments.ts`, la route
  Workbench `/environments`. Le truth-store OS reste Postgres (ADR 0004) — intouché.
- **OpenQuestion (héritée de 0006, non tranchée ici) :** en `future_cloud`, le besoin
  vector/embedding (pgvector absent de Doltgres) reste réglé par sidecar Postgres ;
  la palette managée précise arrive à l'EPIC G — `future_cloud` est déclaré dès
  maintenant pour la portabilité, ses bindings sont `managed_url`-only.
