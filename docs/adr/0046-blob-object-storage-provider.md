# ADR 0046 — Type blob/fichier + provider de stockage objet par projet (slot replaceable)

- **Statut :** proposed (accepté au vert de S72)
- **Date :** 2026-06-08
- **Contexte KRD :** ROADMAP app-builder, EPIC 6 (modéliser son domaine), étape **S72**. Tool-search par étape (CLAUDE.md §6). Gate de l'émission multi-entités E9 (S74/S87/S90/S93).
- **Amende par référence :** complète ADR 0003 (frozen-stack — aucun slot « stockage objet ») ; s'appuie sur ADR 0040 (app émise = Hono/TS fonctionnel — le handler blob est émis en TS) + ADR 0006 (datastore dialecte Postgres, inchangé) + ADR 0009 (tout op backend = outil MCP) ; prolonge l'honnêteté de l'ensemble clos de S35 (scalaires) et S71 (relations).
- **Décision utilisateur (roadmap) :** « un type d'attribut `blob`/`file` (nœud AST, ensemble clos préservé) ; un provider de stockage objet par projet (scopé `project_id`, jamais dans le truth-store, jamais dans git) ; émetteur du handling upload/download (URLs signées, validation MIME/taille). **ADR du provider de stockage objet (slot replaceable).** »

## Contexte

