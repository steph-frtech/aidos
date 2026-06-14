"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
	type BuilderEvent,
	classifyIntent,
	type IntentKind,
} from "@/lib/v2/builder";
import type { SessionTurn } from "@/lib/v3/session";
import { friendlyLine, type Strings } from "../friendly";
import { useV3Session } from "../V3Session";
import { PreviewPane } from "./PreviewPane";

/**
 * /v3/lab — LE CHAT façon GPT (ADR 0060) : une conversation pleine hauteur, centrée,
 * bulles, saisie épinglée en bas (Entrée envoie), défilement automatique, indicateur
 * de frappe — et le VRAI Claude mène la conversation (il répond chaleureusement ET
 * décompose le message en PLUSIEURS gestes canoniques par tour).
 *
 * END-USER FRIENDLY TOTAL : français simple, AUCUN jargon imposé — les libellés
 * amicaux (FRIENDLY_TEMPLATES) portent la copie primaire ; le détail technique
 * (hashes, genres d'événements, impacts) vit TOUJOURS replié dans « Détails
 * techniques » (<details data-testid="v3-details">).
 *
 * DÉTERMINISME-FIRST (§6/§8) : le réducteur reste LA LOI — chaque geste proposé par
 * Claude est re-jugé par understand/applyIntent (session) ; la bascule « IA
 * conversationnelle » (défaut ON) offre le mode déterministe pur. LE MUR (§2) : le
 * chat PROPOSE, aucune écriture-vérité.
 */

/** Le libellé AMICAL par intention (clé i18n) — pour les chips d'ambiguïté. */
const INTENT_LABELS: Record<IntentKind, string> = {
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
};

/** Le verbe FORT canonique par intention — le préfixe de désambiguïsation (motif /v2/builder). */
const FORCE_PREFIX: Record<IntentKind, string> = {
	capturer_idee: "capture l'idée : ",
	greffer: "greffe ",
	promouvoir: "promeus ",
	generer: "génère ",
	deployer: "déploie ",
	delta: "delta ",
	impacter: "impact ",
	interroger: "montre ",
	ouvrir: "ouvre ",
	adapter: "adapte ",
};

/**
 * Les CHIPS de prochaine étape contextuelles — après un événement, le geste canonique
 * suivant du cycle de vie (capture → promotion → génération → l'échelle dev→staging→prod
 * → delta). Les phrases envoyées sont les canoniques PROUVÉES (françaises, le jeu clos).
 */
const NEXT_CHIPS: readonly {
	when: (e: BuilderEvent) => boolean;
	labelKey: string;
	phrase: string;
}[] = [
	{
		when: (e) => e.kind === "idee_capturee",
		labelKey: "chipPromote",
		phrase: "promeus la dernière idée",
	},
	{
		when: (e) => e.kind === "kernel_propose",
		labelKey: "chipGenerate",
		phrase: "génère l'application",
	},
	{
		when: (e) => e.kind === "app_generee",
		labelKey: "chipDeployDev",
		phrase: "déploie l'application en dev",
	},
	{
		when: (e) => e.kind === "deploiement" && e.env === "dev",
		labelKey: "chipDeployStaging",
		phrase: "déploie l'application en staging",
	},
	{
		when: (e) => e.kind === "deploiement" && e.env === "staging",
		labelKey: "chipDeployProd",
		phrase: "déploie l'application en prod",
	},
	{
		when: (e) => e.kind === "deploiement" && e.env === "prod",
		labelKey: "chipDelta",
		phrase: "montre le delta depuis la prod",
	},
	{
		when: (e) => e.kind === "delta_calcule",
		labelKey: "chipState",
		phrase: "montre-moi l'état du projet",
	},
];

/**
 * LA DÉSAMBIGUÏSATION DÉTERMINISTE (le motif /v2/builder) : retirer les mots qui
 * n'accrochent QUE d'autres intentions (mesuré par classifyIntent — le twin lui-même),
 * puis préposer le verbe fort canonique. Le texte repasse par le MÊME pipeline.
 */
