# ADR 0080 — Sondes de stack par environnement + honnêteté des services : Windmill / connecteurs / Doltgres câblés OU déclassés pour que l'écran cesse de mentir

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §1 Mandat A (« une vérité sans miroir est un monstre » — un écran qui affiche « live » sans preuve est un monstre d'UI) · §6/§7 (`ui-completeness`, *tout se fait par écran* — un écran ne ment pas) · §8 (anti-Goodhart : « done » est calculé, pas déclaré ; un statut affiché doit être *sondé*, pas asserté) · ADR 0006 (Doltgres = datastore de l'app émise hors-prod, Postgres en prod) · ADR 0072 (décision-mère : le front Next *appelle* le moteur, les statuts de vérité ne sont jamais déclarés à la main) · ADR 0076 (le substrat émis réellement utilisé) · steps S59 (échelle environnements & couverture totale), DP06 (environment-set & Doltgres non-prod)

## Contexte

L'audit `w91305w3q` (finder 5, 2026-06-15) a démontré que l'écran `/v3/environnements` **ment** : il affiche des services comme « provisionnés » ou « live » alors que rien ne les sonde. Preuves dans le code (vérifiées) :

- `front/web/lib/v3/instance.ts` : `STACK_SERVICES` déclare des services avec un `level: 1` (« provisionné ») **codé en dur** dans la donnée, jamais issu d'une sonde. Trois mentent en particulier :
  - **Windmill** (`urlPattern: "http://windmill:8000"`, `level: 1`) — affiché provisionné alors que **0 conteneur** n'est déployé (cf. ADR 0076 : « 0 conteneur, affiché provisionné »).
  - **connectors** (`urlPattern: "http://mcp-gateway:3000"`, `level: 2`) — pointe sur un hôte `mcp-gateway:3000` **inexistant**, affiché comme atteignable.
  - **Doltgres** (`urlPattern: "doltgres://172.17.0.1:5433/%env%"`, `level: 1`) — une **URL fictive** : la db réelle déployée est `postgres:16-alpine` (`back/cmd/aidospulumi/materialise_hono.go:64`, `Image: "postgres:16-alpine"`), jamais doltgresql.

Le motif racine est un statut **asserté dans la donnée** plutôt que **sondé depuis la réalité**. C'est exactement ce que §8 interdit (« done » calculé, jamais déclaré) transposé à l'UI : un voyant vert qui ne provient pas d'une mesure est un **monstre** (§1, une affirmation sans preuve vivante). Le projet possède déjà le motif correct ailleurs : `provisionStatusAction` (la sonde réelle d'un déploiement). L'écran doit l'employer pour *tous* les services réseau.

## Décision

**Chaque `STACK_SERVICE` à `urlPattern` non vide est SONDÉ HTTP dans `/v3/environnements` (réutilisant le motif `provisionStatusAction`) ; son voyant reflète la sonde, jamais une donnée codée en dur. Les services qui MENTENT (Windmill, connectors, Doltgres) sont CÂBLÉS pour devenir vrais, OU explicitement DÉCLASSÉS (level-3 / relabel) pour que l'écran cesse de mentir.**

1. **La sonde est la source du voyant.** `front/web/app/v3/environnements/EnvsClient.tsx` interpole l'`urlPattern` (`%project%`/`%env%`) puis **sonde HTTP** chaque service à `urlPattern` non vide, exactement comme `provisionStatusAction` sonde un déploiement. Le `level` codé en dur dans `STACK_SERVICES` cesse d'être affiché tel quel : il devient une **borne attendue** que la sonde confirme (vert = sondé atteignable) ou contredit (rouge/gris = injoignable). Un service à `urlPattern` vide (`errors`, `tickets`, `git`) reste un placeholder honnête (level-2/3, jamais « live »).

2. **Windmill — câblé OU déclassé.** Soit le conteneur Windmill est réellement déployé par stack ou partagé (cf. ADR 0076, branche `pulumi_stack_hono.go`) et la sonde le voit vivant ; soit, tant que ce n'est pas le cas, Windmill est **déclassé level-3** (planifié, non provisionné) — plus jamais affiché « provisionné » à `level: 1`. Pas de voyant vert sans conteneur.

3. **connectors — câblé OU déclassé.** L'hôte `mcp-gateway:3000` est soit rendu réel (la gateway MCP HTTP d'ADR 0074, à son adresse effective, sondée vivante), soit le service `connectors` est **déclassé / relabelé** tant qu'aucune gateway ne répond. Plus de « live » sur un hôte inexistant.

4. **Doltgres — câblé OU honnêtement étiqueté postgres:16.** Conformément à ADR 0006 (Doltgres hors-prod, Postgres prod) et ADR 0076, soit l'image db non-prod devient réellement doltgresql sur le wire Postgres (`materialise_hono.go`, l'image `RoleDatastore`), et l'`urlPattern` Doltgres correspond à un endpoint réel sondé ; soit, tant que la db déployée reste `postgres:16-alpine`, l'écran **étiquette honnêtement « Postgres »** et retire l'URL `doltgres://…` fictive. L'écran ne nomme jamais un moteur qui n'est pas celui qui tourne.

5. **Le Go reste la référence (ADR 0072).** La sonde lit la réalité (un GET HTTP, un check de port) — c'est du déterminisme pur (§6), jamais un jugement. Le verdict d'honnêteté (« ce service ment ») est computé par la sonde, jamais déclaré par l'agent ou figé dans `STACK_SERVICES`.

## Conséquences

- **Positif.** L'écran `/v3/environnements` cesse d'être un monstre : tout voyant provient d'une **mesure**, pas d'une donnée codée en dur (§8, anti-Goodhart appliqué à l'UI). Les trois mensonges identifiés (Windmill, connectors, Doltgres) ont chacun une issue binaire et honnête : *câblé et sondé vivant*, ou *déclassé/relabelé*. Réutilise le motif `provisionStatusAction` déjà éprouvé (pas de réinvention, ADR 0007). Cohérent avec ADR 0076 (le substrat réellement utilisé) et ADR 0006 (Doltgres/Postgres).
- **Coûts assumés.** (a) `STACK_SERVICES` perd son `level` codé en dur comme *vérité affichée* ; il devient une borne attendue que la sonde valide — un seul point testé pour le drift d'interpolation `%project%`/`%env%`. (b) Câbler Windmill/connectors réellement dépend d'ADR 0076 (conteneurs) et ADR 0074 (gateway) — forward-dep assumée : tant qu'ils ne sont pas câblés, le déclassement honnête s'applique. (c) **OpenQuestions** (forward-deps, ne bloquent pas) : la fréquence/cache des sondes (pour ne pas marteler les endpoints) ; le timeout HTTP par service ; l'image Doltgres non-prod réelle (back-fill DP06 / ADR 0076).
- Le mur, le déterminisme-first et l'anti-Goodhart sont **inchangés** ; l'écran ne fait que cesser de mentir — un voyant n'est vert que parce qu'une sonde l'a vu vivant.
