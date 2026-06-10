import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AnatomyClient } from "./AnatomyClient";

/**
 * WB2-06 — /v2/anatomie/[kernel] : l'ANATOMIE 1-pour-1 d'un kernel, les SIX paires-miroir autour du
 * MUR (Spec↔Doc · Comportement↔Résultats · Scénarios↔Tests · Modèle↔Projection · Contrat↔Code ·
 * Evidence-attendue↔Evidence-observée). AU-DESSUS du mur = DÉCLARÉ (humain) ; EN DESSOUS = PROUVÉ
 * (machine, read-only). Un voyant 🟢/🔴/🟡 par paire, COMPUTÉ par le twin pur (lib/v2/anatomy),
 * jamais déclaré (CLAUDE.md §8).
 *
 * ACTION-CAPABLE (ui-completeness) : cliquer une paire l'ouvre (descend dans son détail). Themed +
 * bilingue (FR d'abord, ADR 0010/0011). Le mur intact : projection de lecture, aucune écriture-vérité
 * — la cible du clic depuis l'arbre /v2/kernels et depuis la grille /v2/grille (les ids résolvent).
 */
export default async function V2AnatomyPage({
	params,
}: {
	params: Promise<{ kernel: string }>;
}) {
	const { kernel } = await params;
	const t = await getTranslations("v2Anatomie");

	// Toutes les chaînes que le client rend (faces des six paires + libellés d'état + voyants).
	const strings: Record<string, string> = {
		overall: t("overall"),
		aboveWall: t("aboveWall"),
		belowWall: t("belowWall"),
		wall: t("wall"),
		declaredSide: t("declaredSide"),
		provenSide: t("provenSide"),
		readOnlyNote: t("readOnlyNote"),
		"voyant.green": t("voyant.green"),
		"voyant.red": t("voyant.red"),
		"voyant.amber": t("voyant.amber"),
		"declared.declared": t("declared.declared"),
		"declared.absent": t("declared.absent"),
		"proven.pass": t("proven.pass"),
		"proven.fail": t("proven.fail"),
		"proven.pending": t("proven.pending"),
		"proven.absent": t("proven.absent"),
		"pair.spec_doc": t("pair.spec_doc"),
		"pair.behavior_results": t("pair.behavior_results"),
		"pair.scenarios_tests": t("pair.scenarios_tests"),
		"pair.model_projection": t("pair.model_projection"),
		"pair.contract_code": t("pair.contract_code"),
		"pair.evidence": t("pair.evidence"),
		"specDoc.above": t("specDoc.above"),
		"specDoc.below": t("specDoc.below"),
		"behaviorResults.above": t("behaviorResults.above"),
		"behaviorResults.below": t("behaviorResults.below"),
		"scenariosTests.above": t("scenariosTests.above"),
		"scenariosTests.below": t("scenariosTests.below"),
		"modelProjection.above": t("modelProjection.above"),
		"modelProjection.below": t("modelProjection.below"),
		"contractCode.above": t("contractCode.above"),
		"contractCode.below": t("contractCode.below"),
		"evidence.above": t("evidence.above"),
		"evidence.below": t("evidence.below"),
	};

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6">
			<Link
				href="/v2/kernels"
				data-testid="v2-anatomie-back"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("backToTree")}
			</Link>
			<section className="space-y-3">
				<h1
					data-testid="v2-anatomie-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
					<span className="text-muted-foreground">{t("kernelLabel")} : </span>
					<span
						data-testid="v2-anatomie-kernel-id"
						className="font-mono text-foreground"
					>
						{kernel}
					</span>
				</div>
				<div
					data-testid="v2-anatomie-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<AnatomyClient kernelId={kernel} t={strings} />
		</div>
	);
}
