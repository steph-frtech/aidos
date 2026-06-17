"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { type IntentKind, withLiveLabels } from "@/lib/v2/builder";
import { type ParamSection, paramCatalog } from "@/lib/v3/params";
import { useV3Session } from "../V3Session";

/**
 * /v3/parametrage — LES PARAMÈTRES : TOUTES les vérités DÉCLARÉES de la V1 + V2, noir
 * sur blanc (§8 — déclarées au-dessus de la ligne, jamais apprises). L'écran ne
 * construit plus ses sections à la main : il REND le catalogue paramCatalog (le twin
 * pur lib/v3/params, épinglé par son miroir) — les gestes du chat, l'échelle, les
 * niveaux, les facettes, les preuves, les seuils, les écrans, LES AGENTS AVEC LEUR
 * HARNAIS, les modèles, l'autonomie A0..A8, les budgets §66.3, l'adoption §82.5, les
 * behaviors §24.6, le mur, les autorités §13.8, les liens §17 et les paires-miroir.
 *
 * LE MUR (§2), copie amicale : ces réglages ne se modifient JAMAIS en silence —
 * « Proposer un changement » ENVOIE une capture d'idée au chat (send — la porte légale
 * idée → miroir → /goal), jamais un écrit direct. Le module source de chaque valeur
 * vit replié dans <details> (le détail technique, jamais imposé). Une recherche
 * (repli des accents) filtre les lignes côté client — le catalogue, lui, ne bouge pas.
 */

/** Le libellé AMICAL par intention (clé i18n — les mêmes que les chips du lab). */
// L'écran « gestes du chat » itère INTENT_KINDS → reste COMPLET par construction (jamais un trou) :
// le NOYAU est écrit à la main, LES GESTES V3 reçoivent une clé i18n générique (ADR 0092).
const INTENT_LABEL_KEYS: Record<IntentKind, string> = withLiveLabels(
	{
		capturer_idee: "intentCapturerIdee",
		greffer: "intentGreffer",
		promouvoir: "intentPromouvoir",
		generer: "intentGenerer",
		deployer: "intentDeployer",
		delta: "intentDelta",
		impacter: "intentImpacter",
		interroger: "intentInterroger",
		ouvrir: "intentOuvrir",
		adapter: "intentAdapter",
		lancer_bench: "intentLancerBench",
		explorer_evolution: "intentExplorerEvolution",
	},
	"intentLectureLive",
	"intentProposition",
);

