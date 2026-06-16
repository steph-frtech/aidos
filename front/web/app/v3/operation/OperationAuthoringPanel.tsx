"use client";

import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import {
	buildOperation,
	deriveMirror,
	type GherkinIntent,
	MUTATE_OPS,
	STEP_KINDS,
	type StepInput,
	type StepKind,
	type TypedInputs,
} from "@/lib/v3/operation";
import { type ProposeResult, proposeOperationAction } from "./actions";
import { type ProposeFromTextResult, proposeFromText } from "./chat-actions";

/**
 * OperationAuthoringPanel — la SURFACE d'autoring d'opération V3 (A + B + C), action-capable
 * (CLAUDE.md §7 ui-completeness).
 *
 *   A — un CHAT (NL → candidat, l'EXCEPTION GATÉE, tranche 2) : l'utilisateur DÉCRIT
 *       l'opération ; proposeFromText fait PROPOSER au LLM un candidat structuré, que le code
 *       (judgeCandidate → buildOperation, l'autorité PURE) JUGE avant de PRÉ-REMPLIR l'éditeur
 *       typé (B). Le chat ALIMENTE B, il ne le contourne pas : l'utilisateur revoit/édite, puis
 *       ajoute le miroir (C) et propose. Le LLM ne décide RIEN, n'écrit RIEN — il propose.
 *   B — un ÉDITEUR TYPÉ : le nom, le schéma d'input, la liste d'étapes (sélecteur de
 *       verbe parmi les SIX de la grammaire FERMÉE + les champs propres au verbe), les
 *       événements émis. L'AST est CONSTRUIT en direct par lib/v3/operation.buildOperation
 *       (réducteur PUR) ; les refus TYPÉS s'affichent à mesure (verbe hors grammaire,
 *       entité vide, mutate op illégal…).
 *   C — un champ MIROIR Given/When/Then → deriveMirror (réducteur PUR) : la fixture N2
 *       {state → command → events} s'affiche ; le Then ne peut référencer que les Emits
 *       déclarés (l'op porte ses événements). Le bouton « Proposer » est DÉSACTIVÉ tant
 *       qu'il n'y a pas de miroir valide (la porte C obligatoire).
 *
 * LE MUR (§2) : « Proposer » dérive une idée via idea_capture (la porte légale), JAMAIS une
 * écriture kernel/mirrors. La promotion en vérité reste /goal. Thème ADR 0010 (tokens), i18n
 * ADR 0011 (next-intl). DÉTERMINISME-FIRST (§6) : build + derive sont purs ; aucun LLM ici.
 */

/** Une étape éditée localement — l'union ouverte du formulaire (validée par buildOperation). */
interface EditStep {
	readonly kind: string;
	schema: string;
	policy: string;
	entity: string;
	op: string;
	as: string;
	cond: string;
	ref: string;
	/** `where` / `data` saisis comme « clé=valeur » par ligne (l'éditeur d'objet plat). */
	where: string;
	data: string;
}

function blankStep(kind: string): EditStep {
	return {
		kind,
		schema: "",
		policy: "",
		entity: "",
		op: "create",
		as: "",
		cond: "",
		ref: "",
		where: "",
		data: "",
	};
}

/** parsePairs — « clé=valeur » par ligne → un objet plat. PURE (déterministe, ordre préservé). */
function parsePairs(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const i = line.indexOf("=");
		if (i <= 0) continue;
		const k = line.slice(0, i).trim();
		const v = line.slice(i + 1).trim();
		if (k !== "") out[k] = v;
	}
	return out;
}

