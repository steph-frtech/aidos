# ADR 0071 — Design Lab (`/v3/design`) : Onlook inversé — le geste de design devient un requirement, le compilateur reproduit l'écran

- **Statut :** accepté (décision humaine, 2026-06-14 : « tu ajoutes dans le module Design Lab qui implémente Onlook complètement pour designer les screen et qui va créer tous les requirement pour reproduire les screen à la compile » ; forks tranchés par l'utilisateur : édition DIRECTE sur l'app live + TOUT Onlook)
- **Date :** 2026-06-14
- **Contexte KRD :** CLAUDE.md §2 (le mur) · §6/§8 (determinism-first) · §9 (anti-overwrite) · ADR 0010 (tokens) · ADR 0011 (i18n) · ADR 0040 (app émise multi-plateforme) · ADR 0055/0056 (échelle fractale / descente code) · ADR 0060/0062 (Workbench v3) · réutilise S02 (content-address), S11 (control→action), S18 (composes), S20 (changeset), S24 (DAG), S35 (entité), le loopback `ViewAdaptation` + `compound`, la couche-agent gatée (ADR 0054→0070)

## Contexte

[Onlook](https://github.com/onlook-dev/onlook) (Apache-2.0) est un éditeur visuel d'écrans React : geste visuel → édition optimiste du DOM → **calcul d'une édition de SOURCE** (réécriture AST `parser/code-edit`, `data-oid` injectés, AI write-file) → **la source est la vérité**. C'est exactement ce que le **mur §2 interdit** : `gen/` est une projection régénérable, l'agent n'écrit jamais la vérité, on ne hand-édite jamais un fichier généré (§9).

**Découverte fondatrice (vérifiée).** L'app émise est **déjà instrumentée à la Onlook, gratuitement**. Les émetteurs Go estampillent chaque élément DOM avec sa **coordonnée-requirement** : web `data-aidos-view`(section)/`data-aidos-col`(champ)/`data-aidos-invoke`+`data-aidos-visible`+`data-aidos-enabled`(bouton) ; mobile `data-aidos-screen`/`data-aidos-field`/`data-aidos-invoke` ; desktop `data-aidos-panel`/`data-aidos-col`/`data-aidos-invoke`. Là où Onlook doit injecter `data-oid` dans la source puis indexer `oid→fichier:ligne`, AIDOS a déjà le lien DOM↔requirement — sans toucher la source.

## Décision

**Implémenter Onlook complètement comme la lentille `/v3/design` (Design Lab), mais INVERSÉ : le geste de design ne s'écrit jamais dans le code — il devient un `ScreenDesign` requirement content-adressé, et le compilateur (les émetteurs) reproduit l'écran byte-stable sur les 3 enfants (web/mobile/desktop).**

1. **Le `ScreenDesign` requirement** (`back/runtime/honoemit/screendesign.go`, pur, content-adressé) **n'étend PAS `MasterView`** (ce serait structurel) : il étend la **voie `ViewAdaptation`** (soft, append-only, below-the-line, `ParentID == master.Hash()` toujours). Il porte des **`ScreenOverride` par coordonnée** : des `StyleToken` d'un **catalogue FERMÉ ADR 0010** (`bg=card`, `text=foreground`, `text=primary`, `radius=lg`… — jamais un hex ni une utilitaire Tailwind arbitraire, fail-closed) + un label per-plateforme. La coordonnée `ScreenCoord{Kind: section|field|action, …}` normalise le drift d'attributs (`{view,screen,panel}→section`, `{col,field}→field`, `invoke→action`).

2. **Le bridge iframe↔lentille** est un postMessage RPC typé (jeu clos, calqué penpal/preload Onlook) qui **lit les `data-aidos-*` déjà émis** — pas d'injection de source. Un runtime minuscule **`aidos-bridge`** est émis dans les 3 enfants (calque exact de `aidos-expr.embed.ts` déjà injecté). La preview est **optimiste et purement visuelle** (mutation de classes-token live), jamais une écriture.

3. **Chaque geste passe le mur via un classifieur PUR `ClassifyGesture`** ∈ {`Styling`, `Structural`} :
   - **Styling/layout pur** (couleur/espacement/radius/densité/label-token) → **below-the-line** : `ScreenDesign` DRAFT → sur validation humaine, `CapitaliseScreenDesign` réutilise `compound.Compound`/`firewall.ViaIdea` (jamais `ToKernel` — `WroteKernel()==false` épinglé) → `ReproduceScreen` re-émet l'enfant byte-stable.
   - **Structurel** (ajout/retrait/réordre de champ/section/action ; texte=donnée i18n ; composant=source-kind) → **above-the-line** : `idée→miroir→/goal→approbation`. Jamais en passant.

4. **Reproduction = émetteur déterministe**, jamais une « génération LLM d'écran » (sinon `AGENT_DETERMINISM_GAP`). Le **chat IA** du Design Lab est l'**exception LLM gatée** : il *propose* une phrase canonique (palette close) ou une coordonnée+override, **re-jugée déterministe** avant capture ; IA éteinte, le rejeu reste vert.

5. **Les 20 capacités Onlook → primitives AIDOS** : canvas/iframe → `DesignIframe` sur l'URL live `envStackOf('dev')` ; sélection/overlay → lecture `data-aidos-*` ; layers → l'arbre `composes`/fractal (ADR 0055) ; style-panel → `StyleToken` ADR 0010 ; insert/remove/reorder → idée→/goal ; détection de composants → les sources kernel (S35/S11) ; branches/checkpoints → DAG S24 + changesets S20 ; assets/thème → tokens ADR 0010 ; deploy/lien → Pulumi per-project (piste DP) ; tout op = un tool MCP (ADR 0009, `back/mcp/screen-design`).

6. **Construction en tranches vérifiables** (chacune finit verte) couvrant tout Onlook : T1 la boucle complète sur un écran (sélection→requirement→reproduit→live) ; T2 le mur structurel + layers + détection composants ; T3 style-panel complet + drag-drop + assets ; T4 chat IA gaté ; T5 branches DAG + checkpoints.

## Conséquences

- **Positif.** Onlook complet **sans jamais violer le mur** (l'instrumentation `data-aidos-*` est gratuite — pas d'`addOidsToAst`, pas d'index `oid→source`, pas de write-back). Determinism-first respecté (`ScreenDesign` pur + émission pure → mêmes bytes 3 enfants). Additif §9 (on étend `AdaptationOverride`, on n'altère pas `MasterView`). `ui-completeness` (tout via `send()` depuis l'écran). Couverture auto (créer `app/v3/design/` rend la lentille couverte par `coverage.test.ts`). C'est la **9e lentille** v3.
- **Coûts assumés.** (a) Le web child gagne son **premier** point d'adaptation (`EmitWebChildAdapted`) : garantir `EmitWebApp` byte-identique quand l'override est vide (property test anti-drift). (b) Le drift d'attributs (`view/screen/panel`, `col/field`) normalisé en **un seul** point testé. (c) **OpenQuestions** (forward-deps, ne bloquent pas) : persistance Postgres du `ScreenDesign` (aujourd'hui soft, comme `ViewAdaptation` — back-fill S17/S31) ; l'iframe **mobile** RN — le bridge postMessage vise l'**export web** de l'enfant Expo (react-native-web), pas le natif ; fusion éventuelle du chat IA avec `/ai-lab` (patron LLM gaté partagé) ; frontière exacte densité→{Styling|Structural} dans `ClassifyGesture`.
- Le mur, le déterminisme et l'anti-overwrite sont **inchangés** ; le Design Lab les *augmente* (un éditeur visuel qui ne peut, par construction, qu'émettre des requirements).
