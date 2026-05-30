"use client";

import { useState } from "react";
import type { StoreSnapshot } from "@/lib/store-data";

function shortHash(h: string): string {
	return h.slice(0, 12);
}

/**
 * StorePanel renders the read-only Archive content store: a left list of objects
 * by hash and a right detail showing the selected head's current body + history.
 * It never writes truth; it projects a StoreSnapshot resolved on the server.
 */
export function StorePanel({ snapshot }: { snapshot: StoreSnapshot }) {
	const firstHead = snapshot.heads[0]?.key ?? null;
	const [selectedHead, setSelectedHead] = useState<string | null>(firstHead);

	const bodyByHash = new Map(snapshot.objects.map((o) => [o.hash, o.body]));
	const headByKey = new Map(snapshot.heads.map((h) => [h.key, h.hash]));

	const currentHash = selectedHead
		? (headByKey.get(selectedHead) ?? null)
		: null;
	const currentBody = currentHash ? (bodyByHash.get(currentHash) ?? "") : "";
	const moves = selectedHead ? (snapshot.history[selectedHead] ?? []) : [];

	return (
		<div className="grid gap-6 lg:grid-cols-2">
			{/* Left: object list by hash */}
			<section aria-label="Stored objects">
				<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
					Objects ({snapshot.objects.length})
				</h2>
				<ul className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
					{snapshot.objects.map((obj) => {
						const headKey = snapshot.heads.find(
							(h) => h.hash === obj.hash,
						)?.key;
						return (
							<li
								key={obj.hash}
								data-testid={`object-${obj.hash}`}
								className="flex items-center justify-between px-4 py-3"
							>
								<code
									data-testid={`object-hash-${shortHash(obj.hash)}`}
									className="font-mono text-xs text-zinc-700 dark:text-zinc-300"
								>
									{shortHash(obj.hash)}…
								</code>
								<span className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
									<span className="tabular-nums">{obj.byteSize} B</span>
									{headKey && (
										<span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
											head: {headKey}
										</span>
									)}
								</span>
							</li>
						);
					})}
				</ul>
			</section>

			{/* Right: selected head body + history */}
			<section aria-label="Head detail">
				<h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
					Heads ({snapshot.heads.length})
				</h2>
				<div className="mb-4 flex flex-wrap gap-2">
					{snapshot.heads.map((h) => (
						<button
							key={h.key}
							type="button"
							data-testid={`head-${h.key}`}
							onClick={() => setSelectedHead(h.key)}
							className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
								selectedHead === h.key
									? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-200"
									: "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
							}`}
						>
							{h.key}
						</button>
					))}
				</div>

				{selectedHead && (
					<div className="space-y-4">
						<div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
							<div className="mb-2 text-xs text-zinc-500 dark:text-zinc-500">
								Current body of head{" "}
								<code className="font-mono">{selectedHead}</code> (hash{" "}
								<code data-testid="current-hash" className="font-mono">
									{currentHash ? shortHash(currentHash) : "—"}
								</code>
								)
							</div>
							<pre
								data-testid="current-body"
								className="overflow-x-auto rounded bg-zinc-100 p-3 font-mono text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
							>
								{currentBody}
							</pre>
						</div>

						<div>
							<h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
								History — oldest first
							</h3>
							<ol
								data-testid="history-list"
								className="space-y-2 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
							>
								{moves.map((m, idx) => (
									<li
										key={`${m.parentHash ?? "root"}->${m.hash}`}
										data-testid={`history-move-${idx}`}
										className="flex items-center justify-between bg-white px-4 py-2 text-xs dark:bg-zinc-900"
									>
										<span className="tabular-nums text-zinc-400">
											#{idx + 1}
										</span>
										<code
											data-testid={`history-hash-${idx}`}
											className="font-mono text-zinc-700 dark:text-zinc-300"
										>
											{shortHash(m.hash)}…
										</code>
										<span className="text-zinc-500 dark:text-zinc-500">
											parent:{" "}
											<code className="font-mono">
												{m.parentHash ? shortHash(m.parentHash) : "∅"}
											</code>
										</span>
									</li>
								))}
							</ol>
						</div>
					</div>
				)}
			</section>
		</div>
	);
}
