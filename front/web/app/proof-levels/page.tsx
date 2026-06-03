import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { type Level, ProofLevelsExplorer } from "./ProofLevelsExplorer";

export const metadata: Metadata = {
	title: "Les couches de preuve (N0–N5) — AIDOS Workbench",
	description:
		"Un explorateur interactif des six niveaux de preuve de KRD : cliquez une couche pour voir sa langue de certification, sa forme de preuve et qui certifie (humain au-dessus de la ligne de flottaison, agent en dessous).",
};

/**
 * /proof-levels — an interactive N0→N5 ladder. The reader clicks a level and sees its
 * certification language, proof form and who certifies. Server Component (strings via
 * next-intl, ADR 0011; tokens, ADR 0010); the selection lives in ProofLevelsExplorer.
 * Read-only; links to the full Mintlify catalogue. The wall is untouched.
 */
export default async function ProofLevelsPage() {
	const t = await getTranslations("proofLevels");

	const levels: Level[] = ["n0", "n1", "n2", "n3", "n4", "n5"].map((k) => ({
		key: k,
		level: t(`levels.${k}.level`),
		name: t(`levels.${k}.name`),
		proves: t(`levels.${k}.proves`),
		form: t(`levels.${k}.form`),
		cert: t(`levels.${k}.cert`),
		verdict: t(`levels.${k}.verdict`),
		pos: t(`levels.${k}.pos`) as "above" | "below",
	}));

	const labels = {
		pick: t("pick"),
		waterline: t("waterline"),
		fProves: t("fProves"),
		fForm: t("fForm"),
		fCert: t("fCert"),
		fVerdict: t("fVerdict"),
		above: t("above"),
		below: t("below"),
		proseNote: t("proseNote"),
	};

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{t("eyebrow")}
					</span>
					<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
						{t("subtitle")}
					</p>
				</header>

				<div className="mt-10">
					<ProofLevelsExplorer levels={levels} labels={labels} />
				</div>

				<footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
					<a
						href="https://aidos.mintlify.app/concepts/certification-languages"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
					>
						{t("docLink")}
					</a>
				</footer>
			</main>
		</div>
	);
}