/** toStepInput — projette une EditStep vers le StepInput typé que buildOperation consomme. */
function toStepInput(s: EditStep): StepInput {
	switch (s.kind) {
		case "validate":
			return { kind: "validate", schema: s.schema };
		case "authorize":
			return { kind: "authorize", policy: s.policy };
		case "read":
			return {
				kind: "read",
				entity: s.entity,
				where: parsePairs(s.where),
				as: s.as,
			};
		case "mutate":
			return {
				kind: "mutate",
				entity: s.entity,
				op: s.op,
				data: parsePairs(s.data),
				where: parsePairs(s.where),
				as: s.as,
			};
		case "branch":
			// Les sous-pipelines (then/else) ne sont pas édités dans cette première surface
			// (la grammaire les porte ; un branch sans sous-étape reste valide en forme).
			// biome-ignore lint/suspicious/noThenProperty: « then » est le champ Then de step.go BranchStep (le sous-pipeline), la langue ubiquitaire KRD — jamais une thenable.
			return { kind: "branch", cond: s.cond, then: [], else: [] };
		case "return":
			return { kind: "return", ref: s.ref };
		default:
			return { kind: s.kind };
	}
}

/** pairsToText — objet plat → « clé = valeur » par ligne (l'inverse de parsePairs, pour le prefill). */
function pairsToText(o: Readonly<Record<string, unknown>> | undefined): string {
	if (!o) return "";
	return Object.keys(o)
		.map((k) => `${k} = ${String(o[k])}`)
		.join("\n");
}

/**
 * fromStepInput — projette un StepInput typé (le candidat jugé) vers une EditStep éditable —
 * l'INVERSE de toStepInput. C'est la jonction A→B : le candidat du chat alimente l'éditeur typé,
 * que l'utilisateur revoit/édite ensuite. PURE & DÉTERMINISTE.
 */
function fromStepInput(s: StepInput): EditStep {
	const base = blankStep(s.kind);
	switch (s.kind) {
		case "validate":
			return { ...base, schema: s.schema ?? "" };
		case "authorize":
			return { ...base, policy: s.policy ?? "" };
		case "read":
			return {
				...base,
				entity: s.entity ?? "",
				as: s.as ?? "",
				where: pairsToText(s.where),
			};
		case "mutate":
			return {
				...base,
				entity: s.entity ?? "",
				op: s.op ?? "create",
				as: s.as ?? "",
				where: pairsToText(s.where),
				data: pairsToText(s.data),
			};
		case "branch":
			return { ...base, cond: s.cond ?? "" };
		case "return":
			return { ...base, ref: s.ref ?? "" };
		default:
			return base;
	}
}

const initial: ProposeResult = { ok: false, messageKey: "" };

