"use client";

import { useMemo, useState } from "react";
import {
	ALL_FACETS,
	countsByLevel,
	descendPair,
	fallbackPlacements,
	isLastPair,
	levelsTouched,
	MIRROR_PAIRS,
	type NeedSample,
	type Placement,
	pairLabel,
	placementKey,
	placementsByLevel,
	placeNeed,
	type WallRefusal,
} from "@/lib/v2/ai-lab";

/**
 * WB2-15 — l'AI LAB « modèle corrigé », côté écran (client-only, le twin pur). À GAUCHE le chat du
 * CERVEAU GAUCHE : un besoin en langage naturel ; à DROITE la VERTICALE — chaque morceau du besoin
 * PLACÉ à un (niveau × facette × paire), gaté + vérifié (clampé à l'espace déclaré).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on TAPE un besoin (ou on choisit un BESOIN D'EXEMPLE) puis on clique « Placer » → le besoin est
 *     PLACÉ sur la verticale (les specs apparaissent par niveau) ;
 *   - on clique « Fallback déterministe » → le placement par défaut (Claude indisponible, pur) ;
 *   - un message d'ÉCRITURE-VÉRITÉ → un REFUS au mur (banner), aucun placement.
 * Tout délégué au twin pur lib/v2/ai-lab.ts (placeNeed / fallbackPlacements / clamp).
 *
 * LE MUR (§2) : placer un besoin n'écrit AUCUNE vérité — les placements sont AMBRE (proposés) ; la
 * promotion passe par idée → miroir → /goal. L'écran AFFICHE et PROPOSE ; aucune écriture de kernel.
 */

type Strings = Record<string, string>;

const FACET_RANK = new Map<string, number>(ALL_FACETS.map((f, i) => [f, i]));
const PAIR_RANK = new Map<string, number>(
	MIRROR_PAIRS.map((p, i) => [p.id, i]),
);

