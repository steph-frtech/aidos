"use client";

import Link from "next/link";
import { useState } from "react";
import { type MirrorForm, mirrorForms } from "@/lib/besoin-completeness";
import { SOURCE_ORDER } from "@/lib/besoin-grammar";
import { FACETS } from "@/lib/facets";
import { ENV_LADDER, INTENT_KINDS, type IntentKind } from "@/lib/v2/builder";
import { MIN_MIRROR_LEN } from "@/lib/v2/goal";
import { MIN_INTENT_LEN } from "@/lib/v2/idea";
import { SCREENS } from "@/lib/v2/screens";
import { useV3Session } from "../V3Session";

/**
 * /v3/parametrage — LES PARAMÈTRES : TOUTES les vérités DÉCLARÉES du produit, noir sur
 * blanc (§8 — déclarées au-dessus de la ligne, jamais apprises) : les gestes du chat
 * (INTENT_KINDS + la phrase canonique), l'échelle (ENV_LADDER), les niveaux
 * (SOURCE_ORDER), les 8 facettes (FACETS), les formes de preuve (mirrorForms), les
 * seuils (MIN_INTENT_LEN, MIN_MIRROR_LEN) et les écrans atteignables.
 *
 * LE MUR (§2), copie amicale : ces réglages ne se modifient JAMAIS en silence —
 * « Proposer un changement » ENVOIE une capture d'idée au chat (send — la porte légale
 * idée → miroir → /goal), jamais un écrit direct. Le module source de chaque valeur
 * vit replié dans <details> (le détail technique, jamais imposé).
 */

/** Une LIGNE de paramètre : le libellé amical, la valeur déclarée, le module source. */
interface ParamRow {
	readonly label: string;
	readonly value: string;
	readonly source: string;
}

/** La PHRASE CANONIQUE prouvée par intention (le jeu clos — lib/v2/builder + son miroir). */
const CANONICAL_PHRASES: Record<IntentKind, string> = {
	capturer_idee: "capture l'idée : <besoin>",
	greffer: "greffe <libellé> sous <chemin>",
	promouvoir: "promeus la dernière idée",
	generer: "génère l'application",
	deployer: "déploie l'application en test | staging | prod",
	delta: "montre le delta depuis la prod",
	impacter: "quel impact si je modifie <chemin>",
	interroger: "montre-moi l'état du projet",
	ouvrir: "ouvre l'écran <nom>",
};

/** Le libellé AMICAL par intention (clé i18n — les mêmes que les chips du lab). */
const INTENT_LABEL_KEYS: Record<IntentKind, string> = {
	capturer_idee: "intentCapturerIdee",
	greffer: "intentGreffer",
	promouvoir: "intentPromouvoir",
	generer: "intentGenerer",
	deployer: "intentDeployer",
	delta: "intentDelta",
	impacter: "intentImpacter",
	interroger: "intentInterroger",
	ouvrir: "intentOuvrir",
};

/** Le libellé AMICAL par forme de preuve (clé i18n) — la forme technique reste la valeur. */
const PROOF_LABEL_KEYS: Record<MirrorForm, string> = {
	gherkin_n0: "paramsProofGherkin",
	screen_fixture: "paramsProofScreen",
	fixture_n2: "paramsProofFixture",
	property_n1: "paramsProofProperty",
};

