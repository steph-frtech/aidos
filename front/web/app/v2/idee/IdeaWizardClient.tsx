"use client";

import { useMachine } from "@xstate/react";
import { useId, useState } from "react";
import {
	nodePath,
	placeIntent,
	roleOf,
	type ScaleRole,
} from "@/lib/v2/composition";
import {
	type Besoin,
	type BesoinError,
	FACET_LETTERS,
	PROVENANCES,
	selectableLevels,
} from "@/lib/v2/idea";
import {
	buildKernelTree,
	type KernelNode,
	type TreeNode,
} from "@/lib/v2/kernel-tree";
import { ideaWizardMachine, WIZARD_STEPS } from "./IdeaWizardMachine";

/**
 * WB2-03 — le WIZARD d'idée, client-only (XState + RHF/Zod via le twin + stepper shadcn).
 *
 * ACTION-CAPABLE (CLAUDE.md §6, ui-completeness) : l'écran NE FAIT PAS qu'afficher — il CAPTURE
 * un besoin et le PROPOSE comme idée (le seul geste de cet étage). Chaque champ patche la
 * machine ; PROPOSER appelle le twin pur (composeIdea) ; aucune écriture-vérité (le mur, §2).
 *
 * L'ÉCHELLE VIVANTE (ADR 0055, §49/§108) : l'échelle n'est PAS un jeu clos — c'est une POSITION
 * (un chemin) dans l'arbre composes porté par la machine. La zone d'échelle fait trois gestes :
 *   1. le PLACEMENT PROPOSÉ — placeIntent (un algorithme de score, pur, calculé au rendu, jamais
 *      un prompt) propose où attacher l'intention ; l'HUMAIN peut l'adopter ou surcharger ;
 *   2. le PICKER d'arbre — une liste imbriquée accessible de <button> (rôle dérivé par roleOf,
 *      indentation par profondeur, aria-pressed sur la sélection). react-aria-components est
 *      dans les dépendances mais ADR 0053 admet un petit arbre a11y maison : une liste imbriquée
 *      shadcn suffit ici (pas de virtualisation nécessaire, l'arbre est petit) ;
 *   3. la GREFFE — l'humain pose les frontières (§49) : GROW_SCALE fait pousser l'arbre sous le
 *      nœud sélectionné (twin pur growComposes, fail-closed/idempotent) et auto-sélectionne.
 *
 * DÉTERMINISME-FIRST : la validation et la composition sont DÉLÉGUÉES au twin lib/v2/idea.ts ;
 * XState n'orchestre que l'état d'écran. Les jeux clos (niveaux, facettes, provenances) viennent
 * des sources ; racine/cellule/kernel/feuille sont des LECTURES DÉRIVÉES de la position (roleOf),
 * jamais stockées.
 */

type Strings = Record<string, string>;

const STATE_LABELS: Record<(typeof WIZARD_STEPS)[number], string> = {
	intention: "stepIntent",
	coordonnee: "stepCoordinate",
	provenance: "stepProvenance",
	revue: "stepReview",
	proposee: "stepProposed",
};

const ERROR_KEYS: Record<BesoinError, string> = {
	intent_too_short: "errIntent",
	level_unknown: "errLevel",
	facet_unknown: "errFacet",
	scale_unknown: "errScale",
	provenance_unknown: "errProvenance",
};

const ROLE_KEYS: Record<ScaleRole, string> = {
	racine: "roleRacine",
	cellule: "roleCellule",
	kernel: "roleKernel",
	feuille: "roleFeuille",
};

const PROVENANCE_KEYS: Record<string, string> = {
	humain: "provenanceHumain",
	incident: "provenanceIncident",
};

/** Le badge du RÔLE DÉRIVÉ d'une position (jamais stocké — roleOf, ADR 0055). */
function RoleBadge({ role, t }: { role: ScaleRole; t: Strings }) {
	return (
		<span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
			{t[ROLE_KEYS[role]] ?? role}
		</span>
	);
}

/**
 * La liste IMBRIQUÉE des nœuds de l'arbre (récursive) — chaque nœud est un <button> sélectionnable
 * (aria-pressed), portant son chemin (data-path) et son rôle dérivé ; l'indentation suit la
 * profondeur via l'imbrication des <ul> (petit arbre a11y maison, ADR 0053).
 */
