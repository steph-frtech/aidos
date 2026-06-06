import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EmittedTargetPanel } from "@/components/EmittedTargetPanel";
import { WorkbenchHeader } from "@/components/WorkbenchHeader";
import { type EmittedTarget, emittedTargetEL00 } from "@/lib/emitted-target";

// /emitted-target — EL00 (ADR 0040). The Workbench panel that engraves the TARGET of the EMITTED
// app (Hono front+back + pure-functional TS + own MCP/Skills + Postgres-dialect datastore +
// Go-interpreter-service callback) and draws the constructrice≠construite frontier. EL00 is
// ADR-only: this screen READS a decision and lets the human RUN the deterministic parity check
// (the declared target ≡ the enforced arch-fitness.json config) from the screen — the SAME verdict
// the Go parity test computes. THE WALL (CLAUDE.md §2): writes no truth. Themed (ADR 0010),
// bilingual (ADR 0011, FR default).

export const metadata: Metadata = {
	title:
		"Cible de l'app émise — Hono + TypeScript fonctionnel | AIDOS Workbench",
	description:
		"EL00 / ADR 0040 : la cible de l'app ÉMISE par AIDOS — Hono (front+back), TypeScript pur-fonctionnel, ses propres MCP + Skills, datastore dialecte Postgres via client TS, Operation-DSL exécuté par callback vers un service-interpréteur Go. Frontière constructrice≠construite : AIDOS reste Go gouvernable (jamais réécrit en TS, n'émet jamais de Go pour l'app). EL00 est ADR-only, au-dessus du mur : aucune écriture de vérité. Le bouton « Vérifier la parité » rejoue le verdict pur (cible déclarée ≡ config enforce-cée).",
};

// The enforced config the Go FN04/S84 rule reads — the SAME arch-fitness.json, read at request
// time on the server (node:fs). The declared target is the pure TS twin. The panel compares them.
function enforcedTarget(): EmittedTarget {
	const raw = readFileSync(
		join(
			process.cwd(),
			"..",
			"..",
			"back",
			"runtime",
			"agentloop",
			"arch-fitness.json",
		),
		"utf8",
	);
	const cfg = JSON.parse(raw) as { emitted_target: EmittedTarget };
	const t = cfg.emitted_target as EmittedTarget & { $comment?: string };
	const { $comment, ...rest } = t;
	void $comment;
	return rest;
}

export default async function EmittedTargetPage() {
	const t = await getTranslations("emittedTarget");
	const declared = emittedTargetEL00();
	const enforced = enforcedTarget();

	return (
		<div className="min-h-screen bg-background">
			<WorkbenchHeader />
			<main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
				<header className="space-y-3">
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						{t("heading")}
					</h1>
					<p className="text-sm text-muted-foreground">{t("intro")}</p>
				</header>

				<EmittedTargetPanel
					declared={declared}
					enforced={enforced}
					labels={{
						declaredTitle: t("declaredTitle"),
						enforcedTitle: t("enforcedTitle"),
						verifyCta: t("verifyCta"),
						parityOk: t("parityOk"),
						parityFail: t("parityFail"),
						fieldCol: t("fieldCol"),
						declaredCol: t("declaredCol"),
						enforcedCol: t("enforcedCol"),
						constructrice: t("constructrice"),
						construite: t("construite"),
						frontier: t("frontier"),
						wall: t("wall"),
					}}
				/>
			</main>
		</div>
	);
}
