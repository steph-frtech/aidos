"use client";

import { useMemo, useState } from "react";
import {
	CANONICAL_CELL,
	CANONICAL_SEED,
	type CellRun,
	refusalLabelKey,
	runCanonical,
	SAMPLER_KINDS,
	type SamplerKind,
	samplerLabelKey,
	type VariantRow,
} from "@/lib/v3/evolve-view";
import type { Strings } from "../friendly";
import { useV3Session } from "../V3Session";

/**
 * /v3/evolve — LA LENTILLE « GÉNÉRATEUR D'ÉVOLUTION » (EG05, ADR 0089) : sur la cellule
 * CANONIQUE (hermétique), le sélecteur de générateur (auto-jeu vs déterministe), les
 * NICHES GAGNÉES + la couverture, et la TABLE des variantes proposées avec leur verdict
 * de gate. Tout est PROJETÉ du twin pur runCanonical(sampler) — byte-cohérent avec le Go
 * back/runtime/evolve, miroir fast-check. Aucune logique re-implémentée ici.
 *
 * UI-COMPLETENESS (§6/§7) : le bouton « Lancer une exploration » ENVOIE le geste canonique
 * au chat via send() (le tour repasse par le réducteur, la loi — exactement comme les
 * autres lentilles : parcours, environnements). Le bouton n'est jamais headless. Un
 * indicateur local confirme l'envoi (la lentille reste dans le projet courant).
 *
 * DÉTERMINISME-FIRST (§6/§8) : le run est PUR/SEEDÉ (aucun réseau, l'IA reste côté Go
 * derrière le seam). Le JUGE est le miroir déterministe — une variante au miroir rouge
 * n'est JAMAIS promue. LE MUR (§2) : lecture + projection + un geste de chat — aucune
 * écriture de vérité.
 */

/** Le badge de verdict : promue (vert) ou refusée (destructif) — tokens ADR 0010. */
function VerdictBadge({ row, t }: { row: VariantRow; t: Strings }) {
	const promoted = row.verdict === "proposed";
	return (
		<span
			data-testid="v3-evolve-verdict"
			data-verdict={row.verdict}
			title={promoted ? undefined : (t[refusalLabelKey(row.refusal)] ?? "")}
			className={[
				"inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
				promoted
					? "border-primary/40 bg-primary/10 text-primary"
					: "border-destructive/40 bg-destructive/10 text-destructive",
			].join(" ")}
		>
			{promoted ? t.evolveVerdictProposed : t.evolveVerdictRefused}
		</span>
	);
}

/** Une pastille vert/rouge pour un statut binaire (miroir / oos). */
function StatusDot({ green, t }: { green: boolean; t: Strings }) {
	return (
		<span
			className={[
				"inline-flex items-center gap-1 text-[11px] font-medium",
				green ? "text-primary" : "text-destructive",
			].join(" ")}
		>
			<span
				aria-hidden
				className={[
					"h-1.5 w-1.5 rounded-full",
					green ? "bg-primary" : "bg-destructive",
				].join(" ")}
			/>
			{green ? t.evolveGreen : t.evolveRed}
		</span>
	);
}

/** Une ligne de la table de variantes. */
function VariantRowView({ row, t }: { row: VariantRow; t: Strings }) {
	return (
		<tr
			data-testid="v3-evolve-variant"
			data-niche={row.niche}
			data-verdict={row.verdict}
			className="border-t border-border"
		>
			<td className="px-3 py-2 font-mono text-[11px] text-foreground">
				{row.niche}
			</td>
			<td className="px-3 py-2 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
				{row.mutation.toFixed(3)}
			</td>
			<td className="px-3 py-2">
				<StatusDot green={row.mirror === "green"} t={t} />
			</td>
			<td className="px-3 py-2">
				<StatusDot green={row.outOfSample === "green"} t={t} />
			</td>
			<td className="px-3 py-2 text-[11px] font-medium text-muted-foreground">
				{row.authorityApproved ? t.evolveApproved : t.evolveNotApproved}
			</td>
			<td className="px-3 py-2">
				<VerdictBadge row={row} t={t} />
			</td>
		</tr>
	);
}

