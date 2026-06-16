# ADR 0092 — Le moteur Go est la SEULE source vivante ; un twin n'est jamais le chemin live (supersède 0072)

- **Statut :** accepted (2026-06-16). **Supersède ADR 0072** (« jumeau gouverné »).
- **Déclencheur :** directive propriétaire « il faut pas garder les twins » + l'audit dormant déterministe (deadcode, `docs/audit/`).

## Contexte

ADR 0072 autorisait un « jumeau gouverné » : un `front/web/lib/*.ts` réimplémentant byte-pour-byte une logique Go, **chemin live** avec le moteur en fallback. En pratique l'effet est l'INVERSE de l'intention : le moteur Go **DORT** (la passerelle ne dispatche que 15 serveurs ; **16 panneaux sur 174** lisent live) pendant que **~194 twins-logique** tournent comme chemin réel. Un twin = une 2ᵉ implémentation à garder en phase = dérive possible + dormance du moteur. C'est une violation du **single-source**, de **determinism-first** (§6/§8 : ce qui peut être une fonction pure DOIT être le code *autoritaire*, pas une copie) et de **reuse** (ADR 0007 : ne pas réinventer). Le dispatcher S58/S59 (`gateway_call`, commits `3f35d0b`→`9df6327`) a été bâti précisément pour rendre le moteur joignable et **tuer les twins**.

## Décision

1. **Le moteur Go (`back/*`) est la SEULE source vivante** de toute vérité affichée ou persistée. Le front **APPELLE** le moteur via la passerelle (`gateway_call` → les serveurs dispatchés in-process) ; il ne **RÉIMPLÉMENTE** plus.
2. **Aucun twin TS n'est jamais le chemin live.** Le chemin live = `readVia(scope, tool, args, decoder, demo)` → `source:"live"`. Le twin-logique est **ÉLIMINÉ**, sauf deux cas strictement bornés :
   - **fixture de démo** (`lib/*-data.ts`) : conservée comme FALLBACK déterministe quand la passerelle est indisponible (`source:"demo"`), **jamais la source** ;
   - **logique-pure-client-UX** (évaluateur Expr à la frappe, réducteur d'édition live, routeur optimiste) : conservée UNIQUEMENT comme feedback instantané + fallback offline, **clairement marquée dégradée** (`// fallback offline, jamais la source`), et toute valeur persistée est **RE-VÉRIFIÉE par le moteur** (le client propose, le moteur dispose). Le cœur déterministe correspondant est exposé en outil passerelle (`expr_eval`, `operation_build`, `wall_route`).
3. **La passerelle reste la seule porte** : le mur s'applique côté serveur (scope → truth-write refusé → below-the-line routé). Une écriture de vérité ne part jamais d'un écran (idée → mirror → /goal → ChangeSet).
4. **Cliquet anti-retour** (§5, n'AJOUTE qu'une garde) : un hook + arch-fitness (dependency-cruiser) **interdit** qu'un panneau produise une donnée affichée à partir d'un twin-logique hors d'une frontière `source:"demo"` ; un **mirror de parité** par serveur dispatché prouve `Decoder TS == sortie Go`.

## Le plan d'élimination (tranches ordonnées)

- **T0** — figer la vérité du terrain (16 panneaux live, ~194 twins-logique, 45 `*-data.ts` = fallback conservé).
- **T1** — les **doublons d'un moteur DÉJÀ dispatché** (15 serveurs) : Decoder + readVia, supprimer le twin. AUCUN outil neuf. ~15-20 panneaux.
- **T2** — le serveur Go **existe** (88 serveurs `back/mcp/*`) mais hors `serverBuilders` : ajouter un builder lazy (additif). ~40-50 panneaux.
- **T3** — **needs-new-tool** : le paquet Go existe sans serveur MCP → scaffolder le serveur (spike+ADR). ~23 panneaux.
- **T4** — **client-UX** : exposer ≤15 cœurs déterministes en outils ; le TS survit en fallback-dégradé re-vérifié, jamais la source.
- **T5** — armer le **cliquet anti-retour** dès T1.

## Conséquences

- **+** single-source restauré : une seule logique (le Go), le front l'appelle. Le moteur cesse de dormir.
- **+** la dérive twin↔Go disparaît (plus de 2ᵉ logique) ; le fallback devient une fixture figée + un feedback re-vérifié, pas une réimplémentation.
- **−** latence : chaque lecture devient un `gateway_call`. Atténué : dispatch IN-PROCESS (< 50 ms), cache par requête (Server Actions), feedback-à-la-frappe gardé en TS optimiste. Gate à +100 ms p95.
- **−** offline : géré par le fallback `source:"demo"` déterministe (la SDK ne jette jamais — ADR 0074), badge honnête.
- **done COMPTÉ, jamais déclaré** : un panneau est « flippé » ssi `source:"live"` sur passerelle armée ∧ twin retiré ∧ mirror de parité vert.

## Alternatives écartées

- *Garder les twins comme chemin live (statu quo 0072)* : c'est la cause de la dormance + la dérive. Rejeté par la directive.
- *Tout flipper d'un coup* : 194 twins, risque + latence non mesurée. On procède en tranches, piloté par panneau-rendu-live, le cliquet armé tôt.
