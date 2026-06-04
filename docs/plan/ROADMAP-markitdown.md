# ROADMAP — MARKITDOWN : ingestion document→markdown (`/long-run`-exécutable, spike-gated)

> Sujet **MK** (ids `MK01+`). Lancer : `/long-run {planPath:'docs/plan/ROADMAP-markitdown.md', startFrom:'MK01'}`.
> **Spike-gate** : `MK01` valide un cas réel d'ingestion ; sinon le sujet s'arrête (« si nécessaire »).
> Discipline : **mirror-first** · **le mur** (l'ingestion produit une **idée** via `idea-intake`, jamais une vérité) · **determinism-first** (parsing déterministe → lib + miroir d'idempotence) · port **replaceable** (ADR).
> But : `microsoft/markitdown` convertit PDF/DOCX/PPTX/XLSX/HTML/img(OCR)/audio/YouTube → markdown. **Frontière d'ingestion uniquement** ; PAS pour le code (les émetteurs/AST le possèdent), PAS dans le kernel.

## MK01
**Objectif:** Spike — dans `/spike/markitdown/`, convertir un doc réel (ex. une spec PDF) → markdown → idée draft ; mesurer fidélité/idempotence ; go/no-go.
**Detail:** docs/plan/ROADMAP-markitdown.md
**Inputs:** S27
**Criteres de done:** un spike confiné prouve la conversion + l'idempotence sur un cas réel ; verdict documenté (no-go ⇒ arrêt).

## MK02
**Objectif:** Runtime — skill `.claude/skills/markitdown/SKILL.md` + port `DocConverter{ToMarkdown(bytes,mime)→md}` + miroir property d'idempotence.
**Detail:** docs/plan/ROADMAP-markitdown.md
**Inputs:** MK01
**Criteres de done:** miroir ROUGE d'abord — « même fichier → même markdown » (déterministe/idempotent) ∧ ADR replaceable ∧ la skill suit le format maison.

## MK03
**Objectif:** Runtime — outil MCP `convert_to_markdown` dans `back/mcp/idea-intake`, feeding `idea_capture` (provenance conservée) + Playwright/e2e + 2 pages Mintlify.
**Detail:** docs/plan/ROADMAP-markitdown.md
**Inputs:** MK02
**Criteres de done:** convertir un doc fixture → idée draft avec provenance, **aucune écriture kernel** ; e2e vert ; pages « Pour moi » live.
