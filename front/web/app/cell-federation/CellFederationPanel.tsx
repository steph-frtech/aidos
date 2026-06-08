"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { checkAccessAction, packAction, partitionAction } from "./actions";
import {
	ACCESS_INITIAL,
	type AccessView,
	PACK_INITIAL,
	PARTITION_INITIAL,
	type PackView,
	type PartitionView,
} from "./view";

/**
 * CellFederationPanel makes the /cell-federation route action-capable (ui-completeness,
 * CLAUDE.md §7): the S100 cell-federation plane has controls bound to the REAL pure twin
 * (lib/cell-federation), reachable AND executable from the screen.
 *
 * Action-capable surfaces (the done-criteria + §43):
 *  1. PARTITION — split the project Kernel into per-cell sub-Kernels + show which cells ship
 *     (fractal: a green cell ships even with a red sibling).
 *  2. CELL PACK — compile a cell's context frontier: its OWN Kernel + contracted neighbors'
 *     PUBLIC contracts only, neighbor internals EXCLUDED (done-criterion 1; "leaked" is always false).
 *  3. CHECK ACCESS — a cross-cell access without a honored contract is REFUSED
 *     CROSS_CELL_NO_CONTRACT (done-criterion 2); the refusal names the fix path.
 *
 * DETERMINISM-FIRST (§6/§8): the twin is PURE, never an LLM. THE WALL (§2/§9): /cell-federation
 * projects + checks; the Context-Map persists via a ChangeSet (S101). Themed (ADR 0010),
 * bilingual (ADR 0011).
 */

function Submit({ label, testid }: { label: string; testid: string }) {
	const t = useTranslations("cellFederation");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid={testid}
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : label}
		</button>
	);
}

