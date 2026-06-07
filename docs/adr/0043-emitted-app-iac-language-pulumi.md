# ADR 0043 — Langage Infrastructure-as-Code de l'app émise : Pulumi (TypeScript fonctionnel), adapté KRD

- **Statut :** proposed (tranché par le spike DP01/DP10 ; accepté à leur verdict go)
- **Date :** 2026-06-07
- **Contexte KRD :** piste DP (`ROADMAP-provisioning-deploy.md`), épics A/B/C/D/G. Tool-search par étape (CLAUDE.md §6).
- **Amende par référence :** ADR 0003 (frozen-stack — aucun slot « substrat de déploiement de l'app émise ») ; complète ADR 0040 (app émise = Hono/TS fonctionnel) + ADR 0036 (mandat fonctionnel FN02) + ADR 0006 (datastore).
- **Décision utilisateur :** « il faut un langage infra-as-code » (pas une simple spec YAML).

## Contexte

La piste DP doit provisionner/déployer l'**app émise** (la construite, Hono/TS — ADR 0040) sur plusieurs surfaces (local/dev/staging/prod, **future_cloud** demain), en restant **adapté KRD** : **SOURCE déclarée content-adressée au-dessus du mur** → **projection déterministe byte-stable** → artefact déployable ; conventions `/data/dockers` (Docker + **Traefik**) conservées ; portabilité « le code ne change pas, seules les vars d'env changent ». Contraintes dures : **pas de Coolify**, **pas de Drizzle imposé**, **Windmill (pas Temporal)**, **Postgres prod / Doltgres non-prod**.

La v1 de la roadmap DP fabriquait à la main un émetteur `docker-compose.yml` (YAML). L'utilisateur exige un **vrai langage IaC** : l'infra doit être **typée, composable, testable**, comme le reste du système — pas du YAML plat.

## Décision

**Le langage IaC de la construite est Pulumi en TypeScript fonctionnel** — *mandatory* (le slot ; l'impl peut évoluer dans le slot).

1. **Pulumi (TypeScript)** — IaC dans un vrai langage de programmation typé.
   - **Unifie la construite sur UN langage** : l'app (Hono/TS, ADR 0040) **et** son infra (Pulumi/TS) sont du **pur TypeScript fonctionnel**. Le **même** mandat FN02 / `EMITTED_FUNCTION_PURE` / `EMITTED_NO_GLOBAL_MUTABLE` gouverne l'infra émise comme l'app — cohérence KRD totale.
   - **Testable sans provisionner** : Pulumi permet des tests unitaires du programme d'infra (mocks) → **miroir-first s'applique à l'infra** (property/fixture sur le programme, pas seulement sur l'app).
   - **Un programme → toutes les cibles** : provider **Docker** (+ labels **Traefik**, réseau `traefik_default`) aujourd'hui ; **k8s / Fly / RDS / tout cloud** (future_cloud) demain — même programme, **stacks/config Pulumi par environnement** (réalise EPIC B Environment).
   - **Interop HCL/Terraform native (depuis janv. 2026)** : réutilise l'écosystème de providers **OpenTofu/Terraform** sans quitter le langage (reuse-don't-reinvent, ADR 0007) — couvre le provisioning cloud (managed Postgres, DNS, réseaux) à DP33.
   - **Resources/links Pulumi** = la couche de résolution déterministe → réalise EPIC B (mode de connexion par env), EPIC D (services-substrat), EPIC E (connecteurs comme resources).

2. **Reverse-proxy = Traefik v3** — *mandatory*, inchangé (OWNS `traefik_default` + 80/443). Le provider Docker de Pulumi pose les labels Traefik via un module KRD versionné reproduisant les conventions `/data/dockers`.

3. **State Pulumi = backend auto-hébergé** (pas Pulumi Cloud imposé) — gouvernabilité + self-hosted-first ; le state est un artefact below-the-line, scopé `project_id`.

### L'adaptation KRD (le cœur)

- **Pulumi n'est PAS la source de vérité.** La vérité reste le **StackManifest AST dans Postgres** (content-adressé, append-only, au-dessus du mur, idée→miroir→/goal). Le StackManifest **émet un programme Pulumi/TS pur fonctionnel** (below-the-line, projection régénérable, byte-stable, content-adressée) — le « Target compose » d'origine (DP03/DP05) devient **`TargetPulumiProgram`** (un émetteur déterministe de plus, ADR 0007/§S34).
- **Déterminisme (double garde) :** (a) l'**émission du programme** est byte-identique (miroir de reproductibilité, même StackManifest+phase → mêmes octets de programme TS) ; (b) le programme émis est **FN02-pur** (pas d'IO/horloge/RNG/global mutable — gouverné par l'arch-fitness émis EXISTANT) ; (c) le **plan Pulumi (`preview`)** est déterministe pour (programme, providers épinglés, state). L'agent **écrit le code d'infra au build**, il n'est jamais dans la boucle runtime (CLAUDE.md §8).
- **Le mur :** la sélection de version Pulumi/providers + le module Traefik sont des **déclarations above-the-line** (content-adressées) ; l'émission + `pulumi up` sont below-the-line.
- **« Tout est miroir »** : le programme d'infra a son miroir (property : ressources attendues présentes ; fixture : `preview` produit le plan attendu) — l'infra n'échappe pas à la complétude.

