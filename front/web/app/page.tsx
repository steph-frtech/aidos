import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";

/**
 * / — la vitrine du Workbench (ADR 0010 design system + ADR 0011 bilingue).
 * Server Component, libellés via next-intl (namespace `home`). Aucune logique de
 * données : seulement le titre, le partage des rôles et les cartes vers les
 * panneaux /contract et /store.
 */
export default async function Home() {
	const t = await getTranslations("home");

	const panels = [
		{
			href: "/contract",
			title: t("contractTitle"),
			description: t("contractDescription"),
		},
		{
			href: "/store",
			title: t("storeTitle"),
			description: t("storeDescription"),
		},
	] as const;

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-16 sm:px-8 sm:py-24">
				{/* Hero */}
				<section className="space-y-6">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<h1 className="max-w-3xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
						{t("subtitle")}
					</p>
				</section>

				{/* Panels */}
				<section aria-label={t("panels")} className="mt-16 space-y-6">
					<div className="space-y-1">
						<h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
							{t("panels")}
						</h2>
						<p className="text-sm text-muted-foreground">{t("panelsLead")}</p>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						{panels.map((panel) => (
							<Link
								key={panel.href}
								href={panel.href}
								className="group flex flex-col justify-between gap-6 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							>
								<div className="space-y-2">
									<h3 className="text-lg font-semibold tracking-tight text-card-foreground">
										{panel.title}
									</h3>
									<p className="text-sm leading-relaxed text-muted-foreground">
										{panel.description}
									</p>
								</div>
								<span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
									{t("explore")}
									<svg
										aria-hidden="true"
										viewBox="0 0 20 20"
										fill="currentColor"
										className="size-4 transition-transform group-hover:translate-x-0.5"
									>
										<path
											fillRule="evenodd"
											d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
											clipRule="evenodd"
										/>
									</svg>
								</span>
							</Link>
						))}
					</div>
				</section>

				{/* Footer */}
				<footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
					{t("footer")}
				</footer>
			</main>
		</div>
	);
}
