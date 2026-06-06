# ADR 0039 — MK02 DocConverter : la frontière d'ingestion document→markdown est un outil REPLACEABLE derrière un port

- Status: Accepted
- Date: 2026-06-06
- Step: MK02 (`back/runtime/markitdown`)
- KRD: §84 (spike-gate), CLAUDE.md §2 (le mur), §3 (slots gelés/`replaceable`), §6/§8 (determinism-first), ROADMAP-markitdown (sujet MK)

## Contexte

MK01 a prouvé, par un spike confiné (`/spike/markitdown/`, ratchet OFF, T0, jetable, module
isolé `aidos.spike/markitdown` qui n'importe jamais `back/`), que convertir un document RÉEL
(une spec fonctionnelle de checkout, `testdata/checkout-spec.html`) en markdown :

- préserve **100 %** des **13 faits porteurs** déclarés (titre, invariants du panier, code span
  `line.qty * line.unit_price`, étapes du workflow, événements émis `OrderPlaced` /
  `PaymentDeclined`, données de table, la référence croisée `PaymentGateway` AVEC sa cible de
  lien) — fidélité plancher 1.0 ;
- est **idempotent** dans deux sens : (a) **déterminisme** byte-à-byte
  `ToMarkdown(b) == ToMarkdown(b)` (md-hash `dfac5f5321beda3a`), (b) **stabilité à la
  ré-ingestion** (re-passer le markdown dans la frontière n'érode aucun porteur) ;
- est **reproductible** (rejoué 100×, aucune dérive) ;
- mappe vers une **idée DRAFT** (`status="draft"`, provenance conservée, source+markdown
  content-hashés) **honorant le mur** : l'ingestion produit une candidate-vérité, jamais une
  écriture kernel.

**Verdict MK01 : GO** (computed, jamais déclaré). MK02 grave le **contrat** (le port) sans
encore brancher l'outil externe (`microsoft/markitdown`, branché en MK03 derrière ce même port).

## Décisions

1. **La frontière d'ingestion document→markdown est un slot `replaceable` (CLAUDE.md §3),
   JAMAIS un slot gelé.** L'outil concret (`microsoft/markitdown` ou un autre) est branché
   **derrière un port Go** `DocConverter` ; on peut le remplacer par un ADR sans toucher
   l'appelant (l'outil MCP `convert_to_markdown` de MK03). C'est un *adaptateur*, pas une vérité.

2. **Le port a exactement une opération, totale et pure côté contrat :**
   `ToMarkdown(raw []byte, mime Mime) → string`. **Total** : un `mime` non supporté rend un
   markdown vide, jamais un panic. **Pur** : ni horloge, ni rng, ni I/O, ni LLM dans le contrat.

3. **L'identité du contrat est l'IDEMPOTENCE — « même fichier → même markdown ».** Pour les mêmes
   `(bytes, mime)`, `ToMarkdown` rend toujours le même markdown, byte-à-byte, et c'est
   **reproductible** (rejoué 100×, aucune dérive). Le miroir property
   (`markitdown_property_test.go`) épingle les trois sens : déterminisme, reproductibilité,
   point-fixe à la ré-ingestion. **Tout adaptateur futur est tenu à ce contrat** : si un format
   (OCR, audio) s'avère non-déterministe, l'adaptateur épingle une passe de normalisation
   déterministe **ou** ce format est gaté hors du port — jamais une frontière qui dérive.

4. **Le port est PUR et SOUS LA LIGNE (le mur, CLAUDE.md §2).** Il lit des bytes et rend du
   markdown ; il n'écrit **aucune** vérité (`kernel`/`mirrors`/`fitness`), n'a ni DB, ni
   horloge, ni rng. La conversion **propose** (le markdown devient une idée draft à MK03) ; elle
   ne **fige** jamais rien. La seule porte vers la vérité reste idée → miroir → /goal → humain.

5. **MK02 livre une implémentation de référence déterministe, pas l'outil externe.** Pour que le
   contrat soit testable *avant* MK03 (bootstrap, CLAUDE.md §6 forward-dependency), MK02 fournit
   `HTMLConverter` — la frontière HTML→markdown du spike reconstruite *proprement* dans `back/`
   (le spike ne gradue pas ; `/harvest` propose, le code est reconstruit). C'est l'implémentation
   par défaut du port, et l'invariant d'idempotence y est prouvé.

6. **Determinism-first (CLAUDE.md §6/§8).** Un convertisseur est un transform déterministe
   (parse → walk → render) : il **DOIT** être du code, jamais un LLM. Le LLM n'a aucune place
   dans cette frontière. Le miroir de reproductibilité (`TestReproducible`, 100×) le certifie.

## Conséquences

- MK03 branche `microsoft/markitdown` (via son MCP) comme un second adaptateur de `DocConverter`,
  l'expose via l'outil MCP `convert_to_markdown` dans `back/mcp/idea-intake`, et **re-prouve**
  l'idempotence contre **ce même** miroir property — re-mesurée sur l'outil réel (OQ-MK01-1).
- L'appelant (MK03) dépend de l'**interface** `DocConverter`, jamais d'un outil concret —
  substitution par ADR, sans réécriture.
- Le mur est intact : le port lit, ne grave rien ; l'ingestion produit une idée draft, jamais
  une vérité.

## OpenQuestions

- **OQ-MK02-formats** (← OQ-MK01-2) : seul HTML est prouvé par la référence (le format purement
  parseable en stdlib Go offline). PDF/DOCX/PPTX/XLSX/img(OCR)/audio/YouTube sont la part de
  `markitdown` et sont branchés à MK03 derrière le même port, re-mesurés sur des fixtures réelles.
- **OQ-MK02-real-adapter** (← OQ-MK01-1, load-bearing) : `microsoft/markitdown` (lib Python,
  environnement offline) n'est PAS appelée ici ; le port grave le **contrat** d'idempotence et la
  **référence** déterministe. L'adaptateur réel est branché et re-prouvé à MK03 ; s'il est
  non-déterministe sur un format, le port épingle une normalisation déterministe ou gate ce format.
- **OQ-MK02-linear** : le `linear-server` MCP n'est pas authentifié dans cette session (OAuth
  requis) ; l'issue `MK02 · …` n'a pas pu être déplacée en `In Progress`/`Done` par l'agent — à
  faire au prochain run authentifié (CLAUDE.md §11, best-effort).
