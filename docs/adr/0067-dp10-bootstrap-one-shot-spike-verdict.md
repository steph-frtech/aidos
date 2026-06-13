# ADR 0067 — DP10 : verdict GO du SPIKE-gate « bootstrap one-shot déterministe vs deploy.sh »

**Statut :** accepté (verdict mesuré, 2026-06-13)
**Contexte :** roadmap provisioning-deploy (EPIC C), étape DP10 — SPIKE-gate, ratchet OFF, T0, zone `/spike` uniquement.

## Question

Avant d'écrire DP11-DP13 : un **bootstrap déterministe one-shot émis** (réseaux→volumes→.env→secrets-check→résolution-ports→start-ordonné→healthchecks→print-URLs) bat-il l'appel direct de `/data/dockers/deploy.sh` ? Un no-go aurait documenté la réutilisation directe de deploy.sh et DP11-DP13 ne se seraient pas écrits.

## La mesure (jamais un avis)

Sonde jetable `spike/bootstrap` (module Go autonome, `go run ./cmd/verdict`, exit 0 = go) :

1. **Résolution de ports pure** : `ss -ltn` + `docker ps -a` capturés UNE fois comme données, parsés par fonctions pures ; premier port libre ≥ 18080 — même snapshot → même port, jamais un prompt (deploy.sh : `read -rp "Entrez un nouveau port…"`).
2. **Ordre de démarrage pur** : rang déclaré sur l'ensemble clos {traefik:0, datastore:1, server:2}, stable par permutation (property Go + vitest).
3. **Deux runs docker RÉELS** : bundle émis (traefik:latest → postgres:16-alpine → caddy:2-alpine), réseau jetable `dp10spike_net` (jamais `traefik_default` — la prod intouchée), conteneurs `dp10spike-*`, healthchecks bloquants (tcp / `pg_isready` / running), URL imprimée répond **200** via le traefik jetable (Host `dp10spike.localhost`), teardown complet. **Reproductible** : mêmes 9 événements ordonnés (`network-created → traefik-up → healthy:traefik → datastore-up → healthy:postgres → server-up → healthy:server → url-probed → urls-printed`), même port résolu (18080) sur les 2 runs.
4. **Faits mesurés sur les octets de deploy.sh** (`/data/scripts/dockers/deploy.sh`, 322 lignes) : **7 prompts interactifs** (1 `select` + 6 `read -rp`), **3 références `/data/dockers` en dur**.
5. **≤ 3 candidats, critères DÉCLARÉS** (compte de features, jamais une opinion) — {zero_prompt_in_path, non_interactive_invocation, independent_of_data_dockers, plan_is_data, future_cloud_portable} :
   - **émetteur bootstrap natif Go déterministe : 5/5** ;
   - wrapper non-interactif autour de deploy.sh : 1/5 (les prompts restent dans le chemin, le plan vit dans des effets sed/select, pas de portabilité cloud) ;
   - appel direct deploy.sh : 0/5.

**Verdict = conjonction booléenne pure** des 7 conjoints, content-adressée :
`a2f23a64ab7769597ed983eb6413239db526995233924b27c4b3122288662dd0` — **GO**.

## Décision

**GO — le bootstrap natif porte sa valeur (reproductibilité + indépendance de /data/dockers + portabilité future_cloud) : DP11-DP13 s'écrivent.** DP12 émettra le bootstrap one-shot réel (la chaîne deploy.sh **comme code** : fonctions pures, jamais `select`/`sed`), DP11 les compose profiles, DP13 les outils MCP.

## Récolte (/harvest)

Record DRAFT content-adressé `017fd529d9e3569d28d00b73f95909746ea908341ebecbbaccaa194b61b1dc22` (proposes=operation, provenance human, has_mirror=false — propose, ne fige jamais ; la promotion reste `/goal`). OpenQuestions : OQ-DP10-1 (secrets-check/.env → DP12/S91), OQ-DP10-2 (volumes bind → DP03/DP12), OQ-DP10-3 (le traefik de PROD `traefik_default` est l'affaire de DP12 — exigence utilisateur 1 : `https://<projet>-dev.sagedesk.fr`), OQ-DP10-4 (l'écriture du verdict en `ideas` passe par idea_capture — le record la modélise).

## Le mur & le cliquet

Zone `/spike` uniquement : aucune écriture kernel/mirrors/fitness, aucune persistance ; conteneurs jetables démontés. Ratchet OFF (T0) — mais le mandat déterminisme-first tient : chaque décision (ports, ordre, score, verdict) est une fonction pure mesurée par miroir (Go test 7/7, vitest 9/9 dont parité d'adresse exacte avec le Go autoritaire), l'UI `/bootstrap-spike` ne fait que rendre la mesure et re-décider purement.
