import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OperationAuthoringPanel } from "./OperationAuthoringPanel";

/**
 * /v3/operation — L'AUTORING D'OPÉRATION (lentille V3, autoring B+C). La surface où le
 * HUMAIN compose la LOGIQUE MÉTIER de son app comme une vérité N2 (Workflow) plutôt qu'un
 * blob de code : un ÉDITEUR TYPÉ construit l'AST Operation (B, buildOperation, la grammaire
 * FERMÉE des six verbes — l'autorité back/kernel/operation, twin lib/v3/operation), un champ
 * MIROIR Given/When/Then en dérive la fixture N2 (C, deriveMirror), et « Proposer » DÉRIVE
 * une idée candidate via la porte légale idea_capture.
 *
 * PAS de chat ici (la tranche A — NL→candidat — est gatée, tranche 2) : tout est CONSTRUIT
 * (B) et DÉRIVÉ (C) par des réducteurs PURS, jamais un LLM (CLAUDE.md §6/§8 determinism-first).
 *
 * LE MUR (§2) : l'écran PROPOSE, il n'écrit JAMAIS kernel/mirrors/fitness. La promotion en
 * vérité (kernel.operation) est /goal → ChangeSet → approbation HUMAINE (forward-dependency
 * documentée). Le serveur ne porte que le titre + les pistes de grammaire du projet ; l'AST
 * + le miroir vivent côté client (réducteurs purs) et sont re-vérifiés côté serveur à la
 * proposition. Thème ADR 0010 (tokens), bilingue ADR 0011 (next-intl, FR par défaut).
 */

export const metadata: Metadata = {
	title: "Autoring d'opération — AIDOS V3",
	description:
		"Composez la logique métier de votre app comme une opération (vérité N2 Workflow) : un éditeur typé construit l'AST (six verbes de la grammaire fermée), un miroir Given/When/Then en dérive la fixture state→command→events, et « Proposer » dérive une idée candidate via idea_capture. Le mur intact : l'écran propose, il n'écrit jamais le kernel ; la promotion reste /goal.",
};

/**
 * Les pistes de grammaire (non contraignantes) que l'éditeur propose dans ses datalists.
 * DÉTERMINISTE : un domaine canonique fermé (le panier/commande de la démo createOrder), si
 * bien que la surface n'est JAMAIS vide et reste autonome. La consommation des entités /
 * policies / events DEPUIS la grammaire close du projet (kernel.operation per-projet) est la
 * tranche 3 (forward-dependency documentée) : les valeurs restent des refs libres validées
 * par buildOperation, ces listes ne sont qu'une aide à la saisie.
 */
const PROJECT_GRAMMAR = {
	entities: ["Cart", "Order", "Customer", "Product"],
	policies: ["canPlaceOrder", "isOwner", "isAuthenticated"],
	events: ["OrderCreated", "CartCleared", "PaymentCaptured"],
} as const;

export default async function V3OperationScreen() {
	const t = await getTranslations("v3operation");
	return (
		<div
			data-testid="v3-operation"
			className="mx-auto w-full max-w-6xl space-y-6"
		>
			<div className="space-y-2">
				<div className="flex flex-wrap items-center gap-3">
					<h1 className="text-2xl font-semibold text-foreground">
						{t("title")}
					</h1>
					<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
						{t("wallBadge")}
					</span>
				</div>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("intro")}
				</p>
			</div>

			<OperationAuthoringPanel
				suggestions={{
					entities: [...PROJECT_GRAMMAR.entities],
					policies: [...PROJECT_GRAMMAR.policies],
					events: [...PROJECT_GRAMMAR.events],
				}}
			/>
		</div>
	);
}
