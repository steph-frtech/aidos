import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import {
	type BasculeLabels,
	type ELadderItem,
	EvidenceBascule,
} from "./EvidenceBascule";
import { type Level, ProofLevelsExplorer } from "./ProofLevelsExplorer";

export const metadata: Metadata = {
	title: "Les couches de preuve (E0–E7) — AIDOS Workbench",
	description:
		"L'échelle de preuve evidence-first E0-E7 (FK16, la bascule). Re-étiquetez un corpus de miroirs N vers E sans perte : chaque miroir gagne son E dérivé tout en conservant (et dépréciant, jamais supprimant) son ancien N.",
};

/**
 * /proof-levels — an interactive N0→N5 ladder. The reader clicks a level and sees its
 * certification language, proof form and who certifies. Server Component (strings via
 * next-intl, ADR 0011; tokens, ADR 0010); the selection lives in ProofLevelsExplorer.
 * Read-only; links to the full Mintlify catalogue. The wall is untouched.
 */
export default async function ProofLevelsPage() {
	const t = await getTranslations("proofLevels");
	const te = await getTranslations("proofLevels.bascule");

	const eLadder: ELadderItem[] = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({
		level: n,
		name: te(`ladder.e${n}.name`),
		desc: te(`ladder.e${n}.desc`),
	}));

	const basculeLabels: BasculeLabels = {
		ladderTitle: te("ladderTitle"),
		relabelTitle: te("relabelTitle"),
		relabelHint: te("relabelHint"),
		corpusLabel: te("corpusLabel"),
		relabelBtn: te("relabelBtn"),
		noLossOk: te("noLossOk"),
		noLossBad: te("noLossBad"),
		colMirror: te("colMirror"),
		colN: te("colN"),
		colLifecycle: te("colLifecycle"),
		colE: te("colE"),
		histTitle: te("histTitle"),
		deprecatedNote: te("deprecatedNote"),
	};

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
						{te("title")}
					</h1>
					<p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
						{te("subtitle")}
					</p>
				</header>

				{/* FK16 — la bascule E0-E7 (primary, action-capable) */}
				<div className="mt-10">
					<EvidenceBascule ladder={eLadder} labels={basculeLabels} />
				</div>

				{/* The legacy N0-N5 explorer — PRESERVED (anti-overwrite §9), now the deprecated lens */}
				<details className="mt-12 rounded-xl border border-border bg-muted/30 p-4">
					<summary
						data-testid="legacy-n-toggle"
						className="cursor-pointer text-sm font-semibold text-muted-foreground"
					>
						{te("legacyTitle")}
					</summary>
					<p className="mt-2 mb-4 text-xs text-muted-foreground">
						{te("legacyNote")}
					</p>
					<ProofLevelsExplorer levels={levels} labels={labels} />
				</details>

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
