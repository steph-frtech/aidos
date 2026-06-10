import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FIXTURES, fixtureSlug, verdict } from "@/lib/v2/operations";

/**
 * /v2/operations — l'INDEX des fixtures Operation DSL (S10) rejouables (étape WB2-12).
 *
 * Liste les fixtures connues (le registre clos) ; chaque entrée mène à son écran de rejeu
 * /v2/operations/[op]. Themed + bilingue. Le mur intact : lecture seule.
 */
export default async function V2OperationsIndex() {
	const t = await getTranslations("v2Operations");
	const fixtures = Object.values(FIXTURES);

	return (
		<div className="mx-auto w-full max-w-3xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-ops-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("homeTitle")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-ops-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p className="max-w-2xl text-base leading-relaxed text-foreground">
					{t("indexSubtitle")}
				</p>
			</section>

			<ul data-testid="v2-ops-list" className="space-y-3">
				{fixtures.map((f) => {
					const v = verdict(f);
					return (
						<li key={f.id}>
							<Link
								href={`/v2/operations/${fixtureSlug(f.id)}`}
								data-testid={`v2-ops-link-${fixtureSlug(f.id)}`}
								className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted"
							>
								<div className="space-y-1">
									<code className="font-mono text-sm font-semibold text-card-foreground">
										{f.id}
									</code>
									<p className="text-xs text-muted-foreground">
										{f.command.name} →{" "}
										{f.expectedEvents.length > 0
											? f.expectedEvents.join(", ")
											: t("deniedHint")}
									</p>
								</div>
								<span
									className={`inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-semibold ${
										v.pass
											? "bg-primary/10 text-primary"
											: "bg-destructive/10 text-destructive"
									}`}
								>
									{v.pass ? t("pass") : t("fail")}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