function ScaleTreeNodes({
	nodes,
	tree,
	selectedPath,
	onSelect,
	t,
}: {
	nodes: readonly TreeNode[];
	tree: readonly KernelNode[];
	selectedPath: string;
	onSelect: (path: string) => void;
	t: Strings;
}) {
	return (
		<ul className="space-y-1">
			{nodes.map((n) => {
				const path = nodePath(tree, n.id).join("/");
				const selected = path === selectedPath;
				return (
					<li key={n.id} className={n.depth > 0 ? "pl-4" : undefined}>
						<button
							type="button"
							data-testid="v2-idee-scale-node"
							data-path={path}
							aria-pressed={selected}
							onClick={() => onSelect(path)}
							className={
								selected
									? "flex items-center gap-2 rounded-md border border-primary bg-primary/10 px-2 py-1 text-sm font-medium text-primary"
									: "flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm text-foreground hover:bg-muted"
							}
						>
							<span>{n.label}</span>
							<RoleBadge role={roleOf(tree, n.id)} t={t} />
						</button>
						{n.children.length > 0 && (
							<ScaleTreeNodes
								nodes={n.children}
								tree={tree}
								selectedPath={selectedPath}
								onSelect={onSelect}
								t={t}
							/>
						)}
					</li>
				);
			})}
		</ul>
	);
}

