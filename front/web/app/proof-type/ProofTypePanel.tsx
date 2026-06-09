"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FACET_NAME, FACETS, type FacetLetter } from "@/lib/grid";
import { N_LEVELS, N_NAME } from "@/lib/prooftype";
import { type ELevelView, type TagView, tagAction } from "./actions";

/**
 * ProofTypePanel makes the /proof-type route action-capable (ui-completeness law, CLAUDE.md §7):
 * the FK05 N→E mapping + the additive E-typed contract has ONE control bound to it — TAG THE
 * KERNEL — reachable AND executable from the screen. Pick an N-level + the facets the kernel
 * instantiates + the formal flag, run the mapping, and the E-typed contract appears: the base
 * E from the N-slice, the E ADDED by the facets (E4 sécurité via S, E6 runtime/rollback via R/V),
 * and E7 (formel) only when the formal cap is set. The N is preserved verbatim.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the control runs the PURE twin lib/prooftype, never an
 * LLM — same input → same contract. THE WALL (§2): it WRITES NOTHING — it derives the contract,
 * the N is untouched, the schema is FK16's job. Themed on ADR 0010 tokens; strings via next-intl.
 */

const initial: TagView = {
	ok: false,
	fromN: [],
	fromFacets: [],
	required: [],
	added: [],
};

// The facet → added-E hint, surfaced as a legend so the gating is legible.
const ADDED_HINT: Partial<Record<FacetLetter, string>> = {
	S: "E4",
	R: "E6",
	V: "E6",
	I: "E5",
	B: "E5",
	M: "E1",
};

function Submit() {
	const t = useTranslations("proofType");
	const { pending } = useFormStatus();
	return (
		<button
			type="submit"
			data-testid="tag-submit"
			disabled={pending}
			className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
		>
			{pending ? t("working") : t("tagCta")}
		</button>
	);
}

function ELevelChip({ e, added }: { e: ELevelView; added?: boolean }) {
	return (
		<li
			data-testid={`e-${e.level}`}
			data-added={added ? "true" : "false"}
			className={
				added
					? "inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 font-mono text-xs text-blue-700 dark:text-blue-300"
					: "inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 py-1 font-mono text-xs text-foreground"
			}
		>
			<span className="font-semibold">E{e.level}</span>
			<span className="text-muted-foreground">{e.name}</span>
		</li>
	);
}

export function ProofTypePanel({
	mapping,
}: {
	mapping: { n: string; nName: string; e: ELevelView[] }[];
}) {
	const t = useTranslations("proofType");
	const [state, action] = useActionState(tagAction, initial);

	return (
		<div className="space-y-8">
			{/* The closed N→E mapping table (read-only reference). */}
			<section data-testid="mapping" className="space-y-3">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("mappingHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("mappingHint")}</p>
				<ul className="space-y-2">
					{mapping.map((row) => (
						<li
							key={row.n}
							data-testid={`map-${row.n}`}
							className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs"
						>
							<span className="font-semibold text-primary">{row.n}</span>
							<span className="text-muted-foreground">{row.nName}</span>
							<span className="text-muted-foreground">→</span>
							{row.e.map((e) => (
								<span
									key={e.level}
									className="inline-flex items-center rounded-full bg-background px-2 py-0.5 ring-1 ring-border"
								>
									E{e.level}
								</span>
							))}
						</li>
					))}
				</ul>
			</section>

			{/* The action-capable control: tag a kernel → derive its E-typed contract. */}
			<form action={action} className="space-y-4">
				<div className="space-y-4 rounded-xl border border-border bg-card p-4">
					<label className="flex flex-col gap-1.5 text-sm">
						<span className="font-medium text-foreground">{t("nLabel")}</span>
						<select
							name="nLevel"
							data-testid="n-level"
							defaultValue="N4"
							className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{N_LEVELS.map((n) => (
								<option key={n} value={n}>
									{n} — {N_NAME[n]}
								</option>
							))}
						</select>
					</label>

					<fieldset className="space-y-2">
						<legend className="text-sm font-medium text-foreground">
							{t("facetsLabel")}
						</legend>
						<p className="text-xs text-muted-foreground">{t("facetsHint")}</p>
						<div className="flex flex-wrap gap-3">
							{FACETS.map((f) => (
								<label
									key={f}
									data-testid={`facet-${f}`}
									className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
								>
									<input
										type="checkbox"
										name="facets"
										value={f}
										className="accent-[var(--primary)]"
									/>
									<span className="font-semibold text-primary">{f}</span>
									<span className="text-muted-foreground">{FACET_NAME[f]}</span>
									{ADDED_HINT[f] && (
										<span className="rounded bg-blue-500/10 px-1 font-mono text-[0.6rem] text-blue-600 dark:text-blue-400">
											+{ADDED_HINT[f]}
										</span>
									)}
								</label>
							))}
						</div>
					</fieldset>

					<label
						data-testid="formal-toggle"
						className="inline-flex items-center gap-2 text-sm"
					>
						<input
							type="checkbox"
							name="requiresFormal"
							className="accent-[var(--primary)]"
						/>
						<span className="font-medium text-foreground">
							{t("formalLabel")}
						</span>
						<span className="rounded bg-blue-500/10 px-1 font-mono text-[0.6rem] text-blue-600 dark:text-blue-400">
							+E7
						</span>
					</label>

					<Submit />
				</div>
				<p className="text-xs text-muted-foreground">{t("tagNote")}</p>
			</form>

			{state.error && (
				<p data-testid="tag-error" className="text-sm text-destructive">
					{state.error}
				</p>
			)}

			{state.ok && (
				<section
					data-testid="contract"
					className="space-y-5 rounded-xl border border-border bg-card p-4"
				>
					{/* The double-label: the PRESERVED N alongside the DERIVED E. */}
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="text-sm font-semibold tracking-tight text-foreground">
							{t("contractHeading")}
						</h2>
						<span
							data-testid="preserved-n"
							data-n={state.n}
							className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 font-mono text-sm font-semibold text-foreground"
						>
							{state.n}
							<span className="font-normal text-muted-foreground">
								{state.nName}
							</span>
						</span>
						<span className="text-xs text-muted-foreground">
							{t("preservedNote")}
						</span>
					</div>

					{/* The base E from the N-slice. */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("fromNHeading")}
						</h3>
						<ul data-testid="from-n" className="flex flex-wrap gap-2">
							{state.fromN.map((e) => (
								<ELevelChip key={e.level} e={e} />
							))}
						</ul>
					</div>

					{/* The E ADDED by the facets (FK05's added types E4/E6/E5/E1). */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("fromFacetsHeading")}
						</h3>
						{state.fromFacets.length === 0 ? (
							<p
								data-testid="from-facets-empty"
								className="text-sm text-muted-foreground"
							>
								{t("fromFacetsEmpty")}
							</p>
						) : (
							<ul data-testid="from-facets" className="flex flex-wrap gap-2">
								{state.fromFacets.map((e) => (
									<ELevelChip key={e.level} e={e} added />
								))}
							</ul>
						)}
					</div>

					{/* The full required contract (the union — the E-typed evidence the kernel displays). */}
					<div className="space-y-2">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
							{t("requiredHeading")}
						</h3>
						<ul data-testid="required" className="flex flex-wrap gap-2">
							{state.required.map((e) => (
								<ELevelChip
									key={e.level}
									e={e}
									added={state.added.some((a) => a.level === e.level)}
								/>
							))}
						</ul>
						<p className="text-xs text-muted-foreground">{t("requiredNote")}</p>
					</div>
				</section>
			)}
		</div>
	);
}