/** Replie les accents + la casse — « écran » et « Ecran » se trouvent pareil. */
function fold(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

export function ParamsClient() {
	const { state, send, busy, strings: t } = useV3Session();
	// La section dont la demande de changement vient d'être envoyée (la note façon toast).
	const [proposed, setProposed] = useState<string | null>(null);
	// La recherche — un filtre CLIENT sur libellé + valeur, jamais une mutation du catalogue.
	const [query, setQuery] = useState("");

	// ── LE CATALOGUE — le twin pur rend TOUTES les sections ; l'écran ne fait que les afficher ──
	const sections = useMemo(
		() => paramCatalog({ screensCount: state.screens.length }),
		[state.screens.length],
	);

	/** Le libellé affiché : les intentions du chat reçoivent leur libellé amical i18n. */
	const displayLabel = (sectionId: string, label: string): string =>
		sectionId === "chat" && label in INTENT_LABEL_KEYS
			? (t[INTENT_LABEL_KEYS[label as IntentKind]] ?? label)
			: label;

	// ── LE FILTRE — repli des accents, sur le libellé (brut + amical) et la valeur ──
	const needle = fold(query.trim());
	const visible: readonly ParamSection[] = sections
		.map((s) => ({
			...s,
			rows:
				needle === ""
					? s.rows
					: s.rows.filter((r) =>
							fold(
								`${r.label} ${displayLabel(s.id, r.label)} ${r.value}`,
							).includes(needle),
						),
		}))
		.filter((s) => s.rows.length > 0);

	/** « Proposer un changement » : la capture d'idée part au chat (la porte légale, le mur). */
	const propose = (id: string, title: string) => {
		void send(`capture l'idée : changer ${title}`);
		setProposed(id);
	};

	// ── L'ANNEXE « Tous les écrans » : la liste state.screens ENTIÈRE, groupée V3/V2/V1 —
	// la preuve VISIBLE que chaque écran « se trouve quelque part » (la loi de couverture
	// totale le prouve au miroir ; cette annexe le montre à l'utilisateur).
	const screenGroups = useMemo(() => {
		const v3 = state.screens.filter((s) => s.route.startsWith("/v3"));
		const v2 = state.screens.filter((s) => s.route.startsWith("/v2"));
		const v1 = state.screens.filter(
			(s) => !s.route.startsWith("/v2") && !s.route.startsWith("/v3"),
		);
		return [
			{ name: "V3", screens: v3 },
			{ name: "V2", screens: v2 },
			{ name: "V1", screens: v1 },
		];
	}, [state.screens]);

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

			{/* ── LA RECHERCHE — filtre les lignes, ne touche jamais le catalogue ── */}
			<input
				data-testid="v3-param-search"
				type="search"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				placeholder={t.paramsSearchPlaceholder}
				className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
			/>

			{visible.length === 0 && (
				<p
					data-testid="v3-param-search-empty"
					className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground"
				>
					{t.paramsSearchEmpty}
				</p>
			)}

			{visible.map((s) => {
				const title = t[s.titleKey] ?? s.titleKey;
				const hint = t[`${s.titleKey}Hint`];
				return (
					// · une section = un bloc REPLIABLE, ouvert par défaut (entête + badge de compte)
					<details
						key={s.id}
						open
						data-testid="v3-param-section"
						data-section={s.id}
						className="group rounded-xl border border-border bg-card"
					>
						<summary className="flex cursor-pointer flex-wrap items-baseline gap-2 p-4">
							<h2 className="text-sm font-semibold text-foreground">{title}</h2>
							<span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
								{s.rows.length}
							</span>
						</summary>

						<div className="space-y-3 px-4 pb-4">
							{hint !== undefined && (
								<p className="text-xs leading-relaxed text-muted-foreground">
									{hint}
								</p>
							)}

							<ul className="space-y-2">
								{s.rows.map((row) => (
									<li
										key={`${row.label}·${row.value}`}
										data-testid="v3-param"
										className="space-y-1.5 rounded-md border border-border bg-muted/30 px-3 py-2"
									>
										<div className="flex flex-wrap items-baseline gap-2">
											<span className="text-xs font-medium text-foreground">
												{displayLabel(s.id, row.label)}
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
								onClick={() => propose(s.id, title)}
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
						</div>
					</details>
				);
			})}

			{/* ── L'ANNEXE « Tous les écrans » — REPLIÉE par défaut (180+ liens) : chaque
			     écran de l'inventaire est un lien réel, groupé V3 / V2 / V1. La loi de
			     couverture (lib/v3/coverage.test.ts) PROUVE que le chat les résout tous ;
			     cette annexe le MONTRE, noir sur blanc. ── */}
			<details
				data-testid="v3-param-screens"
				className="rounded-xl border border-border bg-card"
			>
				<summary className="flex cursor-pointer flex-wrap items-baseline gap-2 p-4">
					<h2 className="text-sm font-semibold text-foreground">
						{t.paramsScreensTitle}
					</h2>
					<span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
						{state.screens.length}
					</span>
				</summary>
				<div className="space-y-4 px-4 pb-4">
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.paramsScreensIntro}
					</p>
					{screenGroups.map((g) => (
						<div key={g.name} className="space-y-1.5">
							<p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
								{g.name}
								<span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">
									{g.screens.length}
								</span>
							</p>
							<ul className="flex flex-wrap gap-1.5">
								{g.screens.map((s) => (
									<li key={s.route}>
										<Link
											href={s.route}
											title={s.label}
											data-testid="v3-param-screen-link"
											className="inline-block rounded-full border border-border bg-muted/30 px-2.5 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
										>
											{s.route}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			</details>
		</div>
	);
}
