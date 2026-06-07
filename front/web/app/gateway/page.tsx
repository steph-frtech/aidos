import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { gatewaySurface } from "./actions";
import { GatewayPanel } from "./GatewayPanel";

export const metadata: Metadata = {
	title: "Passerelle MCP-over-HTTP — AIDOS Workbench",
	description:
		"S58 — la passerelle project-scopée qui expose CHAQUE outil MCP existant (store · mirror-runner · changeset · dag · idea-intake · memory · context · evolve · backtester · telemetry-reader · pact-verifier · mutation-runner · project) en JSON-RPC/HTTP, le mur appliqué côté serveur (below-the-line libre ; vérité via ChangeSet ; BlockReason au refus).",
};

export const dynamic = "force-dynamic";

/**
 * /gateway — the S58 panel (app-builder EPIC 2). It surfaces the MCP-over-HTTP
 * passerelle: the closed set of fronted MCP tools, and the server-side wall that routes
 * a below-the-line call, refuses a cross-project / forged-identity call
 * (AGENT_CROSS_PROJECT_WRITE), and refuses a direct truth-write
 * (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET). It is action-capable (ui-completeness): the
 * "route" control EXECUTES gateway.route (the same router the live HTTP server applies)
 * and renders the decision + BlockReason. It writes NO truth — the gateway routes or
 * refuses (CLAUDE.md §2). Touches no existing route. Themed (ADR 0010) + bilingual
 * (ADR 0011).
 */
export default async function GatewayPage() {
	const surface = await gatewaySurface();
	const t = await getTranslations("gateway");

	return (
		<div className="flex min-h-screen flex-col bg-background text-foreground">
			<WorkbenchHeader />

			<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-8 sm:py-16">
				<header className="space-y-4">
					<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{t("eyebrow")}
					</span>
					<h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
						{t("title")}
					</h1>
					<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
						{t("intro")}
					</p>
				</header>

				<div className="mt-10">
					<GatewayPanel surface={surface} />
				</div>

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
