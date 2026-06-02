"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
	type Cart,
	exampleCart,
	KERNEL_ASTS,
	LOOP_STAGES,
	runSlice,
	SEED_IDEA,
	type SliceResult,
} from "@/lib/demo-checkout";

// DemoCheckoutPanel — the ACTION-CAPABLE /demo-checkout panel (S46, ui-completeness).
// It does not only DISPLAY the loop: it renders the live cart and the checkout button
// (the emitted projection's twin) and lets the user PLACE THE ORDER from the screen —
// clicking checkout dispatches createOrder (the bound op) and shows the placed order
// with its line items. The verdict is the TS twin (lib/demo-checkout), the SAME shape
// as the Go slice, so the screen agrees with the engine. Read-only over truth: the
// kernel write is the approved, completeness-gated ChangeSet on the back, never here.

export function DemoCheckoutPanel() {
	const t = useTranslations("demoCheckout");
	const cart: Cart = exampleCart();
	const [result, setResult] = useState<SliceResult | null>(null);

	const placed = result?.kind === "green" ? result.order : null;
	const submitting = false;
	// The control-spec EvalState twin (S11): visible_when = cart.items.length > 0,
	// enabled_when = form.valid && !submitting. The demo cart is valid and non-empty.
	const visible = cart.items.length > 0;
	const enabled = visible && !submitting;

	function checkout() {
		setResult(runSlice(cart));
	}

	return (
		<div className="space-y-8">
			{/* The loop pipeline — every stage maps an event to the tooth it composes. */}
			<section
				data-testid="loop-pipeline"
				className="rounded-lg border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("pipeline.heading")}
				</h2>
				<ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{LOOP_STAGES.map((stage, i) => (
						<li
							key={stage.event}
							data-testid={`stage-${stage.event}`}
							className="rounded-md border border-border bg-background p-3"
						>
							<span className="text-[0.65rem] font-mono text-muted-foreground">
								{i + 1}. {stage.krdRef}
							</span>
							<p className="mt-1 text-sm font-medium text-foreground">
								{stage.event}
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{stage.tooth}
							</p>
						</li>
					))}
				</ol>
			</section>

			{/* The seeded Idea + the kernel ASTs (content-addressed, read-only). */}
			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-lg border border-border bg-card p-4">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{t("idea.heading")}
					</h3>
					<p
						data-testid="seed-idea"
						className="mt-2 text-sm italic text-foreground"
					>
						“{SEED_IDEA}”
					</p>
				</div>
				<div className="rounded-lg border border-border bg-card p-4">
					<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{t("asts.heading")}
					</h3>
					<dl className="mt-2 space-y-1 text-xs font-mono text-foreground">
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">entity</dt>
							<dd>{KERNEL_ASTS.entity}</dd>
						</div>
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">operation</dt>
							<dd>{KERNEL_ASTS.operation}</dd>
						</div>
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">control</dt>
							<dd>{KERNEL_ASTS.control}</dd>
						</div>
						<div className="flex justify-between gap-2">
							<dt className="text-muted-foreground">action</dt>
							<dd>{KERNEL_ASTS.action}</dd>
						</div>
					</dl>
				</div>
			</section>

			{/* The LIVE cart + checkout button (the emitted projection twin) — action-capable. */}
			<section
				data-testid="cart-view"
				className="rounded-lg border border-border bg-card p-5"
			>
				<h2 className="text-sm font-semibold text-foreground">
					{t("cart.heading")}
				</h2>
				<ul className="mt-4 divide-y divide-border">
					{cart.items.map((item) => (
						<li
							key={item.product}
							data-testid="cart-line"
							className="flex items-center justify-between py-2 text-sm"
						>
							<span className="text-foreground">{item.product}</span>
							<span className="text-muted-foreground">×{item.quantity}</span>
						</li>
					))}
				</ul>
				<div className="mt-5 flex flex-wrap items-center gap-3">
					{visible && (
						<button
							type="button"
							onClick={checkout}
							disabled={!enabled}
							data-testid="checkout-button"
							aria-label={t("cart.checkoutAria")}
							className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
						>
							{t("cart.checkout")}
						</button>
					)}
					<span className="text-xs text-muted-foreground">
						{t("cart.dispatches", { op: KERNEL_ASTS.operation })}
					</span>
				</div>
			</section>

			{/* The placed-order result + the all-green / stable badge. */}
			{result && (
				<section
					data-testid="order-result"
					data-result={result.kind}
					className="rounded-lg border border-border bg-card p-5"
				>
					{result.kind === "green" && placed ? (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<span
									data-testid="stable-badge"
									className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
								>
									{t("result.stable")}
								</span>
							</div>
							<p className="text-sm font-medium text-foreground">
								{t("result.placed", { id: placed.id })}
							</p>
							<ul className="divide-y divide-border">
								{placed.items.map((item) => (
									<li
										key={item.product}
										data-testid="order-line"
										className="flex items-center justify-between py-2 text-sm"
									>
										<span className="text-foreground">{item.product}</span>
										<span className="text-muted-foreground">
											×{item.quantity}
										</span>
									</li>
								))}
							</ul>
						</div>
					) : (
						<p className="text-sm font-medium text-foreground">
							{result.kind === "blocked" ? result.reason : null}
						</p>
					)}
				</section>
			)}
		</div>
	);
}