export function IdeaWizardClient({ t }: { t: Strings }) {
	const [state, send] = useMachine(ideaWizardMachine);
	const step = String(state.value) as (typeof WIZARD_STEPS)[number];
	const { besoin, idea, errors, tree } = state.context;
	const [growLabel, setGrowLabel] = useState("");
	const intentId = useId();
	const levelId = useId();
	const facetId = useId();
	const growId = useId();

	const patch = (p: Partial<Besoin>) => send({ type: "PATCH", patch: p });

	// Le PLACEMENT PROPOSÉ — pur, calculé au rendu (déterminisme-first : un score, pas un prompt).
	const placement =
		besoin.intent.trim() === "" ? null : placeIntent(tree, besoin.intent);
	// L'arbre rendu — projection pure de la relation composes vivante (toujours ok sur un arbre
	// poussé depuis le seed ; fail-closed sinon : on ne rend rien).
	const built = buildKernelTree(tree);
	// Le rôle dérivé du chemin choisi (lecture, jamais stocké) — null tant que rien n'est choisi.
	const selectedNode =
		besoin.scale === ""
			? null
			: (tree.find((n) => nodePath(tree, n.id).join("/") === besoin.scale) ??
				null);

	return (
		<div data-testid="v2-idee-wizard" className="space-y-6">
			{/* le stepper — états VISIBLES (XState) */}
			<ol
				data-testid="v2-idee-stepper"
				data-state={step}
				className="flex flex-wrap gap-2 text-xs"
			>
				{WIZARD_STEPS.map((s) => (
					<li
						key={s}
						data-active={s === step}
						className={
							s === step
								? "rounded-full border border-primary bg-primary/10 px-3 py-1 font-medium text-primary"
								: "rounded-full border border-border bg-muted px-3 py-1 text-muted-foreground"
						}
					>
						{t[STATE_LABELS[s]]}
					</li>
				))}
			</ol>

			<p
				data-testid="v2-idee-state"
				className="font-mono text-xs text-muted-foreground"
			>
				{t.stateLabel} : {step}
			</p>

			<div className="rounded-xl border border-border bg-card p-6">
				{step === "intention" && (
					<div className="space-y-3">
						<label
							htmlFor={intentId}
							className="block text-sm font-medium text-foreground"
						>
							{t.intentLabel}
						</label>
						<textarea
							id={intentId}
							data-testid="v2-idee-intent"
							value={besoin.intent}
							onChange={(e) => patch({ intent: e.target.value })}
							placeholder={t.intentPlaceholder}
							className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
						/>
						<p className="text-xs text-muted-foreground">{t.intentHint}</p>
					</div>
				)}

				{step === "coordonnee" && (
					<div className="space-y-4">
						<div className="space-y-2">
							<label
								htmlFor={levelId}
								className="block text-sm font-medium text-foreground"
							>
								{t.levelLabel}
							</label>
							<select
								id={levelId}
								data-testid="v2-idee-level"
								value={besoin.level}
								onChange={(e) => patch({ level: e.target.value })}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
							>
								<option value="">—</option>
								{selectableLevels().map((l) => (
									<option key={l} value={l}>
										{l}
									</option>
								))}
							</select>
						</div>
						<div className="space-y-2">
							<label
								htmlFor={facetId}
								className="block text-sm font-medium text-foreground"
							>
								{t.facetLabel}
							</label>
							<select
								id={facetId}
								data-testid="v2-idee-facet"
								value={besoin.facet}
								onChange={(e) => patch({ facet: e.target.value })}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
							>
								<option value="">—</option>
								{FACET_LETTERS.map((f) => (
									<option key={f} value={f}>
										{f}
									</option>
								))}
							</select>
						</div>

						{/* l'ÉCHELLE VIVANTE (ADR 0055) — une position dans l'arbre composes */}
						<div className="space-y-3 rounded-lg border border-border bg-background p-4">
							<span className="block text-sm font-medium text-foreground">
								{t.scaleLabel}
							</span>
							<p className="text-xs text-muted-foreground">{t.scaleHelp}</p>

							{/* a. le placement PROPOSÉ par le système (placeIntent — l'humain surcharge) */}
							{placement !== null && (
								<div
									data-testid="v2-idee-placement"
									className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
								>
									<span className="text-muted-foreground">
										{t.placementLabel}
									</span>
									<span className="font-mono text-foreground">
										{placement.path}
									</span>
									<RoleBadge role={placement.role} t={t} />
									<button
										type="button"
										data-testid="v2-idee-placement-use"
										onClick={() =>
											send({ type: "SET_SCALE", path: placement.path })
										}
										className="rounded-md border border-primary bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
									>
										{t.placementUse}
									</button>
								</div>
							)}

							{/* b. le PICKER — l'arbre composes, chaque nœud est sélectionnable */}
							<div data-testid="v2-idee-scale-picker" className="space-y-1">
								<p className="text-xs font-medium text-muted-foreground">
									{t.pickerLabel}
								</p>
								{built.ok && (
									<ScaleTreeNodes
										nodes={built.roots}
										tree={tree}
										selectedPath={besoin.scale}
										onSelect={(path) => send({ type: "SET_SCALE", path })}
										t={t}
									/>
								)}
							</div>

							{/* c. GREFFER — l'humain pose les frontières (§49) : l'arbre pousse */}
							<div className="flex flex-wrap items-center gap-2">
								<label htmlFor={growId} className="sr-only">
									{t.growPlaceholder}
								</label>
								<input
									id={growId}
									data-testid="v2-idee-grow-label"
									value={growLabel}
									onChange={(e) => setGrowLabel(e.target.value)}
									placeholder={t.growPlaceholder}
									className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
								/>
								<button
									type="button"
									data-testid="v2-idee-grow"
									disabled={besoin.scale === ""}
									onClick={() => {
										send({
											type: "GROW_SCALE",
											parentPath: besoin.scale,
											label: growLabel,
										});
										setGrowLabel("");
									}}
									className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
								>
									{t.grow}
								</button>
							</div>

							{/* d. l'échelle CHOISIE : le chemin + son rôle dérivé (lecture, jamais stocké) */}
							<div className="flex flex-wrap items-center gap-2 text-sm">
								<span className="text-muted-foreground">
									{t.scalePathLabel}
								</span>
								<span
									data-testid="v2-idee-scale-path"
									className="font-mono text-foreground"
								>
									{besoin.scale === "" ? "—" : besoin.scale}
								</span>
								{selectedNode !== null && (
									<span data-testid="v2-idee-scale-role">
										<RoleBadge role={roleOf(tree, selectedNode.id)} t={t} />
									</span>
								)}
							</div>
						</div>
					</div>
				)}

				{step === "provenance" && (
					<fieldset className="space-y-3">
						<legend className="text-sm font-medium text-foreground">
							{t.provenanceLabel}
						</legend>
						{PROVENANCES.map((p) => (
							<label
								key={p}
								data-testid={`v2-idee-provenance-${p}`}
								className="flex items-center gap-2 text-sm text-foreground"
							>
								<input
									type="radio"
									name="provenance"
									value={p}
									checked={besoin.provenance === p}
									onChange={() => patch({ provenance: p })}
								/>
								{t[PROVENANCE_KEYS[p]] ?? p}
							</label>
						))}
					</fieldset>
				)}

				{step === "revue" && (
					<dl
						data-testid="v2-idee-review"
						className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"
					>
						<div>
							<dt className="text-muted-foreground">{t.reviewHeading}</dt>
							<dd className="text-foreground">{besoin.intent}</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t.coordinateHeading}</dt>
							{/* l'échelle dans la coordonnée = le CHEMIN (la position §49) */}
							<dd className="font-mono text-foreground">
								{besoin.level} × {besoin.facet} × {besoin.scale}
							</dd>
						</div>
						<div>
							<dt className="text-muted-foreground">{t.provenanceLabel}</dt>
							<dd className="text-foreground">
								{t[PROVENANCE_KEYS[besoin.provenance]] ?? besoin.provenance}
							</dd>
						</div>
						{errors.length > 0 && (
							<ul
								data-testid="v2-idee-errors"
								className="col-span-full space-y-1 text-destructive"
							>
								{errors.map((e) => (
									<li key={e}>{t[ERROR_KEYS[e as BesoinError]] ?? e}</li>
								))}
							</ul>
						)}
					</dl>
				)}

				{step === "proposee" && idea && (
					<div
						data-testid="v2-idee-proposed"
						className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4"
					>
						<h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
							{t.proposedHeading}
						</h3>
						<p
							data-testid="v2-idee-proposed-intent"
							className="text-foreground"
						>
							{idea.intent}
						</p>
						<dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
							<div>
								<dt className="text-muted-foreground">{t.ideaId}</dt>
								<dd
									data-testid="v2-idee-hash"
									className="font-mono text-foreground"
								>
									{idea.id}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t.coordinateHeading}</dt>
								<dd className="font-mono text-foreground">
									{idea.coordinate.level} × {idea.coordinate.facet} ×{" "}
									{idea.coordinate.scale}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t.mirrorFormHeading}</dt>
								<dd
									data-testid="v2-idee-mirror-form"
									className="font-mono text-foreground"
								>
									{idea.expectedMirrorForm ?? "—"}
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t.hasMirrorLabel}</dt>
								<dd
									data-testid="v2-idee-has-mirror"
									className="text-foreground"
								>
									{String(idea.hasMirror)} ({t.no})
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">{t.wroteKernelLabel}</dt>
								<dd
									data-testid="v2-idee-wrote-kernel"
									className="text-foreground"
								>
									{String(idea.wroteKernel)} ({t.no})
								</dd>
							</div>
						</dl>
						<p className="text-xs text-muted-foreground">{t.proposedNote}</p>
					</div>
				)}
			</div>

			{/* les commandes de navigation — transitions XState bound à des contrôles */}
			<div className="flex flex-wrap gap-3">
				{step !== "intention" && step !== "proposee" && (
					<button
						type="button"
						data-testid="v2-idee-back"
						onClick={() => send({ type: "PRECEDENT" })}
						className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
					>
						{t.back}
					</button>
				)}
				{(step === "intention" ||
					step === "coordonnee" ||
					step === "provenance") && (
					<button
						type="button"
						data-testid="v2-idee-next"
						onClick={() => send({ type: "SUIVANT" })}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t.next}
					</button>
				)}
				{step === "revue" && (
					<button
						type="button"
						data-testid="v2-idee-propose"
						onClick={() => send({ type: "PROPOSER" })}
						className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
					>
						{t.propose}
					</button>
				)}
				{step === "proposee" && (
					<button
						type="button"
						data-testid="v2-idee-restart"
						onClick={() => send({ type: "RECOMMENCER" })}
						className="rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted"
					>
						{t.restart}
					</button>
				)}
			</div>
		</div>
	);
}