function ProposeButton({
	disabled,
	label,
}: {
	disabled: boolean;
	label: string;
}) {
	const t = useTranslations("v3operation");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="op-propose"
			disabled={disabled || pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

export function OperationAuthoringPanel({
	suggestions,
}: {
	/** Pistes (non contraignantes) tirées de la grammaire close du projet : entités, policies, événements. */
	suggestions: { entities: string[]; policies: string[]; events: string[] };
}) {
	const t = useTranslations("v3operation");
	const [result, action] = useActionState(proposeOperationAction, initial);

	// ── B — l'état de l'éditeur typé ──
	const [name, setName] = useState("");
	const [input, setInput] = useState("");
	const [emits, setEmits] = useState("");
	const [steps, setSteps] = useState<EditStep[]>([blankStep("validate")]);

	// ── C — l'état du miroir Gherkin ──
	const [given, setGiven] = useState("");
	const [when, setWhen] = useState("");
	const [then, setThen] = useState("");

	// ── A — l'état du chat (NL → candidat, l'exception gatée) ──
	const [chatText, setChatText] = useState("");
	const [chat, setChat] = useState<ProposeFromTextResult | null>(null);
	const [chatPending, startChat] = useTransition();

	// La jonction A→B : on PRÉ-REMPLIT l'éditeur typé avec le candidat JUGÉ (jamais on n'écrit ;
	// l'utilisateur revoit/édite ensuite). On ne pré-remplit que sur "prefill" (candidat valide)
	// OU "refused" (on montre ce que le LLM a proposé AVEC les refus typés de B) — jamais à l'aveugle.
	function applyPrefill(res: ProposeFromTextResult) {
		if (res.kind !== "prefill" && res.kind !== "refused") return;
		const typed = res.typed;
		setName(typed.name);
		setInput(typed.input);
		setEmits(typed.emits.join(", "));
		setSteps(
			typed.steps.length > 0
				? typed.steps.map(fromStepInput)
				: [blankStep("validate")],
		);
	}

	function onChatSubmit() {
		const nl = chatText.trim();
		if (nl === "" || chatPending) return;
		startChat(async () => {
			// proposeFromText : le LLM PROPOSE, buildOperation JUGE. On ne reçoit qu'un verdict
			// déjà jugé ; on alimente l'éditeur (B), on ne contourne ni B ni C.
			const res = await proposeFromText(nl, {
				entities: suggestions.entities,
				policies: suggestions.policies,
				events: suggestions.events,
			});
			setChat(res);
			applyPrefill(res);
		});
	}

	// L'entrée typée (B) — recalculée à chaque rendu (pur). Les Emits : une liste « , »/retour.
	const emitsList = useMemo(
		() =>
			emits
				.split(/[\n,]/)
				.map((e) => e.trim())
				.filter((e) => e !== ""),
		[emits],
	);
	const typed: TypedInputs = useMemo(
		() => ({ name, input, emits: emitsList, steps: steps.map(toStepInput) }),
		[name, input, emitsList, steps],
	);

	// B — l'AST construit EN DIRECT par le réducteur PUR (l'autorité, le même côté serveur).
	const built = useMemo(() => buildOperation(typed), [typed]);
	const op = built.ok ? built.op : null;

	// C — le miroir dérivé EN DIRECT (PUR), seulement si l'AST est valide. L'intent est
	// construit DANS le memo (à partir des primitives) pour que les deps soient exactes.
	const intent: GherkinIntent = { given, when, then };
	const derived = useMemo(
		() => (op ? deriveMirror({ given, when, then }, op) : null),
		[op, given, when, then],
	);
	const mirror = derived?.ok ? derived.fixture : null;

	// La PORTE C OBLIGATOIRE : « Proposer » est désactivé tant qu'il n'y a pas de miroir valide.
	const canPropose = op !== null && mirror !== null;

	return (
		<form
			action={action}
			data-testid="op-form"
			className="grid gap-8 lg:grid-cols-2"
		>
			{/* Les deux champs cachés sérialisés (JSON déjà typé — aucun parse NL côté serveur). */}
			<input type="hidden" name="op" value={JSON.stringify(typed)} readOnly />
			<input
				type="hidden"
				name="mirror"
				value={JSON.stringify(intent)}
				readOnly
			/>

			{/* ─────────────────── A — le chat (NL → candidat, l'exception gatée) ─────────────────── */}
			<section
				data-testid="op-chat"
				aria-label={t("chatHeading")}
				className="space-y-3 rounded-xl border border-border bg-card p-5 lg:col-span-2"
			>
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("chatHeading")}
					</h2>
					<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
						{t("chatGatedBadge")}
					</span>
				</div>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("chatIntro")}
				</p>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-end">
					<label className="block flex-1 space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("chatLabel")}
						</span>
						<textarea
							data-testid="op-chat-input"
							value={chatText}
							onChange={(e) => setChatText(e.target.value)}
							onKeyDown={(e) => {
								// Cmd/Ctrl+Entrée envoie (un textarea garde Entrée pour le retour à la ligne).
								if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
									e.preventDefault();
									onChatSubmit();
								}
							}}
							rows={2}
							placeholder={t("chatPlaceholder")}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<button
						type="button"
						data-testid="op-chat-submit"
						onClick={onChatSubmit}
						disabled={chatPending || chatText.trim() === ""}
						className="inline-flex items-center justify-center rounded-lg border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					>
						{chatPending ? t("chatWorking") : t("chatSubmit")}
					</button>
				</div>

				{/* Le verdict du chat — le LLM a proposé, le code a jugé. Quatre issues, jamais une autorité. */}
				{chat && (
					<div
						data-testid="op-chat-result"
						data-kind={chat.kind}
						className="space-y-2 text-xs"
					>
						{chat.kind !== "llmUnavailable" && chat.reply !== "" && (
							<p className="rounded-lg border border-border bg-muted/40 p-3 text-foreground">
								{chat.reply}
							</p>
						)}
						{chat.kind === "prefill" && (
							<p className="text-primary">{t("chatPrefilled")}</p>
						)}
						{chat.kind === "refused" && (
							<div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
								<p className="font-medium">{t("chatRefused")}</p>
								<ul className="space-y-0.5">
									{chat.errors.map((e) => (
										<li key={`${e.code}-${e.stepIndex}`}>
											<code className="font-mono">{e.code}</code> — {e.message}
										</li>
									))}
								</ul>
							</div>
						)}
						{chat.kind === "malformed" && (
							<p className="text-amber-600 dark:text-amber-400">
								{t("chatMalformed")}
							</p>
						)}
						{chat.kind === "llmUnavailable" && (
							<p className="text-muted-foreground">{t("chatUnavailable")}</p>
						)}
					</div>
				)}
			</section>

			{/* ─────────────────── B — l'éditeur typé ─────────────────── */}
			<section
				data-testid="op-editor"
				aria-label={t("editorHeading")}
				className="space-y-5 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("editorHeading")}
				</h2>

				<div className="grid gap-4 sm:grid-cols-2">
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("nameLabel")}
						</span>
						<input
							data-testid="op-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="createOrder"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
					<label className="block space-y-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							{t("inputLabel")}
						</span>
						<input
							data-testid="op-input"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="CreateOrderInput"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
					</label>
				</div>

				{/* Les étapes — un sélecteur de verbe (les SIX) + les champs propres au verbe. */}
				<div className="space-y-3">
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-muted-foreground">
							{t("stepsLabel")}
						</span>
						<span className="text-[11px] text-muted-foreground">
							{t("closedGrammarNote")}
						</span>
					</div>
					{steps.map((s, i) => (
						<StepRow
							// biome-ignore lint/suspicious/noArrayIndexKey: l'étape n'a pas d'id stable ; l'index EST sa position dans le pipeline.
							key={i}
							index={i}
							step={s}
							suggestions={suggestions}
							onChange={(next) =>
								setSteps((prev) => prev.map((p, j) => (j === i ? next : p)))
							}
							onRemove={() =>
								setSteps((prev) => prev.filter((_, j) => j !== i))
							}
							canRemove={steps.length > 1}
						/>
					))}
					<div className="flex flex-wrap gap-2">
						{STEP_KINDS.map((k) => (
							<button
								key={k}
								type="button"
								data-testid="op-add-step"
								data-kind={k}
								onClick={() => setSteps((prev) => [...prev, blankStep(k)])}
								className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
							>
								+ {t(`verb.${k}`)}
							</button>
						))}
					</div>
				</div>

				<label className="block space-y-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						{t("emitsLabel")}
					</span>
					<input
						data-testid="op-emits"
						value={emits}
						onChange={(e) => setEmits(e.target.value)}
						placeholder="OrderCreated, CartCleared"
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					{suggestions.events.length > 0 && (
						<span className="text-[11px] text-muted-foreground">
							{t("eventsHint")}: {suggestions.events.join(", ")}
						</span>
					)}
				</label>

				{/* Les refus TYPÉS de B — affichés en direct (verbe hors grammaire, champ manquant…). */}
				{!built.ok && (
					<ul
						data-testid="op-build-errors"
						className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
					>
						{built.errors.map((e) => (
							<li key={`${e.code}-${e.stepIndex}`}>
								<code className="font-mono">{e.code}</code> — {e.message}
							</li>
						))}
					</ul>
				)}
			</section>

			{/* ─────────────────── C — le miroir + la proposition ─────────────────── */}
			<section
				data-testid="op-mirror"
				aria-label={t("mirrorHeading")}
				className="space-y-5 rounded-xl border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("mirrorHeading")}
				</h2>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("mirrorIntro")}
				</p>

				<label className="block space-y-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						Given
					</span>
					<input
						data-testid="op-given"
						value={given}
						onChange={(e) => setGiven(e.target.value)}
						placeholder={t("givenPlaceholder")}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
				<label className="block space-y-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						When
					</span>
					<input
						data-testid="op-when"
						value={when}
						onChange={(e) => setWhen(e.target.value)}
						placeholder={t("whenPlaceholder")}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>
				<label className="block space-y-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						Then
					</span>
					<input
						data-testid="op-then"
						value={then}
						onChange={(e) => setThen(e.target.value)}
						placeholder={t("thenPlaceholder")}
						className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</label>

				{/* La fixture N2 dérivée — affichée quand l'AST + le miroir sont valides. */}
				{mirror ? (
					<div
						data-testid="op-derived-fixture"
						className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs"
					>
						<p className="font-semibold text-primary">{t("fixtureHeading")}</p>
						<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-foreground">
							<dt className="text-muted-foreground">state</dt>
							<dd>{mirror.given}</dd>
							<dt className="text-muted-foreground">command</dt>
							<dd className="font-mono">
								{mirror.command.name}({mirror.command.input})
							</dd>
							<dt className="text-muted-foreground">events</dt>
							<dd className="font-mono">
								{mirror.expectedEvents.join(", ") || "∅"}
							</dd>
							<dt className="text-muted-foreground">then</dt>
							<dd>{mirror.then}</dd>
						</dl>
					</div>
				) : (
					<div
						data-testid="op-derive-errors"
						className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400"
					>
						{derived && !derived.ok ? (
							<ul className="space-y-1">
								{derived.errors.map((e) => (
									<li key={e.code}>
										<code className="font-mono">{e.code}</code> — {e.message}
									</li>
								))}
							</ul>
						) : (
							<p>{t("mirrorPending")}</p>
						)}
					</div>
				)}

				{/* La PORTE C : le bouton « Proposer » DÉSACTIVÉ tant qu'il n'y a pas de miroir. */}
				<div className="flex flex-col gap-2 border-t border-border pt-4">
					<div className="flex items-center gap-3">
						<ProposeButton disabled={!canPropose} label={t("proposeButton")} />
						<span className="text-xs text-muted-foreground">
							{canPropose ? t("wallNote") : t("gateNote")}
						</span>
					</div>
					{result.messageKey && (
						<div
							data-testid="op-result"
							className={`text-sm ${result.ok ? "text-primary" : "text-destructive"}`}
						>
							<p>{t(`messages.${result.messageKey}`)}</p>
							{result.ok && result.idea && (
								<p className="mt-1 text-xs text-muted-foreground">
									{t("ideaIdLabel")}:{" "}
									<code
										data-testid="op-idea-id"
										data-source={result.idea.source}
										className="font-mono"
									>
										{result.idea.id.slice(0, 16)}…
									</code>{" "}
									<span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
										{result.idea.status}
									</span>{" "}
									<span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
										{result.idea.source === "live"
											? t("sourceLive")
											: t("sourceDemo")}
									</span>
								</p>
							)}
							{result.buildErrors && (
								<ul className="mt-1 space-y-0.5 text-xs">
									{result.buildErrors.map((e) => (
										<li key={`${e.code}-${e.stepIndex}`}>
											<code className="font-mono">{e.code}</code>
										</li>
									))}
								</ul>
							)}
							{result.deriveErrors && (
								<ul className="mt-1 space-y-0.5 text-xs">
									{result.deriveErrors.map((e) => (
										<li key={e.code}>
											<code className="font-mono">{e.code}</code>
										</li>
									))}
								</ul>
							)}
						</div>
					)}
				</div>
			</section>
		</form>
	);
}

