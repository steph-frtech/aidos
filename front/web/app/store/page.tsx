import type { Metadata } from "next";
import { snapshot } from "@/lib/store-data";
import { StorePanel } from "./StorePanel";

export const metadata: Metadata = {
	title: "Content Store — AIDOS Workbench",
	description:
		"Read-only view of the Archive content-addressed append-only store: objects by hash, head pointer, and head history.",
};

/**
 * /store — the Archive content-store panel. Read-only: lists stored objects by
 * content hash on the left and the selected head's current body + move history on
 * the right. Data is resolved on the server from the store projection (mirroring
 * the `store` MCP server) and never writes truth. Touches no existing route.
 */
export default function StorePage() {
	const snap = snapshot();

	return (
		<div className="min-h-screen bg-zinc-50 px-4 py-12 sm:px-8 dark:bg-zinc-950">
			<div className="mx-auto max-w-5xl space-y-8">
				<header className="space-y-2">
					<h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
						Content Store
					</h1>
					<p className="max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
						Content-addressed, append-only. Objects are stored by SHA-256 hash;
						editing produces a new hash while the old one stays readable. The
						head is a mutable pointer; its moves are an append-only history.
					</p>
				</header>

				<StorePanel snapshot={snap} />

				<footer className="border-t border-zinc-200 pt-4 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-600">
					Source: Archive content store via the <code>store</code> MCP server —
					read-only projection. Writes flow through the MCP capability door,
					never this panel.
				</footer>
			</div>
		</div>
	);
}
