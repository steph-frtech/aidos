"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
	cull,
	type FixedMirror,
	nicheKey,
	niches,
	promote,
	type Variant,
} from "@/lib/project-evolve";

/**
 * ProjectEvolvePanel makes the /project-evolve route action-capable (ui-completeness law,
 * CLAUDE.md §7): S108 has controls bound to the REAL per-project medium loop (the pure
 * twin lib/project-evolve), each executable from the screen —
 *
 *   - RUN THE LOOP over a FIXED user mirror: the cull kills the mirror-breaker (rendered
 *     in the « tuées » list), the Pareto élites survive in project-scoped niches.
 *   - BREAK-MIRROR toggle: flips a variant's mirror to red → it is KILLED, never an élite,
 *     WHATEVER its (higher) fitness — the anti-Goodhart anchor, made visible.
 *   - GRANT-AUTHORITY toggle + PROMOTE: a green élite is promotable ONLY with authority
 *     approval; the result is a PROPOSAL (writes no truth — the freeze is the human /goal).
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): the controls run the PURE twin, never an LLM — same
 * input → identical result. THE WALL (§2): the sandbox WRITES NOTHING — promotion is a
 * PROPOSAL (writesTruth=false). Themed on ADR 0010 tokens; strings via next-intl (0011).
 */

const MIRROR: FixedMirror = {
	projectId: "shop",
	mirrorId: "m-createOrder",
	behavior: "createOrder",
};

// The fixed candidate set the loop searches over (a stable demo seed). v-broken carries
// the HIGHER fitness, so the panel proves the score never overrides the mirror.
const BASE: Variant[] = [
	{
		projectId: "shop",
		id: "v-fast",
		niche: "createOrder/fast",
		mirror: "green",
		outOfSample: "green",
		fitness: 0.9,
	},
	{
		projectId: "shop",
		id: "v-broken",
		niche: "createOrder/fast",
		mirror: "green",
		outOfSample: "green",
		fitness: 0.99,
	},
	{
		projectId: "shop",
		id: "v-cheap",
		niche: "createOrder/cheap",
		mirror: "green",
		outOfSample: "green",
		fitness: 0.8,
	},
];

export function ProjectEvolvePanel() {
	const t = useTranslations("projectEvolve");
	const [breakMirror, setBreakMirror] = useState(false);
	const [grantAuthority, setGrantAuthority] = useState(false);
	const [promoteResult, setPromoteResult] = useState<{
		id: string;
		verdict: string;
		reason?: string;
		writesTruth: boolean;
	} | null>(null);

	// The live candidate set: break-mirror flips v-broken to red (it should then be killed).
	const variants = useMemo<Variant[]>(
		() =>
			BASE.map((v) =>
				v.id === "v-broken" && breakMirror ? { ...v, mirror: "red" } : v,
			),
		[breakMirror],
	);

	const culled = useMemo(() => cull(MIRROR, variants), [variants]);
	const elites = useMemo(() => niches(MIRROR, variants), [variants]);

	const onPromote = (v: Variant) => {
		const res = promote(MIRROR, v, grantAuthority);
		setPromoteResult({
			id: v.id,
			verdict: res.verdict,
			reason: res.reason,
			writesTruth: res.writesTruth,
		});
	};

	return (
		<div className="space-y-10">
			{/* ── The fixed mirror (the anchor) ── */}
			<section className="space-y-2 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("mirrorHeading")}
				</h2>
				<dl className="grid grid-cols-3 gap-x-6 text-sm">
					<div>
						<dt className="text-xs uppercase text-muted-foreground">
							{t("projectLabel")}
						</dt>
						<dd
							data-testid="fixed-project"
							className="font-mono text-foreground"
						>
							{MIRROR.projectId}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase text-muted-foreground">
							{t("mirrorLabel")}
						</dt>
						<dd
							data-testid="fixed-mirror"
							className="font-mono text-foreground"
						>
							{MIRROR.mirrorId}
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase text-muted-foreground">
							{t("behaviorLabel")}
						</dt>
						<dd className="font-mono text-foreground">{MIRROR.behavior}</dd>
					</div>
				</dl>
			</section>

			{/* ── The controls ── */}
			<section className="space-y-4 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("controlsHeading")}
				</h2>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						data-testid="break-mirror-toggle"
						checked={breakMirror}
						onChange={(e) => setBreakMirror(e.target.checked)}
						className="h-4 w-4 rounded border-border"
					/>
					{t("breakMirrorLabel")}
				</label>
				<label className="flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						data-testid="grant-authority-toggle"
						checked={grantAuthority}
						onChange={(e) => setGrantAuthority(e.target.checked)}
						className="h-4 w-4 rounded border-border"
					/>
					{t("grantAuthorityLabel")}
				</label>
			</section>

			{/* ── The Pareto niches (the surviving élites) ── */}
			<section className="space-y-3 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("nichesHeading")}
				</h2>
				<ul data-testid="niches-list" className="space-y-2">
					{[...elites.entries()]
						.sort(([a], [b]) => a.localeCompare(b))
						.map(([key, v]) => (
							<li
								key={key}
								data-testid={`niche-${v.id}`}
								className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 text-sm"
							>
								<span className="flex items-center gap-3">
									<span className="font-mono text-foreground">{key}</span>
									<span className="font-mono text-xs text-muted-foreground">
										{v.id} · fit {v.fitness.toFixed(2)}
									</span>
								</span>
								<button
									type="button"
									data-testid={`promote-${v.id}`}
									onClick={() => onPromote(v)}
									className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
								>
									{t("promote")}
								</button>
							</li>
						))}
				</ul>
			</section>

			{/* ── The killed (mirror-breakers) ── */}
			<section className="space-y-2 rounded-xl border border-border bg-card p-5">
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{t("killedHeading")}
				</h2>
				<p className="text-xs text-muted-foreground">{t("killedNote")}</p>
				<ul data-testid="killed-list" className="flex flex-wrap gap-2 text-xs">
					{culled.killed.length === 0 ? (
						<li className="text-muted-foreground">{t("noneKilled")}</li>
					) : (
						culled.killed.map((id) => (
							<li
								key={id}
								data-testid={`killed-${id}`}
								className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 font-mono text-destructive"
							>
								{id}
							</li>
						))
					)}
				</ul>
			</section>

			{/* ── The promotion verdict ── */}
			{promoteResult ? (
				<section
					data-testid="promote-result"
					className="space-y-2 rounded-xl border border-border bg-card p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("promoteHeading")}
					</h2>
					<div className="flex items-center gap-3">
						<span
							data-testid="promote-verdict"
							className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs ${
								promoteResult.verdict === "proposed"
									? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
									: "bg-destructive/10 text-destructive"
							}`}
						>
							{promoteResult.verdict}
						</span>
						<span
							data-testid="promote-wall"
							className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 font-mono text-xs text-muted-foreground"
						>
							{promoteResult.writesTruth ? t("wroteTruth") : t("noTruthWrite")}
						</span>
					</div>
					{promoteResult.reason ? (
						<p className="text-sm text-muted-foreground">
							{promoteResult.reason}
						</p>
					) : null}
				</section>
			) : null}
		</div>
	);
}
