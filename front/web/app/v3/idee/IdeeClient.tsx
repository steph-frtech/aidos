"use client";

import type { IdeeView } from "./actions";

/**
 * IdeeClient — le rendu CLIENT de la lentille /v3/idée (idea capture). Il reçoit la vue déjà
 * calculée côté serveur (loadIdeeAction : l'état LIVE du BesoinGraph + les schémas de la grammaire
 * fermée + la source honnête) et N'IMPORTE AUCUNE LOGIQUE de twin — seulement le type `IdeeView`
 * (le cliquet T5 reste vert : la frontière readVia vit dans actions.ts).
 *
 * L'ÉCRAN montre l'ÉTAGE D'ENTRÉE de la verticale (§23) : où se situe le besoin du projet actif
 * (le niveau ENTRABLE, EL07), combien de rungs sont déjà capturés, si le besoin est résolu, les
 * verdicts par rung, puis la GRAMMAIRE des niveaux (champs requis + « capturer ici émet-il une
 * idée ? », la décision EL05). Un contrôle « capturer un besoin » mène à la porte gouvernée
 * /besoin-intake (idea_capture, EL05) — visible et atteignable depuis l'écran (ui-completeness §7).
 *
 * Thémé (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue (les libellés passés en props, ADR 0011).
 * LE MUR (§2) : l'écran LIT ; capturer une idée passe par la porte EL05, geler une vérité par
 * idée → miroir → /goal.
 */

interface Labels {
	listHeading: string;
	listIntro: string;
	enterableLabel: string;
	graphComplete: string;
	rowCountLabel: string;
	doneLabel: string;
	doneYes: string;
	doneNo: string;
	verdictsHeading: string;
	verdictsEmpty: string;
	verdictEnough: string;
	verdictMissing: string;
	grammarHeading: string;
	grammarIntro: string;
	levelLabel: string;
	requiredLabel: string;
	emitsLabel: string;
	emitsYes: string;
	emitsNo: string;
	proposesLabel: string;
	live: string;
	demo: string;
	liveTitle: string;
	demoTitle: string;
	wallNote: string;
	captureBtn: string;
	captureHint: string;
}

/** SourceBadge — la pastille de provenance honnête (live/démo, ADR 0074 ; jamais un faux live). */
function SourceBadge({
	source,
	labels,
}: {
	source: "live" | "demo";
	labels: Labels;
}) {
	return (
		<span
			data-testid="v3-idee-source"
			data-source={source}
			title={source === "live" ? labels.liveTitle : labels.demoTitle}
			className={
				source === "live"
					? "inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
					: "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
			}
		>
			{source === "live" ? labels.live : labels.demo}
		</span>
	);
}

export function IdeeClient({
	state,
	schemas,
	source,
	labels,
}: IdeeView & { labels: Labels }) {
	const enterable = state.enterableLevel || labels.graphComplete;

	return (
		<div className="space-y-6">
			{/* L'ÉTAT LIVE DU BESOINGRAPH (la vue du moteur sur le besoin capturé). */}
			<section
				aria-label={labels.listHeading}
				data-testid="v3-idee-state"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{labels.listHeading}
					</h2>
					<SourceBadge source={source} labels={labels} />
				</div>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.listIntro}
				</p>
				<dl className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-3">
					<div className="rounded-lg border border-border bg-background px-3 py-2">
						<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{labels.enterableLabel}
						</dt>
						<dd
							data-testid="v3-idee-enterable"
							className="pt-0.5 text-sm font-semibold text-foreground"
						>
							{enterable}
						</dd>
					</div>
					<div className="rounded-lg border border-border bg-background px-3 py-2">
						<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{labels.rowCountLabel}
						</dt>
						<dd
							data-testid="v3-idee-rowcount"
							className="pt-0.5 text-sm font-semibold text-foreground"
						>
							{state.nodeRowCount}
						</dd>
					</div>
					<div className="rounded-lg border border-border bg-background px-3 py-2">
						<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{labels.doneLabel}
						</dt>
						<dd
							data-testid="v3-idee-done"
							className="pt-0.5 text-sm font-semibold text-foreground"
						>
							{state.done ? labels.doneYes : labels.doneNo}
						</dd>
					</div>
				</dl>

				{/* Les verdicts par rung (EL07 : assez ? quels champs manquent ?). */}
				<div className="pt-1">
					<h3 className="pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
						{labels.verdictsHeading}
					</h3>
					{state.verdicts.length === 0 ? (
						<p
							data-testid="v3-idee-verdicts-empty"
							className="text-sm text-muted-foreground"
						>
							{labels.verdictsEmpty}
						</p>
					) : (
						<ul className="space-y-1">
							{state.verdicts.map((v) => (
								<li
									key={v.level}
									data-testid="v3-idee-verdict"
									data-level={v.level}
									className="flex flex-wrap items-center gap-2 text-sm text-foreground"
								>
									<span className="font-medium">{v.level}</span>
									<span
										className={
											v.enough
												? "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
												: "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
										}
									>
										{v.enough ? labels.verdictEnough : labels.verdictMissing}
									</span>
									{v.missing.length > 0 ? (
										<span className="text-xs text-muted-foreground">
											{v.missing.join(", ")}
										</span>
									) : null}
								</li>
							))}
						</ul>
					)}
				</div>
			</section>

			{/* LA GRAMMAIRE FERMÉE DES NIVEAUX — où chaque rung devient (ou non) une idée (EL05). */}
			<section
				aria-label={labels.grammarHeading}
				data-testid="v3-idee-grammar"
				className="space-y-3 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{labels.grammarHeading}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{labels.grammarIntro}
				</p>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-sm">
						<thead>
							<tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
								<th className="py-2 pr-4 font-medium">{labels.levelLabel}</th>
								<th className="py-2 pr-4 font-medium">
									{labels.requiredLabel}
								</th>
								<th className="py-2 pr-4 font-medium">{labels.emitsLabel}</th>
								<th className="py-2 font-medium">{labels.proposesLabel}</th>
							</tr>
						</thead>
						<tbody>
							{schemas.map((row) => (
								<tr
									key={row.level}
									data-testid="v3-idee-grammar-row"
									data-level={row.level}
									className="border-b border-border/60 align-top"
								>
									<td className="py-2 pr-4 font-medium text-foreground">
										{row.level}
									</td>
									<td className="py-2 pr-4 text-muted-foreground">
										{row.requiredFields.length > 0
											? row.requiredFields.join(", ")
											: "—"}
									</td>
									<td className="py-2 pr-4">
										<span
											className={
												row.emits
													? "inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
													: "inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
											}
										>
											{row.emits ? labels.emitsYes : labels.emitsNo}
										</span>
									</td>
									<td className="py-2 text-muted-foreground">
										{row.proposes ?? "—"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* LE MUR + la porte gouvernée de capture (ui-completeness §7 : atteignable depuis l'écran). */}
			<section
				data-testid="v3-idee-wall"
				className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
			>
				<p className="text-sm text-primary">{labels.wallNote}</p>
				<div className="flex flex-wrap items-center gap-3">
					<a
						href="/besoin-intake"
						data-testid="v3-idee-capture"
						className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
					>
						{labels.captureBtn}
					</a>
					<span className="text-xs text-muted-foreground">
						{labels.captureHint}
					</span>
				</div>
			</section>
		</div>
	);
}