export function EvolveClient() {
	const { strings: t, send } = useV3Session();
	const [sampler, setSampler] = useState<SamplerKind>("self-play");
	// L'indicateur local d'exploration lancée (le geste a été ENVOYÉ au chat).
	const [launched, setLaunched] = useState(false);

	// LA PROJECTION PURE : le run canonique pour le générateur choisi — jamais stocké.
	const run: CellRun = useMemo(() => runCanonical(sampler), [sampler]);

	// Le geste canonique envoyé au chat (ui-completeness) — le tour repasse par le réducteur.
	const onRun = (): void => {
		void send(
			`explore l'évolution de la cellule ${CANONICAL_CELL.id} par ${sampler}`,
		);
		setLaunched(true);
	};

	return (
		<div className="space-y-8">
			{/* ── LE GÉNÉRATEUR : le sélecteur + le bouton d'exploration ── */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold text-foreground">
						{t.evolveSamplerHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.evolveSamplerHint}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{SAMPLER_KINDS.map((kind) => (
						<button
							key={kind}
							type="button"
							data-testid="v3-evolve-sampler"
							data-sampler={kind}
							aria-pressed={sampler === kind}
							onClick={() => {
								setSampler(kind);
								setLaunched(false);
							}}
							className={[
								"rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
								sampler === kind
									? "border-primary/40 bg-primary/10 text-primary"
									: "border-border bg-muted/40 text-foreground hover:border-primary/40 hover:bg-primary/5",
							].join(" ")}
						>
							{t[samplerLabelKey(kind)]}
						</button>
					))}
				</div>
				<div className="flex flex-wrap items-center gap-3">
					<button
						type="button"
						data-testid="v3-evolve-run"
						onClick={onRun}
						className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
					>
						{t.evolveRunBtn}
					</button>
					{launched && (
						<span
							data-testid="v3-evolve-launched"
							role="status"
							className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
						>
							{t.evolveRunHint}
						</span>
					)}
				</div>
				<div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
					<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
						{t.evolveCellLabel} : {run.cell}
					</span>
					<span className="rounded bg-muted px-1.5 py-0.5 font-mono">
						{t.evolveSeedLabel} : {CANONICAL_SEED}
					</span>
				</div>
			</section>

			{/* ── LES NICHES GAGNÉES + LA COUVERTURE ── */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold text-foreground">
						{t.evolveCoverageHeading}
					</h2>
				</div>
				<div
					data-testid="v3-evolve-coverage"
					data-coverage={run.coverage}
					className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
				>
					<p className="text-sm font-medium text-foreground">
						{(t.evolveCoverageLabel ?? "%n%").replace(
							"%n%",
							String(run.coverage),
						)}
					</p>
					{run.nichesWon.length === 0 ? (
						<p className="mt-2 text-xs text-muted-foreground">
							{t.evolveCoverageNone}
						</p>
					) : (
						<ul className="mt-2 flex flex-wrap gap-1.5">
							{run.nichesWon.map((niche) => (
								<li
									key={niche}
									data-testid="v3-evolve-niche-won"
									data-niche={niche}
									className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-primary"
								>
									{niche}
								</li>
							))}
						</ul>
					)}
				</div>
			</section>

			{/* ── LA TABLE DES VARIANTES PROPOSÉES ── */}
			<section className="space-y-3">
				<div className="space-y-1">
					<h2 className="text-base font-semibold text-foreground">
						{t.evolveVariantsHeading}
					</h2>
					<p className="text-xs leading-relaxed text-muted-foreground">
						{t.evolveVariantsHint}
					</p>
				</div>
				{run.variants.length === 0 ? (
					<p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
						{t.evolveEmpty}
					</p>
				) : (
					<div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
						<table
							data-testid="v3-evolve-variants"
							className="w-full min-w-[36rem] text-left text-sm"
						>
							<thead>
								<tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
									<th className="px-3 py-2 font-medium">{t.evolveColNiche}</th>
									<th className="px-3 py-2 text-right font-medium">
										{t.evolveColMutation}
									</th>
									<th className="px-3 py-2 font-medium">{t.evolveColMirror}</th>
									<th className="px-3 py-2 font-medium">{t.evolveColOos}</th>
									<th className="px-3 py-2 font-medium">
										{t.evolveColAuthority}
									</th>
									<th className="px-3 py-2 font-medium">
										{t.evolveColVerdict}
									</th>
								</tr>
							</thead>
							<tbody>
								{run.variants.map((row) => (
									<VariantRowView key={row.id} row={row} t={t} />
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* ── LE MUR : la note d'honnêteté ── */}
			<p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
				{t.evolveWallNote}
			</p>
		</div>
	);
}
