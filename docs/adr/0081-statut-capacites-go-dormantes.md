# ADR 0081 — Statut des capacités Go dormantes : par package, brancher OU documenter comme oracle-de-test gouverné OU /trim

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §1 Mandat A (« une vérité sans miroir est un monstre » — une capacité sans chemin vivant est un monstre symétrique) · §5 (« un hook qui ne tire jamais est mort » — généralisé à toute capacité jamais appelée) · §6/§8 (déterminisme-first ; le Stop §8 « done » calculé dépend du MutationRunner) · ADR 0072 (décision-mère : le Go est la **référence** ; une capacité Go non branchée côté Workbench peut rester un *oracle-de-test gouverné*, byte-égal à brancher plus tard) · steps S40 (MutationRunner), S42 (EvolutionSandbox), S43 (reality-ingest / telemetry) ; le geste `/trim` (S41) qui *propose* sans détruire

## Contexte

L'audit `w91305w3q` (2026-06-15) a inventorié des **capacités Go orphelines** : du code qui compile et passe ses tests mais n'a **aucun chemin d'appel vivant** — ni depuis le Workbench, ni depuis un hook, ni depuis un MCP enregistré. C'est le **monstre symétrique** de l'orphan-mirror du Mandat A : non pas une vérité sans miroir, mais une capacité sans usage. §5 le nomme déjà pour les hooks (« un hook qui ne tire jamais est mort ») ; l'audit généralise le diagnostic à tout package jamais importé hors test.

Preuves vérifiées (`rg` non-test sur `back/`) :
- **MutationRunner (S40)** : `back/runtime/sensors/mutation/` existe (runner, gate, fault-injection) mais `rg -ln "sensors/mutation"` sur `back/hooks back/cmd back/runtime/release` → **0 hit** : la passe de mutation n'est branchée dans **aucun chemin de Stop**. Or le Stop §8 (« done » = red→green ∧ prior green ∧ **mutation ≥ seuil** ∧ no monster) **en dépend** : sans ce branchement, le critère « done » est incomplet.
- **reality-ingest / telemetry (S43)** : `back/mcp/reality-ingest/main.go` existe mais `rg "reality-ingest" back/runtime/gateway/registry.go .mcp.json` → **0 hit** : le serveur n'est enregistré ni dans la registry ni dans `.mcp.json`. L'on-ramp prod→kernel (le seul chemin légal de la réalité vers une idée, `/learn`) est dormant.
- **EvolutionSandbox (S42)** : la quarantaine `/evolve` est câblée mais le producteur de candidats reste un stub (cf. ADR 0087) ; le sandbox lui-même attend son point d'entrée vivant.
- **Candidats trim/doc (aucun importeur non-test)** : `back/runtime/endpointfitness`, `back/runtime/debt/trim`, `back/archive/brain/contextgraph`, `back/runtime/backup`, `back/runtime/checkout`, `back/runtime/connectordeclare` + `connectorinfra` + `connectorenforce` (+ `connectoraudit`), `back/runtime/deploycockpit`, `back/archive/curation`, `back/runtime/reality/workbenchgraph` — chacun confirmé sans importeur hors test.

Laisser ces packages dans le flou crée des monstres (§1) et de la dette de surface de vérité. Chaque package a besoin d'une **décision binaire et tracée**, pas d'un « peut-être un jour ».

## Décision

**Chaque capacité Go dormante reçoit, par package, l'une de trois issues exactement : (A) BRANCHER à son point d'entrée vivant, (B) DOCUMENTER comme oracle-de-test gouverné (ADR 0072 — le Go est la référence, byte-égal, à brancher plus tard), ou (C) /trim (proposer la réduction, jamais détruire en silence).**