export function ParamsClient() {
	const { state, send, busy, strings: t } = useV3Session();
	// La section dont la demande de changement vient d'être envoyée (la note façon toast).
	const [proposed, setProposed] = useState<string | null>(null);

	// ── les SECTIONS — chaque valeur est lue de son module déclaré, jamais recopiée ──
	const sections: readonly {
		readonly id: string;
		readonly title: string;
		readonly hint: string;
		readonly rows: readonly ParamRow[];
	}[] = [
		{
			id: "gestes",
			title: t.paramsGestures,
			hint: t.paramsGesturesHint,
			rows: INTENT_KINDS.map((k) => ({
				label: t[INTENT_LABEL_KEYS[k]],
				value: CANONICAL_PHRASES[k],
				source: "lib/v2/builder.ts · INTENT_KINDS",
			})),
		},
		{
			id: "echelle",
			title: t.paramsLadder,
			hint: t.paramsLadderHint,
			rows: [
				{
					label: t.paramsLadderOrder,
					value: ENV_LADDER.join(" → "),
					source: "lib/v2/builder.ts · ENV_LADDER",
				},
			],
		},
		{
			id: "niveaux",
			title: t.paramsLevels,
			hint: t.paramsLevelsHint,
			rows: [
				{
					label: t.paramsLevelsOrder,
					value: SOURCE_ORDER.join(" → "),
					source: "lib/besoin-grammar.ts · SOURCE_ORDER",
				},
			],
		},
		{
			id: "facettes",
			title: t.paramsFacets,
			hint: t.paramsFacetsHint,
			rows: FACETS.map((f) => ({
				label: f.letter,
				value: f.name,
				source: "lib/facets.ts · FACETS",
			})),
		},
		{
			id: "preuves",
			title: t.paramsProofs,
			hint: t.paramsProofsHint,
			rows: mirrorForms().map((f) => ({
				label: t[PROOF_LABEL_KEYS[f]],
				value: f,
				source: "lib/besoin-completeness.ts · mirrorForms()",
			})),
		},
		{
			id: "seuils",
			title: t.paramsThresholds,
			hint: t.paramsThresholdsHint,
			rows: [
				{
					label: t.paramsMinIntent,
					value: `${MIN_INTENT_LEN} ${t.paramsChars}`,
					source: "lib/v2/idea.ts · MIN_INTENT_LEN",
				},
				{
					label: t.paramsMinMirror,
					value: `${MIN_MIRROR_LEN} ${t.paramsChars}`,
					source: "lib/v2/goal.ts · MIN_MIRROR_LEN",
				},
			],
		},
		{
			id: "ecrans",
			title: t.paramsScreens,
			hint: t.paramsScreensHint,
			rows: [
				{
					label: t.paramsScreensSession,
					value: String(state.screens.length),
					source: "app/v3/V3Session.tsx · state.screens",
				},
				{
					label: t.paramsScreensV2,
					value: String(SCREENS.length),
					source: "lib/v2/screens.ts · SCREENS",
				},
			],
		},
	];

	/** « Proposer un changement » : la capture d'idée part au chat (la porte légale, le mur). */
	const propose = (id: string, title: string) => {
		void send(`capture l'idée : changer ${title}`);
		setProposed(id);
	};

	return (
		<div data-testid="v3-params" className="mx-auto w-full max-w-3xl space-y-6">
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t.paramsTitle}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t.paramsIntro}
				</p>
			</header>

			{/* ── LE MUR, en clair et en amical : jamais de modification silencieuse ── */}
			<p className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
				{t.paramsWall}
			</p>

			{sections.map((s) => (
				<section
					key={s.id}
					className="space-y-3 rounded-xl border border-border bg-card p-4"
				>
					<div className="space-y-1">
						<h2 className="text-sm font-semibold text-foreground">{s.title}</h2>
						<p className="text-xs leading-relaxed text-muted-foreground">
							{s.hint}
						</p>
					</div>

					<ul className="space-y-2">
						{s.rows.map((row) => (
							<li
								key={`${row.label}·${row.value}`}
								data-testid="v3-param"
								className="space-y-1.5 rounded-md border border-border bg-muted/30 px-3 py-2"
							>
								<div className="flex flex-wrap items-baseline gap-2">
									<span className="text-xs font-medium text-foreground">
										{row.label}
									</span>
									<span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
										{row.value}
									</span>
								</div>
								{/* · le module source — le détail technique, toujours replié */}
								<details data-testid="v3-details">
									<summary className="cursor-pointer text-[11px] text-muted-foreground">
										{t.paramsSourceLabel}
									</summary>
									<p className="mt-1 font-mono text-[11px] text-muted-foreground">
										{row.source}
									</p>
								</details>
							</li>
						))}
					</ul>

					<button
						type="button"
						data-testid="v3-param-propose"
						disabled={busy}
						onClick={() => propose(s.id, s.title)}
						className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
					>
						{t.paramsPropose}
					</button>

					{/* · la note façon toast : la demande est partie au chat (une idée à approuver) */}
					{proposed === s.id && (
						<p
							data-testid="v3-param-proposed"
							className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-foreground"
						>
							<span>{t.paramsProposed}</span>
							<Link
								href="/v3/lab"
								className="font-medium text-primary hover:underline"
							>
								{t.paramsProposedLink} →
							</Link>
						</p>
					)}
				</section>
			))}
		</div>
	);
}
