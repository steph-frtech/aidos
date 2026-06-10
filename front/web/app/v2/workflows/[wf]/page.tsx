import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { workflowBySlug, workflowSlugs } from "@/lib/v2/workflows";
import { WorkflowClient } from "../WorkflowClient";

/**
 * /v2/workflows/[wf] — un SCÉNARIO rendu en PIPELINE FKE-3 (étape WB2-13 ; ADR 0010 · 0011 · 0053).
 *
 * Le segment [wf] est le slug d'un scénario (id avec « / » → « -- »). Un slug inconnu → 404 (totalité :
 * seuls les scénarios déclarés existent). L'écran est ACTION-CAPABLE : on AFFICHE le pipeline (nœuds
 * custom étape/gate/décision, pan/zoom React Flow), on DÉPLACE un nœud (édition PROPOSÉE, non écrite),
 * on RÉINITIALISE — tout délégué au twin pur lib/v2/workflows.ts. Themed + bilingue. Le mur intact.
 */

const KEYS = [
	"pass",
	"fail",
	"countsHeading",
	"stepsLabel",
	"gateLabel",
	"decisionLabel",
	"endLabel",
	"legendHeading",
	"legendStep",
	"legendGate",
	"legendDecision",
	"legendEnd",
	"moveHint",
	"proposeMoveBtn",
	"resetMoveBtn",
	"proposedAt",
	"notProposed",
] as const;

export function generateStaticParams() {
	return workflowSlugs().map((wf) => ({ wf }));
}

export default async function V2WorkflowScreen({
	params,
}: {
	params: Promise<{ wf: string }>;
}) {
	const { wf } = await params;
	const fixture = workflowBySlug(wf);
	if (fixture === undefined) notFound();

	const t = await getTranslations("v2Workflows");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-3xl space-y-8">
			<Link
				href="/v2/workflows"
				data-testid="v2-wf-back"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("title")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-wf-screen-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p
					data-testid="v2-wf-subtitle"
					className="max-w-2xl text-base leading-relaxed text-foreground"
				>
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-wf-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
				<code
					data-testid="v2-wf-fixture-id"
					className="inline-block rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground"
				>
					{fixture.id}
				</code>
			</section>

			<WorkflowClient fixture={fixture} t={strings} />
		</div>
	);
}