1. **À BRANCHER (issue A) — capacités dont un chemin vivant existe et est requis :**
   - **MutationRunner (S40)** → branché dans le chemin de **Stop §8** : la passe de mutation alimente le critère « done » (`mutation ≥ seuil`). Tant qu'elle n'est pas branchée, le « done » calculé est incomplet — c'est un blocage du contrat KRD, pas une option. Branche : le binaire `back/hooks/stop` + le gate `back/runtime/sensors/mutation` (cf. ADR 0075, les hooks build-agent qui tirent vraiment).
   - **reality-ingest / telemetry (S43)** → enregistré dans `back/runtime/gateway/registry.go` + `.mcp.json` (cf. ADR 0074, la gateway MCP HTTP) : l'on-ramp prod→kernel devient appelable, `/learn` a sa porte. Dépend d'ADR 0076 (OTel→Postgres : les spans persistés que reality-ingest lit).
   - **EvolutionSandbox (S42)** → branché à son point d'entrée `/evolve` (le producteur de candidats reste spike-gated derrière son seam, ADR 0087 ; le sandbox de quarantaine, lui, est relié).

2. **À DOCUMENTER comme oracle-de-test gouverné (issue B) — capacités qui sont la RÉFÉRENCE Go (ADR 0072).** Un package non branché côté Workbench n'est pas forcément mort : sous ADR 0072, le **Go est la référence**, byte-égal au twin TS, prouvé par miroir différentiel. Un tel package reste un **oracle** légitime (il valide le twin, il sera branché quand le chemin Workbench le réclamera) — à condition d'être **explicitement documenté** comme tel (un commentaire de package + une entrée ADR/CONTEXT), avec son miroir différentiel. Sans cette documentation, c'est un monstre ; avec, c'est une référence gouvernée.

3. **À /trim (issue C) — candidats sans chemin vivant ni rôle d'oracle :** `endpointfitness`, `debt/trim`, `archive/brain/contextgraph` (le front a déjà son `lib`), `runtime/backup`, `checkout`, `connectordeclare`/`connectorinfra`/`connectorenforce`/`connectoraudit`, `deploycockpit`, `archive/curation`, `reality/workbenchgraph`. Pour chacun, le geste **`/trim` (S41) PROPOSE** la réduction — il **ne détruit rien** : chaque proposition est l'ouverture d'une idée (`idée → miroir → /goal → approbation`), tracée comme un changeset, jamais un `rm` direct (§9 anti-overwrite). Un candidat trim peut être *sauvé* en issue A ou B s'il révèle un chemin vivant à l'examen.

4. **Le verdict par package est tracé.** Chaque package dormant porte sa décision (A/B/C) dans cet ADR et/ou son `CONTEXT.md` ; aucun ne reste « à trancher ». La règle anti-Goodhart : on ne déclare pas « branché » — on le **prouve** (un importeur vivant, un test de fault-injection qui tire, ou une proposition `/trim` tracée).

## Conséquences

- **Positif.** Les monstres « capacité sans chemin vivant » (§1, §5 généralisé) reçoivent chacun une issue binaire et tracée. Le critère « done » du Stop §8 redevient complet une fois le MutationRunner branché (le plus structurant : sans lui le done est faux). L'on-ramp prod→kernel (reality-ingest/`/learn`) cesse d'être dormant. La surface de vérité morte est *proposée* à la réduction par `/trim` sans jamais être détruite en silence (§9). ADR 0072 donne une troisième voie honnête (l'oracle-de-test gouverné) qui évite de trimer du code-référence utile.
- **Coûts assumés.** (a) Brancher MutationRunner/reality-ingest/EvolutionSandbox dépend d'ADR 0075 (hooks) + ADR 0074 (gateway/registry) + ADR 0076 (OTel→PG) — forward-deps assumées, séquencées (étapes 2, 3, 5 de `PLAN-branchements.md`). (b) Chaque package « issue B » doit gagner sa documentation d'oracle + son miroir différentiel, sinon il bascule monstre. (c) Les `/trim` proposés ne suppriment rien immédiatement : la réduction effective passe par `idée → /goal → approbation` — la dette est *actée et tracée*, pas effacée d'un trait. (d) **OpenQuestions** (forward-deps, ne bloquent pas) : le seuil de mutation effectif (déclaré, jamais appris, §8) ; le format exact de la documentation d'oracle (commentaire de package vs entrée CONTEXT.md) ; le producteur self-play d'EvolutionSandbox (ADR 0087, spike-gated).
- Le mur, le déterminisme-first et l'anti-overwrite (§9) sont **inchangés** ; aucune capacité n'est détruite par cette décision — elle ne fait que sortir chaque package du flou (branché / oracle gouverné / trim proposé).
