import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { activeProjectContext } from "@/lib/activeProjectServer";
import {
	composeEnvRefs,
	emitEnvBundle,
	envKeys,
	isClean,
} from "@/lib/env-emit";
import { emitCompose } from "@/lib/stack-emit";
import { exampleManifest } from "@/lib/stack-manifest";
import { StackEmitPanel } from "./StackEmitPanel";

export const metadata: Metadata = {
	title: "Émetteur docker-compose (DP03) — AIDOS Workbench",
	description:
		"DP03 : le Target additif docker-compose — Emit(stack_manifest) projette un docker-compose.yml byte-identique aux conventions /data/dockers (container_name $APP_NAME, env_file .env, labels Traefik HTTPS + redirect, volumes bind $APP_DATA_PATH, traefik_default externe, restart unless-stopped, healthchecks), double content-adressé (source_hash + output_hash), below-the-line (back/gen/<app>/). Un fichier hand-edité est rejeté par drift.",
};

export const dynamic = "force-dynamic";

/**
 * /stack-emit — « l'émetteur docker-compose » (DP03, roadmap
 * provisioning-deploy EPIC A). The page EMITS the seeded Example manifest
 * through the pure emitter and renders the compose bytes + the double
 * content address. The one control (« émettre le compose ») re-runs the
 * emitter over the editable JSON — proving the closed-set refusals and the
 * byte-identical reproducibility from the screen. It writes NOTHING.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8, ADR 0036): the TS twin
 * (lib/stack-emit) is byte-parity-pinned to the authoritative Go emitter
 * (back/runtime/composeemit) by the vitest mirror. ADR 0043: the primary
 * IaC artifact is the Pulumi/TS program; this compose is its
 * /data/dockers-convention projection. THE WALL (§2): the emitter is
 * SELECT-only on kernel; the projection lands below the line.
 * Themed on ADR 0010 tokens; strings via next-intl (ADR 0011, FR first).
 */
export default async function StackEmitPage() {
	const ctx = await activeProjectContext();
	const t = await getTranslations("stackEmit");
	const manifest = exampleManifest();
	const seeded = await emitCompose(manifest);
	if ("refusal" in seeded) {
		// The pinned Example is always valid; a refusal here is a programming
		// bug surfaced loudly (never silently swallowed).
		throw new Error(`seeded manifest refused: ${seeded.refusal.code}`);
	}
	// DP04 — the SAME manifest seeds the .env.example + scripts emission (the
	// engraved merge order, secret references only). Scan + coherence are
	// COMPUTED deterministically server-side (code, never an LLM).
	const seededEnv = await emitEnvBundle(manifest);
	if ("refusal" in seededEnv) {
		throw new Error(`seeded env bundle refused: ${seededEnv.refusal.code}`);
	}
	const seededKeys = new Set(envKeys(seededEnv.envExample.text));
	const seededEnvClean = isClean(seededEnv.envExample.text);
	const seededCoherent = composeEnvRefs(seeded.yaml).every((ref) =>
		seededKeys.has(ref),
	);

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
							{t("subtitle")}
						</span>
					</div>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<section
					aria-label={t("tutorialHeading")}
					data-testid="tutorial"
					className="mt-10 space-y-2 rounded-xl border border-border bg-muted/40 p-5"
				>
					<h2 className="text-sm font-semibold tracking-tight text-foreground">
						{t("tutorialHeading")}
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{t("tutorialBody")}
					</p>
				</section>

				<div className="mt-10">
					<StackEmitPanel
						activeProjectId={ctx.activeId}
						manifest={manifest}
						seeded={seeded}
						seededEnv={seededEnv}
						seededEnvClean={seededEnvClean}
						seededCoherent={seededCoherent}
					/>
				</div>
			</main>
		</div>
	);
}