function Chips({
	ids,
	tone,
}: {
	ids: string[];
	tone: "own" | "neighbor" | "excluded";
}) {
	const cls =
		tone === "own"
			? "border-primary/40 bg-primary/5 text-foreground"
			: tone === "neighbor"
				? "border-border bg-muted text-muted-foreground"
				: "border-destructive/30 bg-destructive/5 text-destructive";
	return (
		<div className="flex flex-wrap gap-2">
			{ids.map((id) => (
				<span
					key={id}
					className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs ${cls}`}
				>
					{id}
				</span>
			))}
		</div>
	);
}

export function CellFederationPanel({
	activeProjectId,
}: {
	activeProjectId: string | null;
}) {
	const t = useTranslations("cellFederation");
	const project = activeProjectId ?? "shop";

	const [partitionState, partitionFormAction] = useActionState<
		PartitionView,
		FormData
	>(partitionAction, PARTITION_INITIAL);
	const [packState, packFormAction] = useActionState<PackView, FormData>(
		packAction,
		PACK_INITIAL,
	);
	const [accessState, accessFormAction] = useActionState<AccessView, FormData>(
		checkAccessAction,
		ACCESS_INITIAL,
	);

	return (
		<div className="space-y-10">
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span>{t("activeProjectLabel")}:</span>
				<span
					data-testid="active-project"
					className="rounded-md bg-muted px-2 py-0.5 font-mono text-foreground"
				>
					{activeProjectId ?? t("noProject")}
				</span>
			</div>

			<section
				data-testid="scenario"
				className="space-y-2 rounded-xl border border-border bg-muted/40 p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("scenarioHeading")}
				</h2>
				<p className="text-sm leading-relaxed text-muted-foreground">
					{t("scenarioBody")}
				</p>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{t("openQuestion")}
				</p>
			</section>

			{/* 1 · Partition & ship */}
			<form
				action={partitionFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("partitionHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<Submit label={t("partitionLabel")} testid="partition-submit" />

				{partitionState.ok && partitionState.cells ? (
					<div data-testid="cells" className="space-y-3 pt-2">
						<h3 className="text-xs font-semibold text-muted-foreground uppercase">
							{t("cellsHeading")}
						</h3>
						<ul className="space-y-1">
							{partitionState.cells.map((c) => (
								<li
									key={c.ref}
									data-testid={`cell-${c.ref}`}
									data-ratchet={c.ratchet}
									className="flex items-center gap-3 text-sm"
								>
									<span className="font-mono text-foreground">{c.ref}</span>
									<span
										className={`rounded-md px-2 py-0.5 text-xs ${
											c.ratchet === "green"
												? "bg-primary/10 text-primary"
												: "bg-destructive/10 text-destructive"
										}`}
									>
										{t("ratchetLabel")}: {c.ratchet}
									</span>
									<span className="text-xs text-muted-foreground">
										{t("shipsLabel")}: {c.ratchet === "green" ? "✓" : "✗"}
									</span>
								</li>
							))}
						</ul>
						<div
							data-testid="shippable"
							className="pt-1 text-xs text-muted-foreground"
						>
							{t("shippableHeading")}:{" "}
							<span className="font-mono text-foreground">
								{(partitionState.shippable ?? []).join(", ")}
							</span>
						</div>
					</div>
				) : null}
				{partitionState.error ? (
					<p data-testid="partition-error" className="text-sm text-destructive">
						{partitionState.error}
					</p>
				) : null}
			</form>

			{/* 2 · Cell pack */}
			<form
				action={packFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("packHeading")}
				</h2>
				<input type="hidden" name="projectId" value={project} />
				<label className="block space-y-1 text-sm">
					<span className="text-muted-foreground">{t("targetLabel")}</span>
					<select
						name="target"
						data-testid="pack-target"
						defaultValue="checkout"
						className="block w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="checkout">checkout</option>
						<option value="billing">billing</option>
						<option value="catalog">catalog</option>
					</select>
				</label>
				<Submit label={t("packLabel")} testid="pack-submit" />

				{packState.ok && packState.pack ? (
					<div
						data-testid="pack"
						data-leaked={String(packState.leaked)}
						className="space-y-4 pt-2"
					>
						<div className="space-y-2">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase">
								{t("ownKernelLabel")}
							</h3>
							<Chips
								ids={[
									...packState.pack.ownLayers,
									...packState.pack.ownMirrors,
									...packState.pack.ownContracts,
								]}
								tone="own"
							/>
						</div>
						<div className="space-y-2">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase">
								{t("neighborContractsLabel")}
							</h3>
							<div data-testid="neighbor-contracts">
								<Chips ids={packState.pack.neighborContracts} tone="neighbor" />
							</div>
						</div>
						<div className="space-y-2">
							<h3 className="text-xs font-semibold text-muted-foreground uppercase">
								{t("excludedLabel")}
							</h3>
							<div data-testid="excluded" className="flex flex-wrap gap-2">
								{packState.pack.excluded.map((e) => (
									<span
										key={e.id}
										data-reason={e.reason}
										className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-0.5 font-mono text-xs text-destructive"
									>
										{e.id} · {e.reason}
									</span>
								))}
							</div>
						</div>
						<p data-testid="no-leak" className="text-xs text-primary">
							{packState.leaked ? "LEAK!" : t("noNeighborInternalLabel")}
						</p>
					</div>
				) : null}
			</form>

			{/* 3 · Check cross-cell access */}
			<form
				action={accessFormAction}
				className="space-y-4 rounded-xl border border-border p-5"
			>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("accessHeading")}
				</h2>
				<div className="flex flex-wrap gap-4">
					<label className="block space-y-1 text-sm">
						<span className="text-muted-foreground">{t("fromLabel")}</span>
						<select
							name="from"
							data-testid="access-from"
							defaultValue="checkout"
							className="block rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="checkout">checkout</option>
							<option value="billing">billing</option>
							<option value="catalog">catalog</option>
						</select>
					</label>
					<label className="block space-y-1 text-sm">
						<span className="text-muted-foreground">{t("toLabel")}</span>
						<select
							name="to"
							data-testid="access-to"
							defaultValue="catalog"
							className="block rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<option value="checkout">checkout</option>
							<option value="billing">billing</option>
							<option value="catalog">catalog</option>
						</select>
					</label>
				</div>
				<Submit label={t("checkAccessLabel")} testid="access-submit" />

				{accessState.ok ? (
					accessState.allowed ? (
						<p data-testid="access-allowed" className="text-sm text-primary">
							{t("accessAllowed")}
						</p>
					) : (
						<section
							data-testid="access-refused"
							data-code={accessState.block?.code}
							className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-5"
						>
							<h3 className="text-sm font-semibold text-destructive">
								{t("accessRefused")} · {accessState.block?.code}
							</h3>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{accessState.block?.message}
							</p>
							<div className="pt-1">
								<h4 className="text-xs font-semibold text-muted-foreground uppercase">
									{t("howToFixLabel")}
								</h4>
								<ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
									{(accessState.block?.howToFix ?? []).map((h) => (
										<li key={h}>{h}</li>
									))}
								</ul>
							</div>
						</section>
					)
				) : null}
			</form>
		</div>
	);
}
