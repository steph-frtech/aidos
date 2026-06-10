import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fixtureBySlug, fixtureSlugs } from "@/lib/v2/operations";
import { OperationReplayClient } from "../OperationReplayClient";

/**
 * /v2/operations/[op] — une FIXTURE Operation DSL (S10) `état → commande → events` rendue + EXÉCUTÉE
 * comme machine XState (étape WB2-12 ; KRD §24.3, §93 ; ADR 0010 · 0011 · 0053).
 *
 * Le segment [op] est le slug d'une fixture (id avec « / » → « -- »). Un slug inconnu → 404 (totalité :
 * seules les fixtures déclarées existent). L'écran est ACTION-CAPABLE : on REJOUE la fixture pas-à-pas
 * (les events apparaissent), on visualise le GRAPHE D'ÉTATS (React Flow), on RECOMMENCE — tout délégué
 * au twin pur lib/v2/operations.ts. Themed + bilingue. Le mur intact : rejouer n'écrit aucune vérité.
 */

const KEYS = [
	"pass",
	"fail",
	"givenLabel",
	"commandLabel",
	"expectedEventsLabel",
	"currentStateHeading",
	"stateLabel",
	"initState",
	"emittedLabel",
	"stepBtn",
	"replayAllBtn",
	"restartBtn",
] as const;

export function generateStaticParams() {
	return fixtureSlugs().map((op) => ({ op }));
}

export default async function V2OperationScreen({
	params,
}: {
	params: Promise<{ op: string }>;
}) {
	const { op } = await params;
	const fixture = fixtureBySlug(op);
	if (fixture === undefined) notFound();

	const t = await getTranslations("v2Operations");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-3xl space-y-8">
			<Link
				href="/v2/operations"
				data-testid="v2-op-back"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("title")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-op-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p
					data-testid="v2-op-subtitle"
					className="max-w-2xl text-base leading-relaxed text-foreground"
				>
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-op-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<OperationReplayClient fixture={fixture} t={strings} />
		</div>
	);
}
