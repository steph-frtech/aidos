"use client";

import { useEffect, useState } from "react";
import {
	CAN_PLACE_ORDER,
	canonicalize,
	type Decision,
	flatten,
	type PolicySample,
	RULE_KINDS,
	type RuleKind,
	SAMPLES,
	SCOPES,
	sampleDecision,
} from "@/lib/policy";
import { useV3Session } from "../V3Session";

/**
 * /v3/policy — LA LENTILLE POLICY (le portage propre de l'écran conceptuel KRD dans la
 * session V3) : client-only car TOUTE la logique est projetée du TWIN PUR lib/policy.ts
 * (l'AST canPlaceOrder, flatten, canonicalize, SCOPES/RULE_KINDS, sampleDecision —
 * byte-identiques à back/kernel/policy, couverts par lib/policy.test.ts). Cette lentille
 * ne ré-implémente AUCUNE logique d'autorisation.
 *
 * ACTION-CAPABLE (§6, ui-completeness) : l'écran NE FAIT PAS qu'afficher —
 *   - on lit l'ancre canPlaceOrder (scope, effet, arbre de règles, adresse de contenu) ;
 *   - on PARCOURT les quatre scopes + les huit types de nœud (le jeu clos de la grammaire) ;
 *   - on ÉVALUE un contexte : un bouton par échantillon (v3-policy-eval) calcule la
 *     décision totale ALLOW/DENY que la fixture prouve.
 *
 * L'ADRESSE DE CONTENU : la MÊME que l'id kernel.policy du Go — SHA-256 des octets
 * canoniques (canonicalize == Go policy.Canonicalize). Calculée via Web Crypto
 * (crypto.subtle.digest) — même algorithme, déterministe, hex identique au Go ; pendant
 * le calcul async (un tick), un placeholder « … » s'affiche (jamais une valeur fausse).
 *
 * LE MUR (§2) : l'écran LIT l'AST de policy et REND ses verdicts ALLOW/DENY ; il n'écrit
 * AUCUNE vérité. Une policy est une vérité SOURCE au-dessus de la ligne de flottaison —
 * modifier une policy PROPOSE → idée → miroir → /goal → approbation, jamais une écriture
 * directe d'écran. Themed (tokens shadcn ADR 0010, zéro hex/zinc) + bilingue (next-intl,
 * FR par défaut, ADR 0011 — strings depuis la session V3).
 */

type Strings = Record<string, string>;

/** Le glossaire des huit types de nœud → leur clé i18n (jeu clos, jamais inventé). */
const RULE_GLOSS_KEY: Record<RuleKind, string> = {
	all: "policyKindAll",
	any: "policyKindAny",
	not: "policyKindNot",
	eq: "policyKindEq",
	gt: "policyKindGt",
	lt: "policyKindLt",
	exists: "policyKindExists",
	matches: "policyKindMatches",
};

/** Le badge de décision : ALLOW (primaire) / DENY (destructif), thémé tokens. */
function DecisionBadge({ decision }: { decision: Decision }) {
	const allow = decision === "ALLOW";
	return (
		<code
			className={[
				"inline-flex items-center rounded px-2.5 py-1 font-mono text-sm font-semibold",
				allow
					? "bg-primary/10 text-primary"
					: "bg-destructive/10 text-destructive",
			].join(" ")}
		>
			{decision}
		</code>
	);
}

/**
 * contentAddress calcule l'adresse de contenu de canPlaceOrder : SHA-256 des octets
 * canoniques (== l'id Go). Web Crypto est async, d'où le hook ci-dessous ; pur et
 * déterministe (mêmes octets → même hex).
 */
