# ADR 0052 — Pipeline specs → app web → prod (le bouton « Déployer » de l'AI Lab)

- **Statut :** accepté (spike → live)
- **Date :** 2026-06-10
- **Contexte KRD :** FKE-38 (AI Lab) · S89 provision · `deploy.BuildPlan` · `replaceable`

## Contexte

Le bouton « Déployer & voir » pointait sur un **stack démo fixe** (le guestbook), pas sur une app **émise depuis les specs du projet**. L'utilisateur veut voir un vrai site, construit depuis ses entités.

## Décision

Câbler une chaîne **specs → app web → prod** réelle, réutilisant les émetteurs AIDOS :

1. **Émission** (`back/cmd/aidosappemit`, déterministe) : pour chaque entité du projet (Product, Cart, Order, Payment, Stock — les specs niveau *entité*), `gen/db.EmitMigration` émet le **DDL** (le MÊME émetteur Atlas que l'OS) + un `entities.json` (nom + champs). Determinism-first §6 : projection pure des AST, aucun LLM.
2. **App générique** (`.deploy-app/app/server`, Go + pgx) : un serveur **multi-entités** qui lit `entities.json` et sert, par entité, une **liste + un formulaire de création** (back-office), avec une UI Tailwind. Générique → le même binaire s'adapte à n'importe quel jeu d'entités.
3. **Conteneurisation** : `docker-compose` (postgres + le DDL émis via `initdb.d` + l'app) ; **Traefik** route `alphashop.sagedesk.fr` (Let's Encrypt « le »).
4. **Le bouton** : (1) **réémet** depuis les specs (`go run ./cmd/aidosappemit`, best-effort) puis (2) `docker compose up -d` ; affiche l'URL live + un aperçu `<iframe>`.

**Prouvé live** : `https://alphashop.sagedesk.fr` (HTTPS, cert LE valide), 5 tables émises appliquées, un Product créé via l'app public persiste dans la table émise, joignable sur l'IP publique réelle.

## Le mur (§2)

C'est une action **sous la ligne** (émettre + faire tourner le conteneur de l'app émise) — **aucune écriture de vérité**. Les entités sont des kernels (vérités) ; l'émission est une **projection** régénérable.

## Limites honnêtes / OpenQuestions

- **Les entités sont un seed déterministe** du projet (Alpha Shop), codé dans `aidosappemit`. Le branchement sur le **vrai DAG versionné (S24)** / le kernel Postgres reste à faire.
- **L'app est un back-office CRUD générique**, pas un site produit sur-mesure (pas d'opérations métier, pas d'auth) — l'émission des **opérations** (S10) et des **vues** (S38) viendra ensuite.
- **Sécurité/coût :** un bouton public qui exécute `go run` + `docker` doit être **gaté** (auth + rate-limit) avant une vraie exposition publique.