Le système de types des entités (`back/kernel/entities`) est **scalaires-only, ensemble CLOS** (`{string,int,decimal,bool,timestamptz}`), enrichi à S71 d'un nœud **relation** DISTINCT. Une vraie app a besoin de **fichiers** (avatar, document, image) : un troisième plan de nœud est requis — sans jamais élargir l'ensemble scalaire (l'honnêteté du jeu fermé, le cœur de S35/S71).

Deux exigences dures conditionnent le « où vivent les octets » :

1. **Les octets ne touchent JAMAIS le truth-store ni git.** Le kernel Postgres est content-adressé/append-only pour des **ASTs** (JSONB), pas pour des blobs binaires ; git versionne du **code** régénérable, pas des uploads d'utilisateurs. Mettre des blobs dans l'un ou l'autre casserait le content-addressing et gonflerait l'histoire.
2. **Isolation multi-tenant par projet.** Le truth-store est project-scopé (RLS, S55) ; le stockage des octets doit l'être aussi — un blob du projet A doit être **inaccessible** depuis le projet B.

## Décision

**Le nœud blob/fichier est un troisième nœud AST DISTINCT, et les octets vivent dans un provider de stockage objet PAR PROJET — slot `replaceable`.**

1. **`BlobAttribute` — un nœud AST source, au-dessus de la ligne** (`back/kernel/entities/blob`). Il porte `name`, une liste FERMÉE `allowed_mime`, un plafond `max_bytes`, et `required`. Il **n'élargit jamais** l'ensemble scalaire (`entities.ScalarTypes()` est prouvé intact, `TestProp_ScalarSetUntouched`) : un blob est un **nœud à part**, ni scalaire ni relation. Il round-trip comme **AST content-adressé** (`ID = records.Hash(records.Canonicalize(body))`, S02 réutilisé verbatim) — le miroir de reproductibilité le prouve byte-stable, et le **jumeau TS** (`front/web/lib/blob-attribute.ts`) reproduit le **même** hash (ancre byte-équale `b532622b…`).

2. **Les octets vivent dans un provider de stockage objet PAR PROJET — jamais dans le truth-store, jamais dans git.** Chaque blob est adressé par une **clé scopée `project_id`** : `StorageKey = "<project_id>/<entity>/<attr>/<content-hash>"`. Une clé mintée pour A est **inaccessible** depuis B (`CrossProjectAccess(keyOfA, B)` refuse `BLOB_CROSS_PROJECT`) — jamais servie, jamais devinée. Le `content-hash` est le SHA-256 des octets (calculé par le handler), **pas** un hash de nœud : les octets sont opaques au kernel.

3. **Provider = port `replaceable`, abstraction S3-compatible.** L'interface est `signPut(key, mime, size) → URL` / `signGet(key) → URL`. **Défaut : MinIO** (S3-compatible, self-hosted, gouvernable, aligné self-hosted-first ; un bucket par déploiement, préfixe par `project_id`). **Remplaçable** par tout backend S3-compatible (Garage, Ceph RGW, un cloud S3 à `future_cloud`) **sans changer le handler émis** — l'émetteur ne dépend que de l'interface `StorageProvider`, spike+ADR gated comme tout slot replaceable.

4. **Émetteur du handling upload/download — DÉTERMINISTE, URLs signées (ADR 0040, TS).** `EmitHandler(projectID, entity, blob)` rend un handler TS **byte-stable** qui : valide le MIME contre la liste fermée (`BLOB_MIME_REFUSED`), valide la taille contre le plafond (`BLOB_SIZE_REFUSED`), mint la clé scopée, mint une **URL d'upload signée** et une **URL de download signée** via le provider, et **refuse un download cross-projet** (`BLOB_CROSS_PROJECT`). La liste MIME + le plafond sont **bakés** dans le handler (la borne fermée est enforced au runtime émis). L'app émise reste **Hono/TS** (ADR 0040) ; AIDOS n'émet jamais de Go pour l'app utilisateur.

### L'adaptation KRD (le cœur)

- **Le mur (CLAUDE.md §2).** `BlobAttribute` est une **SOURCE above-the-line** (l'agent la LIT en SELECT-only ; l'écriture-vérité passe par idée→miroir→/goal). Le provider, l'émission du handler et les octets sont **below-the-line** (projections/données régénérables). L'écran `/blob-attribute` ne fait que **valider, scoper et émettre** — il n'écrit aucune vérité.
- **Déterminisme-first (CLAUDE.md §6/§8).** Tout est **fonction pure** : validation MIME/taille, clé de stockage, refus cross-projet, hash de nœud, émission de handler — **jamais un LLM**. Le **signing** lui-même est délégué au provider au runtime (HMAC sur clé+expiry) : l'émetteur **ne signe pas**, il rend l'appel déterministe à `provider.sign()`. Miroirs de reproductibilité : `blob_property_test.go` (Go, rapid) + `blob-attribute.test.ts` (TS, fast-check), même entrée → même sortie.
- **ADR 0009 (tout op = MCP).** Le serveur `back/mcp/blob-attribute` expose 5 outils PURS (`blob_address`, `blob_validate_upload`, `blob_storage_key`, `blob_cross_project`, `blob_emit_handler`), n'écrivant rien (le mur).
- **« Tout est miroir » (complétude).** Le nœud porte ses miroirs (property + fixture) ; l'émetteur porte son miroir de reproductibilité — l'upload n'échappe pas à la complétude.

## Conséquences

- **Positif :** une app multi-entités gagne les **fichiers** sans toucher l'ensemble scalaire clos (honnêteté préservée) ; les octets restent **hors** truth-store et git (content-addressing du kernel intact, histoire git légère) ; **isolation multi-tenant** by-construction (clé scopée `project_id`, refus cross-projet déterministe) ; handler **byte-stable** émis en TS (cohérent ADR 0040, gouverné par l'arch-fitness émis) ; provider **replaceable** (MinIO le choix, pas un verrou — tout S3-compatible, `future_cloud` ouvert). Gate l'émission relation-aware+blob de S74 puis le serveur/API/front émis (S87/S90/S93).
- **Coût/risque :** dépendance à un service objet S3-compatible au runtime de l'app émise (mesuré au déploiement, slot replaceable) ; le `content-hash` est calculé côté handler (le kernel ne voit jamais les octets — c'est le but) ; les URLs signées ont une expiry (un concern runtime du provider, pas du nœud). Le slot reste *replaceable* : MinIO est le défaut spike-validable, fallback any-S3.
