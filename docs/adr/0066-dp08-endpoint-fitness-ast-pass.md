# ADR 0066 — DP08 : EMITTED_NO_HARDCODED_ENDPOINT — la passe AST TS (TypeScript compiler API) + le jumeau lexer Go, branchés sur le senseur archfit S84

- Status: Accepted
- Date: 2026-06-13
- Step: DP08 (piste DP — provisioning & déploiement réel, EPIC B)
- KRD: CLAUDE.md §2 (le mur), §6/§8 (determinism-first), §5 (fault-injection), ADR 0036 (arch-fitness émis = slot dependency-cruiser), ADR 0040 (la construite est TS/Hono), SPEC-stack-2026 (« AUCUNE URL/secret en dur — tout par variables d'environnement »)
- Inputs: DP07 (`back/runtime/connresolve` — resolveConnection + EmitConnectionsModule), S84 (`back/runtime/buildloop/selfcert` — la batterie d'auto-certification, senseur `archfit`), `back/runtime/agentloop/arch-fitness.json` (la config déclarée above-the-line), A7 (audit du roadmap DP : « passe AST TS (ts-morph / le parseur FN05) — jamais un linter de motif ad-hoc, jamais un LLM-juge »)

## Contexte

DP07 a câblé la stack émise sans un endpoint en dur : tout motif résolu ne porte que des
références `${VAR}`, et le module de boot Hono reconstruit chaque URL depuis `process.env`
(`requireEnv` fail-closed). Mais une loi tenue par convention rot : un futur émetteur (ou
une édition manuelle de `gen/`) peut réintroduire un `localhost:5432`, une IP, un domaine.
DP08 grave la loi en **invariant arch-fitness enforcé** : `EMITTED_NO_HARDCODED_ENDPOINT`
— aucun host/URL/IP/host:port concret dans le source émis ; un littéral rougit le senseur
et **bloque la coupe**.

## Décision 1 — la détection est une passe AST TypeScript (compiler API), jamais un motif ad-hoc, jamais un LLM

Tool-search de l'étape (≤ 3 candidats, dans le slot gelé) :

| Candidat | Verdict |
|---|---|
| **TypeScript compiler API** (`ts.createSourceFile` + walk) | **RETENU** — déjà une dépendance du monorepo (`typescript@^5`, zéro dépendance nouvelle), le VRAI parseur du langage émis (la construite est TS, ADR 0040), AST complet (StringLiteral / NoSubstitutionTemplateLiteral / TemplateExpression avec `rawText`), déterministe |
| ts-morph | rejeté — un wrapper ergonomique AU-DESSUS du compiler API ; n'apporte ici que du poids (la passe ne fait que lire des littéraux) |
| regex/linter de motif seul | rejeté par A7 — un motif sans AST confond commentaires, code et littéraux, et ne voit pas la frontière `${expr}` d'un template |

La passe (`front/web/lib/endpoint-fitness.ts`) extrait chaque littéral via l'AST : les
parties brutes d'un template sont jointes par une **sentinelle** qui empoisonne
l'adjacence — un fragment dérivé de l'environnement (`${expr}` de template ou `${VAR}`
textuel) ne peut jamais compléter un host concret. Les littéraux **à l'intérieur** des
spans `${expr}` sont scannés aussi (la sémantique AST). Le classifieur applique quatre
raisons **closes**, déclarées : `localhost_literal`, `ip_literal`, `url_concrete_host`,
`host_port_literal`. Aucun LLM nulle part — un agent qui « jugerait si ça a l'air
hardcodé » serait un determinism gap.

## Décision 2 — le Go est le jumeau de parité ; les adresses sont épinglées

`back/runtime/endpointfitness` porte le même classifieur + un lexer TS déterministe à
sémantique AST-équivalente (templates, spans `${expr}` imbriqués, commentaires) : c'est
lui que la batterie S84 (Go) exécute. La parité est **épinglée par contenu** : l'arbre
émis canonique (module DP07 + worker) donne l'adresse verte
`43f2e914534d162173904514b6e5e0d916584092df50ce47944564a264a52970` et, leak injecté,
l'adresse rouge `5164a99a4a7d189cbbe25d0741ffee776720f841328e4c4c80e86e87d5546a0a` —
reproduites à l'octet par le jumeau vitest et l'e2e Playwright (un octet de dérive rougit
un miroir). `records.Canonicalize`/`records.Hash` (S02) réutilisés, jamais forkés.

## Décision 3 — la règle est déclarée above-the-line ; l'enforcement nourrit le senseur archfit S84 (le slot dependency-cruiser), fail-closed

La règle vit dans `back/runtime/agentloop/arch-fitness.json`
(`emitted_no_hardcoded_endpoint` : rule, sensor=archfit, raisons closes, formes
autorisées) — un test de parité épingle config ↔ code ; l'élargir ou l'adoucir est un
changement de vérité (idée → miroir → /goal), jamais une édition silencieuse.
L'enforcement suit le routage ADR 0036/S84 : `endpointfitness.SensorArchFit(tree)` projette
le verdict dans le senseur **`archfit`** de la batterie d'auto-certification
(`selfcert.Certify`) — le slot `dependency-cruiser` de l'arbre TS émis, dont la famille
in-process est le précédent gravé (`CheckEmittedFunctional` / `CheckLLMIsolation`). Un
verdict rouge ⇒ batterie rouge ⇒ **la coupe est bloquée** avant tout green
(anti-passthrough : un verdict manquant est rouge). Le BlockReason
`EMITTED_NO_HARDCODED_ENDPOINT` est actionnable (route_endpoint / re_emit / rerun aidos
check).

## Décision 4 — la fault-injection est le miroir du senseur (un hook qui ne tire jamais est mort)

Le done-criterion N1 est rejoué à trois étages : la property rapid injecte un littéral en
dur généré (URL-IP, localhost, IP nue, `<host>.sagedesk.fr:<port>`) dans un arbre vert →
rouge nommant le fichier, puis le retire → vert ; le jumeau fast-check rejoue la même loi ;
l'écran `/endpoints-fitness` porte le contrôle d'injection **exécutable** (sandbox — le
mur intact, rien n'est écrit) prouvé par l'e2e vert→injection→rouge→retrait→vert. La
property « un endpoint résolu via resolveConnection passe toujours » tient ∀ manifests
clos × 5 environnements (modules `EmitConnectionsModule` réels scannés verts).

## Conséquences

- Le cliquet structurel des endpoints existe : DP03–DP07 (« références, jamais des
  valeurs ») n'est plus une convention mais un senseur qui bloque la coupe.
- DP09 (cockpit environnements) lira le statut du senseur ; DP12 (bootstrap) et l'EPIC E
  (connecteurs) émettent sous ce cliquet.
- Limite honnête (OpenQuestion) : le lexer Go ne lexe pas les littéraux regex TS
  (`/.../`) — absents de l'arbre émis par construction ; la passe TS (AST réel) les voit.
  Si un émetteur futur émet des regex porteuses d'endpoints, étendre le lexer est un
  changement de vérité.
