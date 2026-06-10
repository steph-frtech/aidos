import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { policyBySlug, policySlugs, samplesFor } from "@/lib/v2/policy";
import { PolicyClient } from "../PolicyClient";

/**
 * /v2/policy/[policy] — une POLICY rendue comme un ARBRE RÉCURSIF ALLOW/DENY (étape WB2-14 ; ADR
 * 0010 · 0011). Le segment [policy] est le nom de la policy (slug = nom). Un slug inconnu → 404
 * (totalité : seules les policies déclarées existent). L'écran est ACTION-CAPABLE : on DÉPLIE l'arbre
 * (React Arborist) et on ÉVALUE un contexte d'exemple (chaque nœud HOLD/FAIL, la décision §93) —
 * tout délégué au twin pur lib/v2/policy.ts. Themed + bilingue. Le mur intact (lecture/évaluation).
 */

const KEYS = [
	"eyebrow",
	"title",
	"subtitle",
	"wallNote",
	"scopeLabel",
	"targetLabel",
	"effectLabel",
	"combinatorsLabel",
	"leavesLabel",
	"evalHeading",
	"evalHint",
	"decisionLabel",
	"holdLabel",
	"failLabel",
	"legendHeading",
	"legendAll",
	"legendAny",
	"legendNot",
	"legendLeaf",
] as const;

export function generateStaticParams() {
	return policySlugs().map((policy) => ({ policy }));
}

export default async function V2PolicyScreen({
	params,
}: {
	params: Promise<{ policy: string }>;
}) {
	const { policy: slug } = await params;
	const policy = policyBySlug(slug);
	if (policy === undefined) notFound();

	const t = await getTranslations("v2Policy");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));
	const samples = samplesFor(policy.name);

	return (
		<div className="mx-auto w-full max-w-3xl space-y-8">
			<Link
				href="/v2/policy"
				data-testid="v2-policy-back"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("title")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-policy-screen-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p
					data-testid="v2-policy-subtitle"
					className="max-w-2xl text-base leading-relaxed text-foreground"
				>
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-policy-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
				<code
					data-testid="v2-policy-name"
					className="inline-block rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground"
				>
					{policy.name}
				</code>
			</section>

			<PolicyClient policy={policy} samples={samples} t={strings} />
		</div>
	);
}
