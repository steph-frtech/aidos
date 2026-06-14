# ADR 0049 — Provider de facturation Stripe + webhooks entrants en operations async + contrat Pact (slot replaceable)

- **Statut :** accepté (S114 vert, build S53→S117 git 8727034)
- **Date :** 2026-06-09
- **Contexte KRD :** ROADMAP app-builder, EPIC 14 (SaaS multi-tenant), étape **S114**. Tool-search par étape (CLAUDE.md §6). Dépend de S73 (operations async/outbox), S111 (HarnessCostBudget/ValueCase câblés aux compteurs réels), S52 (AgentRun enregistrés), S61 (identité compte), S53 (project_id).
- **Amende par référence :** complète ADR 0003 (frozen-stack — aucun slot « provider de facturation ») ; s'appuie sur ADR 0009 (tout op backend = outil MCP), ADR 0010/0011 (Workbench thémé + bilingue), et le mandat determinism-first (§6/§8). Distingue la couche économique **customer-facing** (cette ADR) du **HarnessCostBudget kernel** (S51/S111, advisory build-time).
- **Décision utilisateur (roadmap) :** « une intégration de facturation via un **provider nommé (ex. Stripe) documenté par un ADR**, avec ses **webhooks entrants modélisés comme operations async (S73)** et un **contrat Pact avec le provider** (provider-verification). »

## Contexte

S114 ajoute la **couche économique customer-facing** : des **plans au niveau compte**, une **consommation métrée** (tokens LLM / minutes de build-loop / heures-sandbox / apps déployées) liée à `user+projet`, et l'**enforcement de quotas/rate-limits** sur les builds. Deux exigences dures :

1. **Le métrage doit être DÉTERMINISTE — un COMPTE depuis les AgentRun enregistrés, jamais un LLM, jamais une estimation.** La consommation est un fold pur sur le `RunMeter` des runs (S111), exactement attribuable par projet. Un build over-quota doit être **refusé avec un BlockReason `QUOTA_EXCEEDED` + un chemin d'upgrade**, jamais un échec silencieux (la prison §44.5 est interdite).
2. **L'argent vit chez un provider externe.** AIDOS n'est pas un PSP : la prise de carte, le PCI-DSS, les abonnements récurrents et la dunning sont la responsabilité d'un provider de paiement spécialisé. AIDOS **ne stocke jamais** de donnée de carte ; il **écoute** les événements du provider (checkout réussi, paiement, changement d'abonnement) et **applique** la transition de plan.

## Décision

**Le provider de facturation nommé est Stripe (slot `replaceable`) ; ses webhooks entrants sont modélisés comme des operations async S73 (run inbound, idempotentes par content-addressing) ; un contrat Pact provider-vérifié pin l'endpoint webhook.**

1. **Plans = ensemble CLOS déclaré, jamais appris (§8).** Le ladder est `free → pro → scale → enterprise` (ordre = chemin d'upgrade). Chaque plan porte un `Quota` déclaré sur quatre axes (`max_llm_tokens`, `max_build_loop_minutes`, `max_sandbox_hours`, `max_deployed_apps`). La table `planQuotas` est **frozen policy data** (au-dessus de la ligne), strictement ascendante sur chaque axe (prouvé par le miroir property). Le code la **lit** et compte contre elle ; il ne l'apprend ni ne l'invente.

2. **Métrage = COMPTE déterministe depuis les AgentRun (le cœur determinism-first).** `MeterUsage(account, runs)` est un fold monotone pur (clamp des négatifs, pas d'horloge, pas de RNG, pas de LLM) : il somme le `RunMeter` (S111) de chaque run dont le compte correspond, attribué exactement par projet (`MeterProject` — les usages par projet somment à l'usage compte). Même ledger ⇒ même usage (miroir de reproductibilité). C'est la **garantie anti-Goodhart** : la facturation ne peut pas dériver, elle compte ce qui s'est réellement passé.

3. **Enforcement = QUOTA_EXCEEDED + chemin d'upgrade, jamais silencieux.** `CheckQuota(plan, usage)` dénie sur **tout** axe dépassé (OR par axe ; égal-à-la-limite = dans le quota, plafond inclusif) avec un `BlockReason{QUOTA_EXCEEDED}` dont le `how_to_fix` nomme les axes ET le `NextPlan` (le chemin d'upgrade). `CanRunBuild` est la porte que la boucle-build (S83) consulte. Un plan inconnu dénie `UNKNOWN_PLAN` (jamais un allow par défaut).