/** StepRow — l'éditeur d'UNE étape : le verbe (fixe, choisi à l'ajout) + ses champs. */
function StepRow({
	index,
	step,
	suggestions,
	onChange,
	onRemove,
	canRemove,
}: {
	index: number;
	step: EditStep;
	suggestions: { entities: string[]; policies: string[]; events: string[] };
	onChange: (next: EditStep) => void;
	onRemove: () => void;
	canRemove: boolean;
}) {
	const t = useTranslations("v3operation");
	const kind = step.kind as StepKind;
	const set = (patch: Partial<EditStep>) => onChange({ ...step, ...patch });
	const field =
		"w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

	return (
		<div
			data-testid="op-step"
			data-kind={step.kind}
			className="space-y-2 rounded-lg border border-border bg-muted/30 p-3"
		>
			<div className="flex items-center justify-between">
				<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
					<span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] text-primary">
						{index + 1}
					</span>
					{t(`verb.${step.kind}`)}
				</span>
				{canRemove && (
					<button
						type="button"
						data-testid="op-step-remove"
						onClick={onRemove}
						className="text-xs text-muted-foreground transition-colors hover:text-destructive"
					>
						{t("removeStep")}
					</button>
				)}
			</div>

			{kind === "validate" && (
				<input
					data-testid="op-step-schema"
					value={step.schema}
					onChange={(e) => set({ schema: e.target.value })}
					placeholder={t("schemaPlaceholder")}
					list="op-entities"
					className={field}
				/>
			)}
			{kind === "authorize" && (
				<input
					data-testid="op-step-policy"
					value={step.policy}
					onChange={(e) => set({ policy: e.target.value })}
					placeholder={t("policyPlaceholder")}
					list="op-policies"
					className={field}
				/>
			)}
			{kind === "read" && (
				<div className="grid gap-2 sm:grid-cols-2">
					<input
						data-testid="op-step-entity"
						value={step.entity}
						onChange={(e) => set({ entity: e.target.value })}
						placeholder={t("entityPlaceholder")}
						list="op-entities"
						className={field}
					/>
					<input
						data-testid="op-step-as"
						value={step.as}
						onChange={(e) => set({ as: e.target.value })}
						placeholder="$.cart"
						className={field}
					/>
					<textarea
						data-testid="op-step-where"
						value={step.where}
						onChange={(e) => set({ where: e.target.value })}
						placeholder={t("wherePlaceholder")}
						rows={2}
						className={`${field} sm:col-span-2 font-mono`}
					/>
				</div>
			)}
			{kind === "mutate" && (
				<div className="grid gap-2 sm:grid-cols-2">
					<input
						data-testid="op-step-entity"
						value={step.entity}
						onChange={(e) => set({ entity: e.target.value })}
						placeholder={t("entityPlaceholder")}
						list="op-entities"
						className={field}
					/>
					<select
						data-testid="op-step-op"
						value={step.op}
						onChange={(e) => set({ op: e.target.value })}
						className={field}
					>
						{MUTATE_OPS.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</select>
					<input
						data-testid="op-step-as"
						value={step.as}
						onChange={(e) => set({ as: e.target.value })}
						placeholder="$.order"
						className={field}
					/>
					<textarea
						data-testid="op-step-data"
						value={step.data}
						onChange={(e) => set({ data: e.target.value })}
						placeholder={t("dataPlaceholder")}
						rows={2}
						className={`${field} sm:col-span-2 font-mono`}
					/>
				</div>
			)}
			{kind === "branch" && (
				<input
					data-testid="op-step-cond"
					value={step.cond}
					onChange={(e) => set({ cond: e.target.value })}
					placeholder={t("condPlaceholder")}
					className={field}
				/>
			)}
			{kind === "return" && (
				<input
					data-testid="op-step-ref"
					value={step.ref}
					onChange={(e) => set({ ref: e.target.value })}
					placeholder="$.order"
					className={field}
				/>
			)}

			{/* Les listes de suggestions (la grammaire close du projet) — non contraignantes. */}
			<datalist id="op-entities">
				{suggestions.entities.map((x) => (
					<option key={x} value={x} />
				))}
			</datalist>
			<datalist id="op-policies">
				{suggestions.policies.map((x) => (
					<option key={x} value={x} />
				))}
			</datalist>
		</div>
	);
}