function forceText(kind: IntentKind, original: string): string {
	const kept = original
		.split(/\s+/)
		.filter((w) => {
			const cands = classifyIntent(w);
			const top = cands[0];
			if (top.score === 0) return true;
			const mine = cands.find((c) => c.kind === kind);
			return (mine?.score ?? 0) >= top.score;
		})
		.join(" ");
	return `${FORCE_PREFIX[kind]}${kept}`;
}

/**
 * Les 4 grandes cartes d'amorce du hero : le libellé est i18n, mais le GESTE est
 * CANONIQUE (le jeu clos prouvé — jamais le libellé envoyé tel quel : « Crée une
 * idée pour mon app » classait GREFFER et greffait une branche absurde, bug
 * utilisateur 2026-06-12). La capture PRÉ-REMPLIT la saisie (l'utilisateur écrit
 * SON idée) ; les autres envoient leur phrase canonique prouvée.
 */
const SUGGESTIONS: readonly {
	labelKey: string;
	mode: "prefill" | "send";
	text: string;
}[] = [
	{ labelKey: "suggestion1", mode: "prefill", text: "capture l'idée : " },
	{
		labelKey: "suggestion2",
		mode: "send",
		text: "déploie l'application en dev",
	},
	{ labelKey: "suggestion3", mode: "send", text: "ouvre l'écran v3 parcours" },
	{ labelKey: "suggestion4", mode: "send", text: "ouvre l'écran v2 code" },
];