## Conséquences

- **Positif :** construite **TS de bout en bout** (app + infra) ; infra **typée + testable** (miroir-first) ; **portabilité future_cloud** depuis un seul programme ; Traefik + conventions `/data/dockers` conservées ; le déterminisme-gap de l'émetteur YAML maison disparaît (l'émetteur produit du TS gouverné par l'arch-fitness existant) ; slot *replaceable* (Pulumi est le choix, pas un verrou — interop HCL si besoin).
- **Coût/risque :** Pulumi est impératif → le risque de non-déterminisme est neutralisé **uniquement** parce que le programme est **émis** (jamais hand-écrit) + **FN02-pur** + miroir byte-stable ; dépendance au state Pulumi (auto-hébergé, scopé projet) ; courbe providers (mesurée au spike DP01/DP10).
- **Sur la roadmap DP :** DP03/DP05 → **émetteur StackManifest → programme Pulumi/TS** (+ module Traefik) ; EPIC B = **stacks/config Pulumi par env** ; EPIC D = **resources Pulumi** (Docker provider) ; DP33 = **providers cloud + interop HCL** depuis le même programme. **Score (ADR 0043 v1) est rétrogradé** en *alternative d'abstraction de workload* (interop possible, non primaire).

## Alternatives considérées

- **Score (`score.dev`)** (v1 de cet ADR) — spec de workload YAML déclarative, une-source-N-projections, très KRD-aligné conceptuellement, mais **ce n'est pas un langage** (l'exigence utilisateur) : pas de typage/composition/test programmatiques. Conservé comme **alternative d'abstraction** (un StackManifest pourrait émettre du Score) ou interop, non primaire.
- **KCL / Pkl** (langages de **config typés déclaratifs**, CNCF/Apple) — *replaceable*, l'option **puriste-déterministe** : constraint-based, sans IO (déterministes par nature), schémas typés + validations inline qui **mappent les sources typées + invariants de KRD**. Écartés en primaire car : simple **génération de config** (pas de moteur d'apply — il faut Kusion/un moteur derrière), LSP KCL encore immature, et ils **n'unifient pas** avec le plan TS de l'app. Réévaluables si l'on veut l'infra en déclaratif-typé pur.
- **OpenTofu / Terraform (HCL)** — le standard déclaratif ; **atteint via l'interop HCL native de Pulumi** (pas un slot séparé) ; *replaceable* si une équipe préfère HCL pur.
- **Pulumi en Go** — cohérent avec AIDOS-la-constructrice (Go), mais l'infra concerne la **construite** (TS, ADR 0040) → TS l'emporte pour unifier le plan émis.
- **Winglang** — **écarté : projet/startup fermé début 2026.**
- **Kamal 2** — exécuteur zero-downtime, mais **remplace Traefik par kamal-proxy** ; *replaceable* comme exécuteur seulement, jamais au prix de Traefik.
- **Coolify / Dokploy / Dokku** — Coolify exclu (besoin utilisateur) ; dashboards non déclaratifs/non content-adressés, incompatibles mur/déterminisme.

## Sources (tool-search, juin 2026)

- Pulumi (IaC in any language ; interop HCL janv. 2026 ; testabilité) : <https://www.pulumi.com/docs/iac/> · <https://github.com/pulumi/pulumi> · <https://www.pulumi.com/docs/iac/comparisons/opentofu/>
- KCL (CNCF, typé, constraint-based) : <https://www.kcl-lang.io/docs/next/user_docs/getting-started/intro> · <https://github.com/kcl-lang/kcl>
- Pkl (Apple, config typée) : <https://pkl-lang.org/blog/introducing-pkl.html>
- Winglang fermé : <https://thenewstack.io/wing-the-startup-failed-but-the-language-has-potential/>
- Score (alternative d'abstraction) : <https://score.dev/why-score/> · <https://github.com/score-spec/score-compose>
- Kamal 2 (kamal-proxy remplace Traefik) : <https://kamal-deploy.org/>
