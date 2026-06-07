import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

export const metadata: Metadata = {
	title: "App Builder — développez VOTRE app — AIDOS Workbench",
	description:
		"Le hub de l'app-builder : tout le parcours « de l'intention au bouton » accessible depuis un seul écran — déclarer le besoin, prouver les vérités, émettre, provisionner & déployer, gouverner. Chaque capacité live est cliquable ; les capacités planifiées portent leur référence de feuille de route.",
};

/**
 * /app-builder — the App Builder HUB (ADR 0010 design system + ADR 0011 bilingue).
 * A journey-organized index that surfaces EVERYTHING the app-builder offers from one
 * screen ("tout se fait par écran") — the EL need-declaration gestures, the engine
 * kernel/proof panels, the emitters, the provisioning/deploy track (DP, ADR 0043 =
 * Pulumi/TS IaC language), and the multi-tenant/SaaS product capabilities. LIVE items
 * deep-link to their existing route; PLANNED items carry their roadmap ref (DP/Sxx).
 * Server Component, read-only; the wall is untouched.
 */

type Item =
	| { href: string; navKey: string } // live capability — label from the `nav` namespace
	| { plannedKey: string; ref: string }; // planned capability — label from `appBuilder.planned`

type Section = { key: string; live: boolean; items: Item[] };

const SECTIONS: Section[] = [
	{
		key: "besoin",
		live: true,
		items: [
			{ href: "/compound-besoin", navKey: "compound" },
			{ href: "/besoin-intake", navKey: "besoinIntake" },
			{ href: "/besoin-invariant", navKey: "besoinInvariant" },
			{ href: "/emit-ideas", navKey: "emitIdeas" },
			{ href: "/red-backlog", navKey: "redBacklog" },
			{
				href: "/compound-besoin-capitalisation",
				navKey: "besoinCapitalisation",
			},
		],
	},
	{
		key: "prove",
		live: true,
		items: [
			{ href: "/ideas", navKey: "ideas" },
			{ href: "/goal", navKey: "goal" },
			{ href: "/contract", navKey: "contract" },
			{ href: "/operation", navKey: "operation" },
			{ href: "/control", navKey: "control" },
			{ href: "/mirrors", navKey: "mirrors" },
			{ href: "/completeness", navKey: "completeness" },
			{ href: "/proof-levels", navKey: "proofLevels" },
		],
	},
	{
		key: "emit",
		live: true,
		items: [
			{ href: "/emitted-target", navKey: "emittedTarget" },
			{ href: "/emitters", navKey: "emitters" },
			{ href: "/entity-map", navKey: "entityMap" },
			{ href: "/api-projection", navKey: "apiProjection" },
			{ href: "/db-projection", navKey: "dbProjection" },
			{ href: "/web-preview", navKey: "webPreview" },
		],
	},
	{
		key: "deploy",
		live: false,
		items: [
			{ plannedKey: "stackManifest", ref: "DP02–DP05" },
			{ plannedKey: "environments", ref: "DP06–DP09" },
			{ plannedKey: "bootstrap", ref: "DP10–DP13" },
			{ plannedKey: "substrate", ref: "DP14–DP18" },
			{ plannedKey: "connectors", ref: "DP19–DP24" },
			{ plannedKey: "deployCockpit", ref: "DP25–DP29" },
			{ plannedKey: "appOps", ref: "DP30–DP33" },
		],
	},
	{
		key: "product",
		live: false,
		items: [
			{ plannedKey: "projects", ref: "S53–S57" },
			{ plannedKey: "gateway", ref: "S58–S60" },
			{ plannedKey: "appAuth", ref: "S61–S63" },
			{ plannedKey: "modeler", ref: "S71–S77" },
			{ plannedKey: "buildLoop", ref: "S83–S87" },
			{ plannedKey: "federation", ref: "S100–S105" },
			{ plannedKey: "reality", ref: "S106–S109" },
			{ plannedKey: "saas", ref: "S114–S117" },
		],
	},
];

export default async function AppBuilderPage() {
	const t = await getTranslations("appBuilder");
	const tn = await getTranslations("nav");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />
			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-8">
				<header className="mb-8">
					<h1 className="text-2xl font-semibold tracking-tight">
						{t("title")}
					</h1>
					<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="flex flex-col gap-8">
					{SECTIONS.map((section) => (
						<section
							key={section.key}
							data-testid={`builder-section-${section.key}`}
							aria-label={t(`sections.${section.key}.title`)}
						>
							<div className="mb-3 flex items-center gap-3">
								<h2 className="text-base font-semibold">
									{t(`sections.${section.key}.title`)}
								</h2>
								<span
									className={
										section.live
											? "rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-primary"
											: "rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground"
									}
								>
									{section.live ? t("statusLive") : t("statusPlanned")}
								</span>
							</div>
							<p className="mb-3 text-sm text-muted-foreground">
								{t(`sections.${section.key}.desc`)}
							</p>
							<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
								{section.items.map((item) =>
									"href" in item ? (
										<li key={item.href}>
											<Link
												href={item.href}
												className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground"
											>
												<span>{tn(item.navKey)}</span>
												<span
													aria-hidden="true"
													className="text-xs text-muted-foreground"
												>
													→
												</span>
											</Link>
										</li>
									) : (
										<li key={item.plannedKey}>
											<div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
												<span>{t(`planned.${item.plannedKey}`)}</span>
												<span className="font-mono text-[0.65rem] text-muted-foreground/70">
													{item.ref}
												</span>
											</div>
										</li>
									),
								)}
							</ul>
						</section>
					))}
				</div>

				<p className="mt-10 text-xs text-muted-foreground">{t("footnote")}</p>
			</main>
		</div>
	);
}
