import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
// Determinism-first: the guarded zones + the sample BlockReason are a static,
// declared registry in lib/wall.ts (mirroring back/hooks/pretooluse/wall.go),
// covered by lib/wall.test.ts. This Server Component only renders it — no I/O,
// no clock, no rng — so /wall shows exactly the boundary the Go hook enforces.
import {
	aboveZones,
	belowZones,
	SAMPLE_BLOCK_EVENT,
	type WallZone,
} from "@/lib/wall";
import { WallTeach } from "./WallTeach";

export const metadata: Metadata = {
	title: "Le mur — AIDOS Workbench",
	description:
		"Read-only panel of the wall: the waterline (kernel/mirrors/fitness above, projections below) and a feed of AGENT_WRITE_ABOVE_WATERLINE block events — defense in depth, no truth written from the screen.",
};

function ZoneCard({ zone }: { zone: WallZone }) {
	return (
		<article
			data-testid={`wall-zone-${zone.name.replace(/[^a-z0-9]+/gi, "-")}`}
			className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4"
		>
			<code className="w-fit rounded bg-muted px-2 py-1 font-mono text-sm font-semibold text-card-foreground">
				{zone.name}
			</code>
			<p className="text-xs leading-relaxed text-muted-foreground">
				{zone.role}
			</p>
		</article>
	);
}

/**
 * /wall — the wall panel (S04). Visualizes the single permission boundary: the
 * waterline (above = kernel/mirrors/fitness, frozen truth; below = projections,
 * free), the guarded zones, and a feed of BlockReason block events.
 *
 * THE WALL (CLAUDE.md §2). This screen writes NO truth and exposes NO capability:
 * the wall is enforced by the PreToolUse Go hook (level 1) + the Postgres GRANTs
 * (level 2), never from a screen. Read-only is therefore correct — the
 * action-capable clause of ui-completeness is vacuously satisfied (no headless
 * capability is hidden; there is none). Themed on ADR 0010 tokens; bilingual via
 * next-intl (ADR 0011).
 */
export default async function WallPage() {
	const above = aboveZones();
	const below = belowZones();
	const t = await getTranslations("wall");
	const event = SAMPLE_BLOCK_EVENT;

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
							{t("title")}
						</h1>
						<span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("guardBadge")}
						</span>
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
							{t("readOnly")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<WallTeach />
				</div>

				{/* The waterline: above (frozen truth) / below (free projections) */}
				<section aria-label={t("waterlineHeading")} className="mt-10 space-y-6">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("waterlineHeading")}
					</h2>

					<div data-testid="waterline-above" className="space-y-3">
						<h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
							<span
								aria-hidden="true"
								className="inline-block size-2 rounded-full bg-destructive"
							/>
							{t("aboveHeading")}
						</h3>
						<div className="grid gap-3 sm:grid-cols-3">
							{above.map((z) => (
								<ZoneCard key={z.name} zone={z} />
							))}
						</div>
					</div>

					<div
						aria-hidden="true"
						className="relative flex items-center gap-3 py-1"
					>
						<span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
						<span className="rounded-full border border-border bg-muted px-2.5 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
							waterline
						</span>
						<span className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
					</div>

					<div data-testid="waterline-below" className="space-y-3">
						<h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
							<span
								aria-hidden="true"
								className="inline-block size-2 rounded-full bg-primary"
							/>
							{t("belowHeading")}
						</h3>
						<div className="grid gap-3 sm:grid-cols-3">
							{below.map((z) => (
								<ZoneCard key={z.name} zone={z} />
							))}
						</div>
					</div>
				</section>

				{/* Block-event feed: the actionable BlockReason the hook returns */}
				<section aria-label={t("eventsAria")} className="mt-12 space-y-4">
					<h2 className="text-lg font-semibold tracking-tight text-foreground">
						{t("eventsHeading")}
					</h2>
					<article
						data-testid="block-event"
						className="space-y-3 rounded-xl border border-border bg-card p-5"
					>
						<div className="flex flex-wrap items-center gap-2">
							<code
								data-testid="block-event-code"
								className="rounded bg-destructive/10 px-2 py-1 font-mono text-sm font-semibold text-destructive"
							>
								{event.code}
							</code>
							<span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
								{t("severityLabel")}: {event.severity}
							</span>
						</div>
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("explanationLabel")}
							</p>
							<p className="text-sm leading-relaxed text-card-foreground">
								{event.explanation}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-[0.7rem] font-medium uppercase tracking-wider text-muted-foreground">
								{t("howToFixLabel")}
							</p>
							<ol
								data-testid="block-event-howtofix"
								className="list-decimal space-y-1 pl-5 text-sm text-card-foreground"
							>
								{event.howToFix.map((step) => (
									<li key={step} className="leading-relaxed">
										{step}
									</li>
								))}
							</ol>
						</div>
					</article>
				</section>

				<footer className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
					{t.rich("footer", {
						code: (chunks) => (
							<code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-foreground">
								{chunks}
							</code>
						),
					})}
				</footer>
			</main>
		</div>
	);
}
