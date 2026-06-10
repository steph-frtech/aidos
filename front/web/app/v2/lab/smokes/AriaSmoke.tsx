"use client";

import { useState } from "react";
import { Button } from "react-aria-components";

/**
 * WB2-01 sonde react-aria-components — un bouton accessible qui monte client-only.
 * Prouve que la lib de primitives accessibles (contrôles V2) monte + réagit + build OK.
 */
export default function AriaSmoke() {
	const [count, setCount] = useState(0);
	return (
		<div data-testid="v2-smoke-aria" className="space-y-2 text-sm">
			<Button
				data-testid="v2-smoke-aria-btn"
				onPress={() => setCount((c) => c + 1)}
				className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground transition-colors hover:bg-primary/5 hover:text-primary"
			>
				Cliquer
			</Button>
			<p data-testid="v2-smoke-aria-count" className="text-muted-foreground">
				clics : {count}
			</p>
		</div>
	);
}
