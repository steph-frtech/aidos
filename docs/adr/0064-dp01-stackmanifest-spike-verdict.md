# ADR 0064 — DP01 SPIKE-gate : verdict mesuré GO — le StackManifest-as-source porte sa valeur

- **Statut :** accepté (verdict mesuré, jamais déclaré)
- **Date :** 2026-06-12
- **Étape :** DP01 (`ROADMAP-provisioning-deploy.md` EPIC A, SPIKE-gate, ratchet OFF, rigueur T0)
- **Zone :** `/spike/stackmanifest` exclusivement (code jetable, aucune écriture `kernel`/`mirrors`/`fitness`)

## Contexte

Avant de graver quoi que ce soit (DP02+), la roadmap exige de **prouver par mesure** que déclarer
la stack émise comme une **SOURCE Kernel content-adressée** (un `StackManifest` gouverné par le
mur) porte sa valeur face à un simple template statique `/data/dockers`. Un no-go tue la roadmap
à DP01 (arrêt honnête).

## La sonde (jetable, déterministe)

Un `StackManifest` minimal (app, services {name, role, image, internal_port, profile}, volumes
nommés bind env-var, réseau externe traefik, connector scopes) → un **émetteur jetable pur**
(tri stable, `strings.Join`, `\n`, aucune horloge/RNG/ordre de map) → un `docker-compose.yml`
respectant les conventions `/data/dockers` (container_name `${APP_NAME}-*`, `env_file: .env`,
aucun port publié, labels Traefik HTTPS websecure/tls + middleware redirect HTTP→HTTPS, volume
bind `device: ${APP_DATA_PATH}`, `restart: unless-stopped`, réseau `external: true`).

## Les mesures (le verdict est leur conjonction booléenne — jamais un avis LLM)

| Mesure | Résultat |
|---|---|
| Ré-émission ×100 byte-identique (égalité de hash) | **vrai** — `output_hash 665a85273e71…adefa065` stable |
| Round-trip compose → topologie du manifest | **vrai** (rien d'inventé, rien de perdu) |
| Dérive (hand-edit d'un octet) détectée côté SOURCE (output-hash enregistré) | **vrai** |
| Dérive détectable côté template statique (aucun hash enregistré) | **faux — aveugle par construction** |
| `source_hash` du manifest | `04b2c7abec6a…729dfb` (stable, sensible à tout champ) |

**Formes candidates (≤ 3, comptage de critères DÉCLARÉS** — corps, content-address, mur,
append-only) : `record-kind` **4/4** ; `scope-dimension` 2/4 (un scope ne porte pas de corps) ;
`below-the-line-projection` 2/4 (rien ne gouverne un artefact régénérable).

## Décision

**GO.** L'asymétrie de détection de dérive (la source content-adressée détecte un hand-edit que
le template ne peut pas voir) + la ré-émission byte-identique + le round-trip prouvent que la
source porte **versioning / audit / anti-overwrite** qu'un template statique ne porte pas.
**Forme retenue : record kind Kernel de premier rang** (`stack_manifest`, DP02), content-adressé
via `records.Hash∘Canonicalize` (S02 réutilisé), append-only, écrit uniquement par
`idée → miroir → /goal → approbation`.

Le verdict est **harvesté** comme record content-adressé
(`record_hash c1bcdd9d4a82…a77102`, DRAFT, `has_mirror=false`, `has_version=false` — il propose,
il ne gèle jamais) ; la promotion passe par `/goal`.

## Conséquences

- DP02 peut graver le record kind `stack_manifest` (migration additive + SemanticDiff, amendement A6).
- Le compose primaire reste une projection ; ADR 0043 fait du programme Pulumi/TS la cible primaire (DP03).
- OpenQuestions portées par le record /harvest : OQ-DP01-1 (forme proxy vs migration réelle),
  OQ-DP01-2 (round-trip via AST YAML réel en DP03), OQ-DP01-3 (sous-ensemble de conventions couvert),
  OQ-DP01-4 (l'écriture réelle en `ideas` passe par `idea_capture`).
- Tout `/spike/stackmanifest` reste jetable : rien n'en est importé par `back/` ; le vrai code est
  rebâti à DP02+.

## Preuves

- Spike Go : `spike/stackmanifest` (`go test ./...` vert ; `go run ./cmd/verdict` → GO).
- Jumeau TS épinglé octet-pour-octet : `front/web/lib/stack-spike.ts` + miroir vitest
  (`lib/stack-spike.test.ts` — les hash Go y sont des constantes épinglées).
- Route Workbench `/stack-spike` (lecture seule vis-à-vis de la vérité, thémée ADR 0010,
  bilingue ADR 0011) + e2e Playwright `tests/e2e/stack-spike.spec.ts` (4/4).
