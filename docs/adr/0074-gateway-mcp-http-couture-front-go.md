# ADR 0074 — La gateway MCP HTTP est la couture front↔Go (lancée + `AIDOS_GATEWAY_HTTP_URL` + flotte MCP enregistrée + e2e anti-fallback-silencieux)

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §1 (Mandat B) · §2 (le mur — seul le Go écrit la vérité) · §3 (pile gelée : MCP = Go MCP SDK, *every backend op = un MCP tool, no exception*) · §4 (`back/mcp/<server>`, `back/runtime/gateway/`) · §6/§8 (determinism-first) · ADR 0009 (chaque op backend exposée comme tool MCP) · ADR 0072 (décision-mère : le front *appelle* le moteur ; twins = aperçu/fallback gouverné) · ADR 0073 (truth-store live) · audit `w91305w3q`

## Contexte

ADR 0072 oblige le front à *appeler* le moteur Go pour toute opération de vérité, et ADR 0073 fait de Postgres la vérité live. Reste la **couture** : par où le Next parle-t-il au Go ?

Preuves de l'audit `w91305w3q`. La flotte Go existe — `back/mcp/` contient ~90 serveurs (`store`, `changeset`, `dag`, `idea-intake`, `mirror-runner`, `memory`, `context`, …) et la gateway `back/runtime/gateway/` est écrite et verte (`gateway.go`, `registry.go`, `authgate.go`, tests + property test). Mais **`.mcp.json` enregistre 0 serveur Go** (uniquement github, context7, postgres, trivy, playwright, mintlify, linear) ; `front/web/app/bootstrap/mcp.ts` porte un `callGateway` qui n'a pas de gateway à appeler ; aucune variable d'env ne pointe le Next vers une gateway lancée. Conséquence : le front retombe **silencieusement** sur ses twins TS (ADR 0072 §3), donnant l'illusion que les écrans sont « live » alors qu'ils tournent en local. C'est à la fois un défaut de fallback (silencieux, donc non gouverné) et le verrou qui bloque le branchement des ~90 MCP et de tout `runtime/`/`kernel/`.

## Décision

**La gateway MCP HTTP (`back/mcp/gateway` / `back/runtime/gateway`) est la couture officielle front↔Go : elle est lancée en HTTP à côté de `next start`, son URL est exportée au runtime Next via `AIDOS_GATEWAY_HTTP_URL`, la flotte Go est enregistrée dans `.mcp.json` / la registry, et un e2e ÉCHOUE si un écran retombe silencieusement en twin.**

1. **La gateway tourne en HTTP, à côté de `next start`.** Le processus `back/mcp/gateway` est lancé avec `AIDOS_GATEWAY_HTTP_ADDR=:8787` (port par défaut, paramétrable) dans le même déploiement que le Workbench (cf. la route publique :3000 → host). C'est l'unique point d'entrée HTTP par lequel le front atteint le moteur Go.

2. **Le Next connaît l'URL.** `AIDOS_GATEWAY_HTTP_URL` est exporté au runtime Next ; `front/web/app/bootstrap/mcp.ts::callGateway` l'utilise pour router chaque opération de vérité vers la gateway. Aucune opération de vérité ne s'exécute dans le navigateur ou dans le serveur Next (ADR 0072 §4).

3. **La flotte Go est enregistrée.** Les serveurs Go (`store`, `changeset`, `dag`, `idea-intake`, `mirror-runner`, `memory`, `context`, … — la flotte `back/mcp/`) sont déclarés dans `.mcp.json` / la registry `back/runtime/gateway/registry.go`, derrière la gateway. Conformément à ADR 0009 (CLAUDE.md §3), **chaque op backend est un tool MCP, sans exception** : la gateway expose ces tools au front. La registry est l'autorité de ce qui est joignable ; un écran ne déclare pas « live » un service absent de la registry (croise ADR 0080, sondes de stack).

4. **Le mur tient à la couture (§2).** La gateway n'ouvre pas une porte de write sur la vérité : les écritures kernel/mirrors/fitness passent par les gestes Go gouvernés (idée → miroir → /goal → approbation) et les GRANTs Postgres (seul le rôle `aidos` écrit la vérité). La gateway authentifie/autorise (`authgate.go`) ; elle achemine, elle ne contourne pas.

5. **L'e2e anti-fallback-silencieux (non-négociable).** Un test e2e Playwright **échoue si un écran retombe en twin sans le déclarer**. Le fallback twin (ADR 0072 §3) reste permis **uniquement gouverné** : (a) le moteur est constaté injoignable, (b) l'écran l'affiche explicitement (bandeau « mode aperçu / moteur injoignable »), (c) aucune écriture de vérité n'est tentée en mode twin. Un fallback silencieux — l'écran prétend « live » mais sert le twin — est le défaut que cet e2e attrape. Symétriquement, une **fault-injection** coupe la gateway et asserte que l'écran bascule en mode aperçu *déclaré* (jamais une fausse confirmation).

## Conséquences

- **Positif.** La couture front↔Go existe enfin : le Next appelle réellement le moteur (ADR 0072 honoré), la vérité Postgres devient atteignable depuis l'écran (ADR 0073 honoré). Débloque les ~90 serveurs MCP et tout `runtime/`/`kernel/` — c'est le verrou high du plan. L'e2e anti-fallback-silencieux transforme le fallback d'un mensonge d'écran en un état **gouverné et visible**. ADR 0009 respecté de bout en bout (chaque op = un tool, joignable via la gateway).
- **Coûts assumés.** (a) Le déploiement gagne un processus à superviser (la gateway HTTP à côté de `next start`) — il faut un healthcheck et une supervision (redémarrage). (b) La latence d'un appel réseau remplace l'appel local du twin pour les ops de vérité (acceptable : le twin reste l'aperçu optimiste local). (c) Le contrat d'API de la gateway (les tools exposés, leurs schémas) devient une surface à versionner — gouvernée par la registry.
- **OpenQuestions (forward-deps, ne bloquent pas).** Le découpage exact des serveurs derrière la gateway (un process par serveur vs gateway monolithique embarquant la flotte) et la stratégie d'auth front→gateway en prod (jeton de session vs mTLS interne) seront affinés au branchement ; le périmètre des tools exposés suit la trim/doc d'ADR 0081.
- Le mur et le determinism-first sont **inchangés** ; la gateway les *transporte* — elle achemine les appels du front vers les gestes Go autoritatifs, et rend tout fallback explicite plutôt que silencieux.
