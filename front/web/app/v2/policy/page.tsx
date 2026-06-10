import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { nodeCounts, POLICIES, policySlug } from "@/lib/v2/policy";

/**
 * /v2/policy — l'INDEX des POLICIES (la Policy DSL, KRD §24.4) (étape WB2-14).
 *
 * Liste les policies connues (le registre clos, réutilise l'anchor §93 canPlaceOrder + un exemple
 * FIELD any/not) ; chaque entrée mène à son arbre /v2/policy/[policy]. Themed + bilingue. Le mur
 * intact : lecture seule (la policy n'est écrite que par le CLI via un ChangeSet approuvé).
 */
export default async function V2PolicyIndex() {
	const t = await getTranslations("v2Policy");
	const policies = Object.values(POLICIES);

	return (
		<div className="mx-auto w-full max-w-3xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-policy-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("homeTitle")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-policy-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p className="max-w-2xl text-base leading-relaxed text-foreground">
					{t("indexSubtitle")}
				</p>
			</section>

			<ul data-testid="v2-policy-list" className="space-y-3">
				{policies.map((p) => {
					const slug = policySlug(p.name);
					const c = nodeCounts(p.rule);
					return (
						<li key={p.name}>
							<Link
								href={`/v2/policy/${slug}`}
								data-testid={`v2-policy-link-${slug}`}
								className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
							>
								<div className="space-y-1">
									<code className="font-mono text-sm font-semibold text-card-foreground">
										{p.name}
									</code>
									<p className="text-xs text-muted-foreground">
										{p.scope} · {p.target} · {c.combinators}+{c.leaves}{" "}
										{t("nodesShort")}
									</p>
								</div>
								<span
									className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-semibold ${
										p.effect === "ALLOW"
											? "bg-primary/10 text-primary"
											: "bg-destructive/10 text-destructive"
									}`}
								>
									{p.effect}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
