# ROADMAP — HEADROOM : compression de contexte / plafond tokens (`/long-run`-exécutable, spike-gated)

> Sujet **HR** (ids `HR01+`). Lancer : `/long-run {planPath:'docs/plan/ROADMAP-headroom.md', startFrom:'HR01'}`.
> **Spike-gate** : `HR01` est un spike de nécessité ; s'il conclut « gain non rentable / déterminisme menacé », le sujet **s'arrête là** (à bon escient).
> Discipline (toutes les étapes) : **mirror-first** (miroir rouge avant code) · **le mur** (rien n'écrit `kernel/mirrors/fitness`) · **determinism-first** (la compression LLM-input est l'exception gatée, jamais autoritaire) · outil **replaceable derrière un port** (ADR) · « Done » calculé, jamais déclaré.
> But : `chopratejas/headroom` comprime le contexte **avant le LLM** (60–95 % tokens), réversible (CCR/`retrieve`). On le branche **uniquement sur l'entrée LLM** (`ContextPack`+transcript), pas sur les entrées déterministes ni le truth-store ; il étend la marge **sous** le cap budget, ne le relève jamais.

## HR01
**Objectif:** Spike — sonder dans `/spike/headroom/` le gain réel de tokens sur des prompts AIDOS (ContextPack + transcript) et prouver que `retrieve∘compress` préserve les faits porteurs ; décision go/no-go.
**Detail:** docs/plan/ROADMAP-headroom.md
**Inputs:** S33, BA17
**Criteres de done:** un spike confiné `/spike/` mesure réduction tokens + fidélité ; OpenQuestion si non concluant ; verdict go/no-go documenté (si no-go, le sujet s'arrête).

## HR02
**Objectif:** Runtime — ADR « compression de contexte (replaceable) » + port Go `ContextCompressor{Compress(pack)→(compacted,handle); Retrieve(handle)→original}` dans `back/runtime/context`.
**Detail:** docs/plan/ROADMAP-headroom.md
**Inputs:** HR01
**Criteres de done:** ADR accepté + port typé + miroir property du contrat (idempotence du handle, `Retrieve` rend l'original) ∧ le mur (lecture seule, hors truth-store).

## HR03
**Objectif:** Runtime — adapter `headroom` en sidecar via son MCP derrière le port + miroir d'invariance.
**Detail:** docs/plan/ROADMAP-headroom.md
**Inputs:** HR02
**Criteres de done:** miroir property ROUGE d'abord — **le verdict `GateAction` est invariant à la compression** (même structure d'action) ∧ `retrieve∘compress` préserve les faits porteurs ∧ déterminisme du gate intact.

## HR04
**Objectif:** Runtime — câbler le compresseur dans `agentloop.Drive` avant `GenerateAction` + intégrer au budget (S51/BA11/BA27).
**Detail:** docs/plan/ROADMAP-headroom.md
**Inputs:** HR03, S51, BA27
**Criteres de done:** fixture — un `AgentRun` rejoué avec/sans compression donne le **même verdict d'actions**, tokens mesurés ↓, `CheckBudget` cohérent, le cap n'est jamais relevé.

## HR05
**Objectif:** Workbench — section « Compression / économie » du panneau `/agents` (tokens avant/après par run) + Playwright e2e + 2 pages Mintlify.
**Detail:** docs/plan/ROADMAP-headroom.md
**Inputs:** HR04
**Criteres de done:** la route rend l'économie par run (thémée ADR 0010 + bilingue ADR 0011) ∧ e2e vert ∧ pages « Pour moi » live.