async function contentAddress(): Promise<string> {
	const bytes = new TextEncoder().encode(canonicalize(CAN_PLACE_ORDER));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export function PolicyClient() {
	const { strings } = useV3Session();
	const t = strings as Strings;

	// L'adresse de contenu, calculée async via Web Crypto (un placeholder le temps du tick).
	const [id, setId] = useState<string>("…");
	useEffect(() => {
		let live = true;
		void contentAddress().then((hex) => {
			if (live) setId(hex);
		});
		return () => {
			live = false;
		};
	}, []);

	// L'échantillon SÉLECTIONNÉ (le contexte évalué) ; null = rien évalué encore.
	const [selected, setSelected] = useState<PolicySample | null>(null);

	// L'arbre de règles APLATI (pur, depuis le twin — jamais ré-implémenté).
	const flat = flatten(CAN_PLACE_ORDER.rule);

	return (
		<div className="space-y-8">
			{/* Le bandeau du mur : l'écran lit, il ne touche pas la vérité. */}
			<p
				data-testid="v3-policy-wall"
				className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
			>
				{t.policyWallBadge}
			</p>

			{/* Tutoriel — comment lire une policy (ui-completeness). */}
			<section
				aria-label={t.policyTutorialHeading}
				data-testid="v3-policy-tutorial"
				className="space-y-3 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t.policyTutorialHeading}
				</h2>
				<p className="text-sm text-muted-foreground">{t.policyTutorialLead}</p>
				<ul className="space-y-2 text-sm leading-relaxed text-card-foreground">
					<li>{t.policyTutorialScope}</li>
					<li>{t.policyTutorialRule}</li>
					<li>{t.policyTutorialEffect}</li>
					<li>{t.policyTutorialExample}</li>
				</ul>
			</section>

			{/* L'ancre canPlaceOrder : scope, effet, arbre de règles, adresse de contenu. */}
			<section aria-label={t.policyAnchorHeading} className="space-y-4">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t.policyAnchorHeading}
					</h2>
					<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{t.policyKernelBadge}
					</span>
					<span
						data-testid="v3-policy-authority"
						className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
					>
						{t.policyAuthorityBadge}
					</span>
					<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{t.policyReadOnly}
					</span>
				</div>

				<article
					data-testid="v3-policy-anchor"
					className="space-y-4 rounded-xl border border-border bg-card p-5"
				>
					<div className="flex flex-wrap items-center gap-2">
						<code className="rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground">
							policy &quot;canPlaceOrder&quot;
						</code>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
							{t.policyScopeLabel}:{" "}
							<code className="font-mono">
								{CAN_PLACE_ORDER.scope} {CAN_PLACE_ORDER.target}
							</code>
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
							{t.policyEffectLabel}: {CAN_PLACE_ORDER.effect}
						</span>
					</div>

					{/* L'arbre de règles typé. */}
					<div className="space-y-1">
						<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
							{t.policyRuleLabel}
						</p>
						<ul data-testid="v3-policy-rule-tree" className="font-mono text-xs">
							{flat.map((n) => (
								<li
									key={n.id}
									className="flex items-center gap-2 py-0.5"
									style={{ paddingLeft: `${n.depth * 1.1}rem` }}
								>
									<span className="inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-primary">
										{n.kind}
									</span>
									<span className="text-card-foreground">{n.label}</span>
								</li>
							))}
						</ul>
					</div>

					{/* L'adresse de contenu (id == version). */}
					<div className="space-y-1">
						<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
							{t.policyIdLabel}
						</p>
						<code
							data-testid="v3-policy-id"
							className="block break-all rounded bg-muted px-2 py-1 font-mono text-[0.7rem] text-muted-foreground"
						>
							{id}
						</code>
					</div>
				</article>
			</section>

			{/* Les quatre scopes. */}
			<section aria-label={t.policyScopesHeading} className="space-y-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t.policyScopesHeading}
				</h2>
				<div className="flex flex-wrap gap-2" data-testid="v3-policy-scopes">
					{SCOPES.map((s) => (
						<code
							key={s}
							className="rounded bg-muted px-2 py-1 font-mono text-sm text-card-foreground"
						>
							{s}
						</code>
					))}
				</div>
			</section>

			{/* Les huit types de nœud de règle. */}
			<section aria-label={t.policyKindsHeading} className="space-y-3">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t.policyKindsHeading}
				</h2>
				<div className="flex flex-wrap gap-2" data-testid="v3-policy-kinds">
					{RULE_KINDS.map((k) => (
						<span
							key={k}
							className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm"
						>
							<code className="font-mono font-semibold text-card-foreground">
								{k}
							</code>
							<span className="text-xs text-muted-foreground">
								{t[RULE_GLOSS_KEY[k]]}
							</span>
						</span>
					))}
				</div>
			</section>

			{/* Essayer un contexte → décision ALLOW/DENY (action-capable). */}
			<section aria-label={t.policyTryHeading} className="space-y-4">
				<h2 className="text-lg font-semibold tracking-tight text-foreground">
					{t.policyTryHeading}
				</h2>
				<p className="text-sm text-muted-foreground">{t.policyTryLead}</p>
				<div className="grid gap-4">
					{SAMPLES.map((sample) => {
						const isSelected = selected?.id === sample.id;
						const decision = isSelected ? sampleDecision(sample) : null;
						return (
							<article
								key={sample.id}
								data-testid="v3-policy-sample"
								data-id={sample.id}
								className="space-y-3 rounded-xl border border-border bg-card p-5"
							>
								<p className="text-sm leading-relaxed text-card-foreground">
									{sample.role}
								</p>
								<div className="grid gap-3 sm:grid-cols-[1fr_auto]">
									<div className="space-y-1">
										<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
											{t.policyCtxLabel}
										</p>
										<code className="block rounded bg-muted px-2 py-1 font-mono text-[0.7rem] text-muted-foreground">
											{JSON.stringify(sample.ctx)}
										</code>
									</div>
									<div className="flex flex-col items-start gap-2 sm:items-end">
										<button
											type="button"
											data-testid="v3-policy-eval"
											data-id={sample.id}
											onClick={() => setSelected(sample)}
											className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
										>
											{t.policyDecisionLabel}
										</button>
										{decision !== null && (
											<span
												data-testid="v3-policy-decision"
												data-id={sample.id}
												data-decision={decision}
											>
												<DecisionBadge decision={decision} />
											</span>
										)}
									</div>
								</div>
							</article>
						);
					})}
				</div>
			</section>

			{/* La note du mur : modifier une policy PROPOSE → /goal, jamais une écriture directe. */}
			<p
				data-testid="v3-policy-propose-note"
				className="border-t border-border pt-6 text-xs text-muted-foreground"
			>
				{t.policyProposeNote}
			</p>
		</div>
	);
}
