# VERDICT — EG01 spike : générateur self-play vs stub `deterministicSampler`

> **THROWAWAY** (KRD §84 : cliquet OFF, rigueur T0, jetable-mais-commité). Zone
> `/spike/evolve-generator/` uniquement. Le mur est intact (aucune écriture
> kernel/mirrors/fitness ; module isolé, n'importe pas `back/`). Rien ne gradue ici :
> `/harvest` proposera, `/goal` figera ; le vrai générateur (si GO) sera branché derrière
> le seam EXISTANT de `back/mcp/evolve` à EG02+, **réécrit**, jamais soulevé d'ici.

## La question falsifiée (ADR 0087 / ROADMAP EG01)

> Un générateur de variantes **self-play** (un Proposer LLM derrière le seam) améliore-t-il
> le **taux de passage du gate** et/ou la **couverture de niches QD** par rapport au **stub**
> `deterministicSampler` existant, quand il alimente la boucle `Evolve` ?

## Ce qui a été mesuré (honnêteté anti-Goodhart)

- **Une cellule kernel** modélisée en **pure data** (`createOrder`, sans importer le kernel
  réel) : **6 niches déclarées**, **4 approuvées par l'autorité** (friction réaliste : tout
  n'est pas tamponné), seuil out-of-sample **0.55**.
- **Le GATE** = fonction pure tenant lieu de promotion-gate §66.1 :
  `niche_valide ∧ mirror_green ∧ out_of_sample_green ∧ autorité`. **Le MÊME gate juge les
  deux samplers** — aucun biais. Le générateur **ne s'auto-note jamais** : il choisit seulement
  *quelle* niche viser et *combien* muter ; la cellule (Juge) dérive mirror/oos/fitness
  (mutation > 0.85 → miroir **rouge** ; oos = 1 − 0.6·mutation). Des candidats audacieux
  **échouent** donc légitimement — rien n'est arrangé pour faire gagner le self-play.
- **(a) `stubSampler`** : ré-modèle fidèle du `deterministicSampler` réel — **1** variante,
  niche `<cell>/baseline`. Le budget/seed ne l'élargissent pas (la limite **structurelle**
  sondée). La niche `createOrder/baseline` est déclarée+approuvée → **le stub la gagne** (on
  ne le truque pas pour échouer).
- **(b) `selfPlaySampler`** : Proposer offrant **5-10** candidats derrière un seam injectable
  — `fixtureProposer` (splitmix64 seedé, sans réseau, pour la repro) **ou** `ClaudeProposer`
  (CLI `claude --print --model claude-opus-4-8`).

## Résultats

### Fixture (déterministe, seed=424242, budget=8 — `TestReproducible` 200×)

| sampler   | candidats | promus | niches gagnées                              | passage | couverture |
|-----------|-----------|--------|---------------------------------------------|---------|------------|
| stub      | 1         | 1      | `baseline`                                  | 100 %   | **17 %**   |
| self-play | 8         | 6      | `baseline, bulk, discount, giftcard`        | 75 %    | **67 %**   |

**uplift couverture = +50,0 pts** (seuil matériel déclaré = 33,3 %) · uplift passage = −25,0 pts.

### Échantillon RÉEL claude-CLI (`go run ./cmd/verdict --real`, `usedRealLLM=true`)

Le vrai modèle a proposé 8 candidats (parse déterministe) :

```
createOrder/baseline    | 0.08
createOrder/discount    | 0.34
createOrder/bulk        | 0.27
createOrder/giftcard    | 0.52
createOrder/subscription| 0.61   ← niche non approuvée par l'autorité → refusée par le gate
createOrder/backorder   | 0.45   ← niche non approuvée par l'autorité → refusée par le gate
createOrder/discount    | 0.78
createOrder/baseline    | 0.19
```

Après le **même gate déterministe** : `subscription` et `backorder` sont déclarées mais
**non approuvées** → refusées ; toutes les mutations sont < 0.85 (miroirs verts) et clèrent
l'out-of-sample. Le self-play gagne donc **4 niches sur 6** (baseline, bulk, discount,
giftcard) → **couverture 67 %, passage 75 %** — **identique** au run fixture. Le verdict réel
est **GO**, sur des candidats réellement générés par le LLM, jugés par le gate déterministe.

## Verdict : **GO**

Le self-play couvre **matériellement** plus de niches gate-validées que le stub (**+50 pts ≥
33,3 %**), le **Juge=miroir** restant l'arbitre déterministe — *le générateur propose, le gate
dispose*. On poursuit vers **EG02** (ADR « générateur replaceable derrière le seam `Sampler`,
fallback `deterministicSampler` »).

**Lecture du passage-RATE plus bas (−25 pts) : ce n'est PAS un défaut.** Le stub a 100 % de
passage parce qu'il ne tente qu'**une** variante sûre ; le self-play a un ratio plus bas parce
qu'il **explore aussi** des variantes audacieuses qui échouent (sain). La métrique qui répond à
la question est le **nombre de niches GAGNÉES**, pas le ratio — et là le self-play domine 4-à-1.

## OpenQuestions (gaps non comblés en douce)

- **OQ-EG01-1** — le gate du spike dérive mirror/oos d'une heuristique de mutation ; le vrai
  gate = miroir réel + backtester out-of-sample (§87). EG02/EG03 re-mesurent derrière le seam réel.
- **OQ-EG01-2** — une seule cellule sondée ; la généralité (cellules à 2-3 niches, autorité
  très restrictive) reste à élargir (EG03).
- **OQ-EG01-3** — coût/latence du Proposer réel non chiffré ; `--real` fait UN appel. Le coût
  agrégé d'une vraie boucle (budget × cellules) est une OpenQuestion de rentabilité pour l'ADR EG02.
- **OQ-EG01-4** — le stub gagne grâce à la niche `baseline` supposée déclarée+approuvée. Sur une
  cellule sans niche baseline, le stub gagnerait 0 niche (faux-positif possible côté self-play) —
  à vérifier sur cellules réelles en EG03.

## Reproduire

```sh
cd spike/evolve-generator
go test ./...            # vert ; TestReproducible rejoue 200×
go run ./cmd/verdict     # fixture (déterministe)
go run ./cmd/verdict --real   # échantillon LLM réel (exception gatée)
```
