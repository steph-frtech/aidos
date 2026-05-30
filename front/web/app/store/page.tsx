import type { Metadata } from "next";
import { snapshot } from "@/lib/store-data";
import { StorePanel } from "./StorePanel";

export const metadata: Metadata = {
	title: "Content Store — AIDOS Workbench",
	description:
		"Read-only view of the Archive content-addressed append-only store: objects by hash, head pointer, and head history.",
};

// Read the live Postgres truth-store on every request rather than prerendering a
// snapshot at build time — so the panel reflects the current `archive` schema and
// never bakes the demo fixture into a static page.
export const dynamic = "force-dynamic";

/**
 * /store — the Archive content-store panel. Read-only: lists stored objects by
 * content hash on the left and the selected head's current body + move history on
 * the right. Data is resolved on the server from the store projection (mirroring
 * the `store` MCP server) and never writes truth. Touches no existing route.
 */
export default async function StorePage() {
	const snap = await snapshot();

	return (
		<div className="min-h-screen bg-zinc-50 px-4 py-12 sm:px-8 dark:bg-zinc-950">
			<div className="mx-auto max-w-5xl space-y-8">
				<header className="space-y-2">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
							Content Store
						</h1>
						<span
							className={
								snap.source === "live"
									? "rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300"
									: "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
							}
							title={
								snap.source === "live"
									? "Read live from the aidos Postgres (schema archive)"
									: "Postgres unreachable — showing the demo fixture"
							}
						>
							{snap.source === "live" ? "LIVE · Postgres" : "demo fixture"}
						</span>
					</div>
					<p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
						Content-addressed, append-only. Objects are stored by SHA-256 hash;
						editing produces a new hash while the old one stays readable. The
						head is a mutable pointer; its moves are an append-only history.
					</p>
				</header>

				<StorePanel snapshot={snap} />

				<footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
					Source: live <code>archive</code> schema in Postgres (read-only
					projection); falls back to a demo fixture if the base is unreachable.
					Writes flow through the <code>store</code> MCP server — never this panel.
				</footer>
			</div>
		</div>
	);
}