export function AiLabClient({
	samples,
	t,
}: {
	samples: readonly NeedSample[];
	t: Strings;
}) {
	const [message, setMessage] = useState("");
	const [placements, setPlacements] = useState<Placement[]>([]);
	const [refusal, setRefusal] = useState<WallRefusal | null>(null);
	const [usedFallback, setUsedFallback] = useState(false);

	// le besoin d'exemple sélectionné (la sortie brute du cerveau gauche, déjà déclarée + 1 inventée).
	const [rawForSample, setRawForSample] = useState<unknown>(null);

	const byLevel = useMemo(() => placementsByLevel(placements), [placements]);
	const levels = useMemo(() => levelsTouched(placements), [placements]);
	const counts = useMemo(() => countsByLevel(placements), [placements]);

	function runPlace(msg: string, raw: unknown) {
		const r = placeNeed(msg, raw);
		if (r.refused) {
			setRefusal(r);
			setPlacements([]);
			setUsedFallback(false);
			return;
		}
		setRefusal(null);
		setPlacements(r.placements);
		setUsedFallback(false);
	}

	function onPlace() {
		// sans sortie brute du cerveau gauche (pas d'exemple choisi), on tombe sur le FALLBACK.
		if (rawForSample === null) {
			onFallback();
			return;
		}
		runPlace(message, rawForSample);
	}

	function onFallback() {
		// le mur tient même en fallback : un message d'écriture-vérité est refusé d'abord.
		const r = placeNeed(message, []);
		if (r.refused) {
			setRefusal(r);
			setPlacements([]);
			setUsedFallback(false);
			return;
		}
		setRefusal(null);
		setPlacements(fallbackPlacements(message));
		setUsedFallback(true);
	}

	function onPickSample(s: NeedSample) {
		setMessage(s.message);
		setRawForSample(s.raw);
		runPlace(s.message, s.raw);
	}

	// WB2-16 — l'enrichissement Claude est GATÉ : ON → Claude écrit le texte de la fille (ici simulé
	// par un override déterministe, honnête : le runtime branchera Claude) ; OFF → le fallback template.
	const [enrich, setEnrich] = useState(false);

	/**
	 * WB2-16 — DESCENDRE l'anatomie : valider une paire (niveau × facette × pairId) → générer la paire
	 * SUIVANTE (Spec→Comportement→…→Evidence). Délégué au twin pur `descendPair`. Enrichissement gaté
	 * (override) ou fallback template déterministe. Le mur §2 : aucune écriture, on STAGE une proposition.
	 */
	function onDescend(p: Placement) {
		const override = enrich
			? { spec: `Comportement enrichi (Claude) — « ${p.spec} »` }
			: undefined;
		const r = descendPair(placements, p.level, p.facet, p.pairId, override);
		setPlacements(r.placements);
		setUsedFallback(false);
	}

	const placedCount = placements.length;

	return (
		<div data-testid="v2-ai-lab-view" className="grid gap-6 lg:grid-cols-2">
			{/* ── GAUCHE — le chat du cerveau gauche ───────────────────────────── */}
			<section className="space-y-4">
				<div className="rounded-xl border border-border bg-card p-5 space-y-3">
					<h2 className="text-sm font-semibold text-foreground">
						{t.leftHeading}
					</h2>
					<p className="text-xs text-muted-foreground">{t.leftHint}</p>

					<label htmlFor="need-input" className="sr-only">
						{t.inputLabel}
					</label>
					<textarea
						id="need-input"
						data-testid="v2-ai-lab-input"
						value={message}
						onChange={(e) => {
							setMessage(e.target.value);
							setRawForSample(null);
						}}
						rows={3}
						placeholder={t.inputPlaceholder}
						className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
					/>

					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							data-testid="v2-ai-lab-place"
							onClick={onPlace}
							disabled={message.trim().length === 0}
							className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
						>
							{t.placeBtn}
						</button>
						<button
							type="button"
							data-testid="v2-ai-lab-fallback"
							onClick={onFallback}
							disabled={message.trim().length === 0}
							className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
						>
							{t.fallbackBtn}
						</button>
					</div>

					{/* WB2-16 — le gate de l'enrichissement Claude (ON) vs le fallback template (OFF). */}
					<label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
						<input
							type="checkbox"
							data-testid="v2-ai-lab-enrich-toggle"
							checked={enrich}
							onChange={(e) => setEnrich(e.target.checked)}
							className="h-3.5 w-3.5 accent-primary"
						/>
						{t.enrichToggle}
					</label>

					<div className="space-y-2 pt-2">
						<p className="text-xs font-medium text-muted-foreground">
							{t.samplesHeading}
						</p>
						<div
							data-testid="v2-ai-lab-samples"
							className="flex flex-col gap-2"
						>
							{samples.map((s) => (
								<button
									key={s.id}
									type="button"
									data-testid={`v2-ai-lab-sample-${s.id}`}
									onClick={() => onPickSample(s)}
									className="rounded-lg border border-border bg-card px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
								>
									{s.role}
								</button>
							))}
						</div>
					</div>
				</div>

				{/* le REFUS au mur (un message d'écriture-vérité) */}
				{refusal && (
					<div
						data-testid="v2-ai-lab-refusal"
						className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 space-y-2"
					>
						<p className="font-mono text-xs font-semibold text-destructive">
							{refusal.code}
						</p>
						<p className="text-sm text-destructive">{refusal.explanation}</p>
						<ul className="list-inside list-disc text-xs text-destructive/80">
							{refusal.howToFix.map((h) => (
								<li key={h}>{h}</li>
							))}
						</ul>
					</div>
				)}
			</section>

			{/* ── DROITE — la verticale, les specs placées ─────────────────────── */}
			<section className="space-y-4">
				<div className="rounded-xl border border-border bg-card p-5 space-y-2">
					<div className="flex items-baseline justify-between">
						<h2 className="text-sm font-semibold text-foreground">
							{t.rightHeading}
						</h2>
						<span
							data-testid="v2-ai-lab-placed-count"
							data-count={placedCount}
							data-levels={levels.length}
							className="font-mono text-xs font-semibold text-primary"
						>
							{placedCount} · {levels.length} {t.levelsShort}
						</span>
					</div>
					<p className="text-xs text-muted-foreground">{t.rightHint}</p>
					{usedFallback && (
						<p
							data-testid="v2-ai-lab-fallback-note"
							className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-muted-foreground"
						>
							{t.fallbackNote}
						</p>
					)}
				</div>

				<div data-testid="v2-ai-lab-verticale" className="space-y-2">
					{byLevel
						.filter((row) => row.items.length > 0)
						.map((row) => (
							<div
								key={row.level}
								data-testid={`v2-ai-lab-level-${row.level}`}
								className="rounded-xl border border-border bg-card p-4 space-y-2"
							>
								<div className="flex items-baseline justify-between">
									<span className="font-mono text-xs font-semibold uppercase text-foreground">
										{row.level}
									</span>
									<span className="font-mono text-[10px] text-muted-foreground">
										{counts[row.level] ?? 0}
									</span>
								</div>
								<ul className="space-y-1.5">
									{[...row.items]
										.sort(
											(a, b) =>
												(FACET_RANK.get(a.facet) ?? 0) -
													(FACET_RANK.get(b.facet) ?? 0) ||
												(PAIR_RANK.get(a.pairId) ?? 0) -
													(PAIR_RANK.get(b.pairId) ?? 0),
										)
										.map((p) => {
											const realized = p.status === "realized";
											const validated = p.status === "validated";
											const last = isLastPair(p.pairId);
											const statusLabel = realized
												? t.realized
												: validated
													? t.validated
													: t.proposed;
											return (
												<li
													key={placementKey(p)}
													data-testid={`v2-ai-lab-placement-${placementKey(p)}`}
													data-level={p.level}
													data-facet={p.facet}
													data-pair={p.pairId}
													data-status={p.status ?? "proposed"}
													className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5"
												>
													<span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
														{p.facet}
													</span>
													<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
														{pairLabel(p.pairId)}
													</span>
													<span className="truncate text-xs text-foreground">
														{p.spec}
													</span>
													<span
														data-testid={`v2-ai-lab-status-${placementKey(p)}`}
														className={`ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
															realized
																? "bg-primary text-primary-foreground"
																: "text-primary"
														}`}
													>
														{statusLabel}
													</span>
													{!realized && (
														<button
															type="button"
															data-testid={`v2-ai-lab-descend-${placementKey(p)}`}
															onClick={() => onDescend(p)}
															className="shrink-0 rounded border border-border bg-card px-2 py-0.5 font-mono text-[10px] font-medium text-foreground transition-colors hover:bg-muted"
														>
															{last ? t.realizeBtn : t.descendBtn}
														</button>
													)}
												</li>
											);
										})}
								</ul>
							</div>
						))}
					{placedCount === 0 && (
						<p
							data-testid="v2-ai-lab-empty"
							className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 text-center text-xs text-muted-foreground"
						>
							{t.emptyHint}
						</p>
					)}
				</div>

				<div
					data-testid="v2-ai-lab-wall-note"
					className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-xs text-primary"
				>
					{t.wallNote}
				</div>
				<p className="text-[10px] text-muted-foreground">{t.spaceNote}</p>
			</section>
		</div>
	);
}