/** La carte ASSISTANT d'un tour : réponse Claude OU gabarits amicaux + chips + détails. */
function AssistantCard({
	turn,
	reply,
	isLast,
	t,
	onChip,
}: {
	turn: SessionTurn;
	reply: string | undefined;
	isLast: boolean;
	t: Strings;
	onChip: (phrase: string) => void;
}) {
	const refusals = turn.events.filter((e) => e.kind === "refus");
	const nextChips = NEXT_CHIPS.filter((c) => turn.events.some(c.when));

	return (
		<div className="flex justify-start">
			<div
				data-testid="v3-msg-assistant"
				className="max-w-[85%] space-y-3 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm"
			>
				{/* · la réponse de Claude (IA active) OU les gabarits amicaux par événement */}
				{reply !== undefined ? (
					<p className="whitespace-pre-wrap leading-relaxed">{reply}</p>
				) : (
					<div className="space-y-1.5">
						{turn.events
							.filter((e) => e.kind !== "refus")
							.map((e, ei) => (
								<p
									// biome-ignore lint/suspicious/noArrayIndexKey: les événements d'un tour sont positionnels (append-only)
									key={ei}
									className="leading-relaxed"
								>
									{friendlyLine(t, e)}
								</p>
							))}
					</div>
				)}

				{/* · le refus DOUX — toujours visible (même avec une réponse IA), en ambre */}
				{refusals.map((e, ei) => (
					<p
						// biome-ignore lint/suspicious/noArrayIndexKey: les refus d'un tour sont positionnels (append-only)
						key={ei}
						className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400"
					>
						{friendlyLine(t, e)}
					</p>
				))}

				{/* · un écran ouvert devient un BOUTON de navigation (toujours offert) */}
				{turn.events
					.filter((e) => e.kind === "ecran_ouvert")
					.map((e) => (
						<Link
							key={e.ref}
							href={e.ref}
							data-testid="v3-open-screen"
							data-route={e.ref}
							className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
						>
							<span>{t.openScreenBtn}</span>
							<span className="font-mono text-[10px]">{e.ref} →</span>
						</Link>
					))}

				{/* · l'ambiguïté est OFFERTE : les candidats en chips amicales (jamais tranchée en silence) */}
				{turn.understanding.status === "ambigue" && (
					<div className="space-y-1.5">
						<p className="text-xs text-muted-foreground">{t.ambiguousHint}</p>
						<div className="flex flex-wrap gap-1.5">
							{turn.understanding.candidates
								.filter((c) => c.score > 0)
								.map((c) => (
									<button
										key={c.kind}
										type="button"
										data-testid="v3-chip"
										data-kind={c.kind}
										onClick={() => onChip(forceText(c.kind, turn.msg))}
										className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
									>
										{t[INTENT_LABELS[c.kind]]}
									</button>
								))}
						</div>
					</div>
				)}

				{/* · les chips de PROCHAINE ÉTAPE (sur le dernier tour seulement) */}
				{isLast && nextChips.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{nextChips.map((c) => (
							<button
								key={c.labelKey}
								type="button"
								data-testid="v3-chip"
								data-phrase={c.phrase}
								onClick={() => onChip(c.phrase)}
								className="rounded-full border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
							>
								{t[c.labelKey]}
							</button>
						))}
					</div>
				)}

				{/* · un tour avec impacts pointe vers LA GRILLE (/v3/specs) — « je VOIS ce qui est touché » */}
				{turn.impacts.length > 0 && (
					<Link
						href="/v3/specs"
						data-testid="v3-impacts-grid"
						className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
					>
						{t.specsSeeGrid}
					</Link>
				)}

				{/* · le DÉTAIL TECHNIQUE — toujours replié, jamais imposé */}
				<details
					data-testid="v3-details"
					className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
				>
					<summary className="cursor-pointer text-xs font-medium text-muted-foreground">
						{t.detailsLabel}
					</summary>
					<div className="mt-2 space-y-2 text-xs">
						<p className="text-muted-foreground">
							<span className="font-semibold">{t.detailsUnderstanding}</span> :{" "}
							{turn.understanding.status}
							{turn.understanding.attente !== null
								? ` · ${turn.understanding.attente}`
								: ""}
						</p>
						<div className="space-y-1">
							<p className="font-semibold text-muted-foreground">
								{t.detailsEvents}
							</p>
							<ul className="space-y-1">
								{turn.events.map((e, ei) => (
									<li
										// biome-ignore lint/suspicious/noArrayIndexKey: les événements d'un tour sont positionnels (append-only)
										key={ei}
										className="font-mono text-[11px] leading-relaxed text-muted-foreground"
									>
										{e.env !== undefined ? `${e.kind} · ${e.env}` : e.kind} —{" "}
										{e.detail}
										{e.ref !== "" ? ` [${e.ref}]` : ""}
									</li>
								))}
							</ul>
						</div>
						<div className="space-y-1">
							<p className="font-semibold text-muted-foreground">
								{t.detailsImpacts}
							</p>
							{turn.impacts.length === 0 ? (
								<p className="text-muted-foreground italic">{t.detailsNone}</p>
							) : (
								<ul className="flex flex-wrap gap-1">
									{turn.impacts.map((i) => (
										<li
											key={`${i.type}:${i.cible}`}
											className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
										>
											{i.cible} · {i.type}
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</details>
			</div>
		</div>
	);
}

export function LabClient() {
	const {
		turns,
		send,
		aiEnabled,
		setAiEnabled,
		replies,
		busy,
		strings: t,
	} = useV3Session();
	const [input, setInput] = useState("");
	const bottomRef = useRef<HTMLDivElement>(null);
	const taRef = useRef<HTMLTextAreaElement>(null);

	// Le DÉFILEMENT AUTOMATIQUE vers le dernier message (et l'indicateur de frappe).
	// biome-ignore lint/correctness/useExhaustiveDependencies: turns.length et busy sont les DÉCLENCHEURS voulus du défilement (nouveau tour / frappe)
	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [turns.length, busy]);

	/** La zone de saisie auto-dimensionnée (façon GPT). */
	const autosize = () => {
		const el = taRef.current;
		if (el !== null) {
			el.style.height = "auto";
			el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
		}
	};

	/** UN envoi : vide la saisie puis délègue à la session (le réducteur est la loi). */
	const submit = (raw: string) => {
		const text = raw.trim();
		if (text === "" || busy) return;
		setInput("");
		const el = taRef.current;
		if (el !== null) el.style.height = "auto";
		void send(text);
	};

	/** Une carte d'amorce : PRÉ-REMPLIR (la capture — l'utilisateur écrit son idée,
	 *  rien ne part) ou ENVOYER la phrase canonique prouvée. */
	const onSuggestion = (s: (typeof SUGGESTIONS)[number]) => {
		if (s.mode === "prefill") {
			setInput(s.text);
			taRef.current?.focus();
			return;
		}
		submit(s.text);
	};

	// LE LAB EN DEUX COLONNES : le chat (~60 %) + les 3 prévisualisations EN DIRECT
	// (~40 %) — empilées sur mobile. La prévisualisation est une LECTURE pure de la
	// même session (emitApp recalculé à chaque tour) : « voir le site en construction ».
	return (
		<div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-start gap-6 lg:grid-cols-[3fr_2fr]">
			<div
				data-testid="v3-chat"
				className="mx-auto flex h-[calc(100vh-3rem)] w-full max-w-3xl min-w-0 flex-col"
			>
				{/* ── la conversation (pleine hauteur, défilante) ── */}
				<div className="flex-1 space-y-6 overflow-y-auto py-4 pr-1">
					{turns.length === 0 && !busy ? (
						/* · le HERO d'accueil — accueillant, sans jargon */
						<div className="flex h-full flex-col items-center justify-center gap-6 text-center">
							<div className="space-y-2">
								<p className="text-2xl font-semibold text-foreground">
									{t.heroTitle}
								</p>
								<p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
									{t.heroSubtitle}
								</p>
							</div>
							<div className="w-full max-w-xl space-y-2">
								<p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
									{t.suggestionsLabel}
								</p>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
									{SUGGESTIONS.map((s) => (
										<button
											key={s.labelKey}
											type="button"
											data-testid="v3-suggestion"
											data-mode={s.mode}
											onClick={() => onSuggestion(s)}
											className="rounded-xl border border-border bg-card p-4 text-left text-sm text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
										>
											{t[s.labelKey]}
										</button>
									))}
								</div>
							</div>
						</div>
					) : (
						turns.map((turn, ti) => (
							<div key={turn.index} className="space-y-2">
								{/* · la bulle utilisateur */}
								<div className="flex justify-end">
									<p
										data-testid="v3-msg-user"
										className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
									>
										{turn.msg}
									</p>
								</div>
								{/* · la carte assistant */}
								<AssistantCard
									turn={turn}
									reply={replies[turn.index]}
									isLast={ti === turns.length - 1}
									t={t}
									onChip={submit}
								/>
							</div>
						))
					)}

					{/* · l'indicateur de frappe animé (pendant le tour IA) */}
					{busy && (
						<div className="flex justify-start">
							<div
								data-testid="v3-typing"
								className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3"
							>
								<span className="sr-only">{t.typing}</span>
								{[0, 150, 300].map((d) => (
									<span
										key={d}
										className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60"
										style={{ animationDelay: `${d}ms` }}
									/>
								))}
							</div>
						</div>
					)}
					<div ref={bottomRef} />
				</div>

				{/* ── la saisie épinglée en bas (Entrée envoie · Maj+Entrée nouvelle ligne) ── */}
				<div className="space-y-2 border-t border-border bg-background pt-3 pb-1">
					<div className="flex items-end gap-2">
						<textarea
							ref={taRef}
							data-testid="v3-input"
							value={input}
							rows={1}
							aria-label={t.inputPlaceholder}
							onChange={(e) => {
								setInput(e.target.value);
								autosize();
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									submit(input);
								}
							}}
							placeholder={t.inputPlaceholder}
							className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30 focus:outline-none"
						/>
						<button
							type="button"
							data-testid="v3-send"
							disabled={input.trim() === "" || busy}
							onClick={() => submit(input)}
							className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{t.send}
						</button>
					</div>
					{/* · la bascule « IA conversationnelle » (défaut ON) — le mode déterministe pur à un clic */}
					<div
						className="flex items-center gap-2 text-xs text-muted-foreground"
						title={t.aiToggleHint}
					>
						<button
							type="button"
							role="switch"
							aria-checked={aiEnabled}
							aria-label={t.aiToggle}
							data-testid="v3-ai-toggle"
							onClick={() => setAiEnabled(!aiEnabled)}
							className={[
								"relative h-5 w-9 rounded-full transition-colors",
								aiEnabled ? "bg-primary" : "bg-muted",
							].join(" ")}
						>
							<span
								className={[
									"absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
									aiEnabled ? "translate-x-4" : "",
								].join(" ")}
							/>
						</button>
						<span>{t.aiToggle}</span>
					</div>
				</div>
			</div>

			{/* ── la colonne droite : les 3 prévisualisations (web · mobile · desktop) ── */}
			<PreviewPane />
		</div>
	);
}