4. **Webhooks entrants = operations async S73, run INBOUND, idempotentes.** Un webhook provider est un trigger out-of-band (la 5e nature après cron/queue/webhook_out/notification, projetée côté entrée). `IngestWebhook(log, event)` content-adresse l'événement (`records.Hash(Canonicalize(body))` — byte-identique au jumeau TS) : un webhook **rejoué** collisionne avec son ingest antérieur et est **supprimé** (la garantie exactly-once-relative de S73, courue à l'envers). Un événement mal formé est **refusé**, jamais silencieusement ignoré. `ApplyEvent(current, event)` est la transition de plan autoritative (checkout/subscription.updated → le plan acheté ; subscription.canceled → free ; payment → inchangé) — du code, jamais un LLM.

5. **Contrat Pact avec le provider, provider-vérifié.** Le consumer est l'émetteur de webhook du provider (`stripe-webhook`) ; le provider (la partie vérifiée) est l'endpoint billing AIDOS (`aidos-billing`). Le contrat pin, par kind entrant, le POST que le provider envoie et le 200 ack que l'endpoint rend, plus une interaction DENY (event mal formé → 400). `VerifyContract` lève l'endpoint en-process et rejoue chaque interaction via le **même** `IngestWebhook` que le runtime — vérifier ce provider vérifie le handler entrant, sans dépendance réseau. Déterministe (pas d'horloge/RNG/LLM).

6. **Stripe = slot `replaceable`, abstraction neutre.** L'ensemble des kinds (`checkout.completed`, `payment.succeeded`, `payment.failed`, `subscription.updated`, `subscription.canceled`) et la forme de l'événement sont **neutres** : le provider est nommé Stripe par défaut (leader marché, webhooks signés, abonnements + usage-based, sandbox de test), mais l'endpoint et le contrat Pact ne dépendent que de la forme `WebhookEvent`. Remplacer Stripe par un autre PSP (Paddle, Lemon Squeezy, un provider self-hosted) ne change pas le métrage ni l'enforcement — seulement l'adaptateur de signature/parsing à la frontière, spike+ADR gated comme tout slot replaceable.

## Le mur (CLAUDE.md §2)

Tout est **sous la ligne** : plans/usage/quotas/webhook-events sont des **rows runtime/commerciales** (un seam below-the-line), jamais un schéma `kernel`/`mirrors`/`fitness`. Un plan/quota est de la **donnée déclarée** (§8). Le métrage est un COMPTE sur le ledger réel (le juge déterministe, jamais le LLM). Aucune écriture de vérité : l'application d'un changement de plan modifie une row commerciale, pas le truth-store.

## Distinction d'avec le HarnessCostBudget kernel (S51/S111)

| | **HarnessCostBudget** (S51/S111) | **Billing** (S114, cette ADR) |
|---|---|---|
| Gouverne | l'économie **build-time** d'une cellule | l'économie **commerciale** d'un **compte** |
| Verdict | **advisory** (un flag « cette vérité vaut-elle son coût ? ») | **blocking** (un quota « ce build peut-il tourner sous le plan ? ») |
| Public | l'architecte | le client |
| Substrat partagé | le **RunMeter** réel des AgentRun (S111) | idem — le **même** ledger |

Les deux partagent le substrat de métrage et **rien d'autre**. C'est la frontière que la roadmap appelle « couche économique customer-facing, distincte du HarnessCostBudget kernel ».

## Conséquences

- **Positif :** métrage incontournablement déterministe (anti-dérive) ; quota jamais silencieux (toujours un chemin d'upgrade actionnable) ; webhooks idempotents (un replay provider ne double-facture jamais) ; provider isolé derrière une frontière neutre (remplaçable) ; contrat Pact qui garde le handler entrant honnête sans dépendance réseau.
- **Négatif / dette :** l'adaptateur de signature Stripe (vérification HMAC du header `Stripe-Signature`) et le parsing du payload réel restent à brancher à la frontière (OpenQuestion S114-sig — le package pur modélise la forme de l'événement, pas la cryptographie de signature, qui vit dans l'adaptateur de transport au déploiement). L'application effective d'un changement de plan dans la row commerciale (la persistance) est un seam injecté que le MCP/runtime possède.
- **Réversibilité :** slot `replaceable` — remplacer Stripe ne touche ni le métrage ni l'enforcement.

## Alternatives écartées

- **Métrage par estimation/LLM :** rejeté — déterminisme-first (§8) : un compte sur le ledger réel est une pure fonction, jamais un agent.
- **Échec silencieux sur over-quota :** rejeté — la prison §44.5 (un blocage sans how_to_fix) est interdite ; un over-quota doit toujours porter un chemin d'upgrade.
- **AIDOS comme PSP (stocker les cartes) :** rejeté — hors scope, PCI-DSS, risque ; le provider externe possède l'argent.
- **Webhooks synchrones inline :** rejeté — un webhook est out-of-band par nature ; le modéliser comme une operation async S73 (idempotente via outbox/content-addressing) est l'honnêteté du modèle.
