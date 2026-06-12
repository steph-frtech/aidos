"use client";

import Link from "next/link";
import { useState } from "react";
import { friendlyLine } from "../friendly";
import { useV3Session } from "../V3Session";

/**
 * /v3/history — L'HISTORIQUE : la timeline annotée de la session (turnsOf — ADR 0060).
 * Chaque message est une ÉTAPE ; « Revenir ici » TRONQUE le transcript (rewindTo) et
 * l'état est REJOUÉ depuis le début — rien n'est perdu dans le concept : le voyage dans
 * le temps est un rejeu de préfixe (replayTo, le twin pur lib/v3/session).
 *
 * END-USER FRIENDLY TOTAL : copie amicale (les gabarits partagés ../friendly), une
 * confirmation DOUCE à deux clics (jamais de window.confirm), le détail technique
 * TOUJOURS replié (<details data-testid="v3-details">). LE MUR (§2) : la lentille
 * rejoue, n'écrit rien.
 */

export function HistoryClient() {
	const { turns, rewindTo, strings: t } = useV3Session();
	// La confirmation à DEUX CLICS : l'index du tour armé (un seul à la fois, jamais de window.confirm).
	const [armed, setArmed] = useState<number | null>(null);

	return (
		<div
			data-testid="v3-history"
			className="mx-auto w-full max-w-3xl space-y-6"
		>
			<header className="space-y-2">
				<h1 className="text-2xl font-semibold text-foreground">
					{t.historyTitle}
				</h1>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t.historyIntro}
				</p>
			</header>

			{turns.length === 0 ? (
				/* · l'état vide ACCUEILLANT — tout commence par une conversation */
				<div className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
					<p className="text-sm text-muted-foreground">{t.historyEmpty}</p>
					<Link
						href="/v3/lab"
						className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{t.historyEmptyCta} →
					</Link>
				</div>
			) : (
				<ol className="space-y-3">
					{turns.map((turn) => {
						// Le nombre d'étapes RETIRÉES par un retour ici (le suffixe rejoué disparaît).
						const removed = turns.length - turn.index;
						return (
							<li
								key={turn.index}
								data-testid="v3-history-turn"
								className="space-y-3 rounded-xl border border-border bg-card p-4"
							>
								{/* · l'étape : le badge de position + le message tel qu'envoyé */}
								<div className="flex flex-wrap items-center gap-2">
									<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
										{t.historyStepLabel.replace("%n%", String(turn.index + 1))}
									</span>
									<p className="min-w-0 text-sm font-medium text-foreground">
										{turn.msg}
									</p>
								</div>

								{/* · le résumé AMICAL des événements (les gabarits partagés — le refus en ambre) */}
								<div className="space-y-1.5">
									{turn.events.map((e, ei) => (
										<p
											// biome-ignore lint/suspicious/noArrayIndexKey: les événements d'un tour sont positionnels (append-only)
											key={ei}
											className={
												e.kind === "refus"
													? "rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
													: "text-xs leading-relaxed text-muted-foreground"
											}
										>
											{friendlyLine(t, e)}
										</p>
									))}
								</div>

								{/* · le DÉTAIL TECHNIQUE — toujours replié, jamais imposé */}
								<details
									data-testid="v3-details"
									className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
								>
									<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
										{t.detailsLabel}
									</summary>
									<ul className="mt-2 space-y-1">
										{turn.events.map((e, ei) => (
											<li
												// biome-ignore lint/suspicious/noArrayIndexKey: les événements d'un tour sont positionnels (append-only)
												key={ei}
												className="font-mono text-[11px] leading-relaxed text-muted-foreground"
											>
												{e.env !== undefined ? `${e.kind} · ${e.env}` : e.kind}{" "}
												— {e.detail}
												{e.ref !== "" ? ` [${e.ref}]` : ""}
											</li>
										))}
									</ul>
								</details>

								{/* · « Revenir ici » — la confirmation douce à DEUX clics (même testid : deux clics = retour) */}
								{armed === turn.index ? (
									<div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
										<p className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
											{t.historyConfirm.replace("%n%", String(removed))}
										</p>
										<div className="flex flex-wrap gap-2">
											<button
												type="button"
												data-testid="v3-history-rewind"
												onClick={() => {
													rewindTo(turn.index);
													setArmed(null);
												}}
												className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
											>
												{t.historyConfirmBtn}
											</button>
											<button
												type="button"
												onClick={() => setArmed(null)}
												className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
											>
												{t.historyCancel}
											</button>
										</div>
									</div>
								) : (
									<button
										type="button"
										data-testid="v3-history-rewind"
										onClick={() => setArmed(turn.index)}
										className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
									>
										{t.historyRewind}
									</button>
								)}
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}
