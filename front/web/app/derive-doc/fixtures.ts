import type { Kernel } from "@/lib/derivedoc";

/**
 * Non-action module for /derive-doc (FK06): the kernel fixtures + the view types + the
 * empty view. Kept OUT of actions.ts because a "use server" module may export ONLY async
 * Server Actions — a plain const/array export from there becomes a server-reference, not the
 * value (the cause of the `.map is not a function` SSR crash). These are plain values the
 * client + the action both import.
 */

export interface KernelFixture {
	id: string;
	label: string;
	kernel: Kernel;
}

/** The catalogue of kernel fixtures the panel can derive (the checkout slice + a tiny op). */
export const FIXTURES: KernelFixture[] = [
	{
		id: "checkout-slice",
		label: "checkout-slice",
		kernel: {
			kernelId: "checkout-slice",
			operations: [
				{
					name: "createOrder",
					input: "CreateOrderInput",
					steps: [
						{ kind: "validate" },
						{ kind: "authorize", policy: "canCheckout" },
						{ kind: "read", entity: "Cart" },
						{ kind: "mutate", entity: "Order" },
						{ kind: "mutate", entity: "Cart" },
						{ kind: "return" },
					],
					emits: ["OrderCreated", "CartCleared"],
				},
			],
			controls: [{ name: "checkout-button", triggers: "checkout-submit" }],
			actions: [
				{
					name: "checkout-submit",
					invoke: "createOrder",
					onControl: "checkout-button",
				},
			],
		},
	},
	{
		id: "refund-cell",
		label: "refund-cell",
		kernel: {
			kernelId: "refund-cell",
			operations: [
				{
					name: "refund",
					input: "RefundInput",
					steps: [
						{ kind: "validate" },
						{ kind: "authorize", policy: "canRefund" },
						{ kind: "mutate", entity: "Payment" },
						{ kind: "return" },
					],
					emits: ["Refunded"],
				},
			],
			controls: [{ name: "refund-button", triggers: "refund-submit" }],
			actions: [
				{ name: "refund-submit", invoke: "refund", onControl: "refund-button" },
			],
		},
	},
];

export interface DeriveView {
	ok: boolean;
	error?: string;
	kernelId?: string;
	concepts: string[];
	behaviors: { id: string; description: string }[];
	errors: string[];
	bytes?: string;
	/** the second run's bytes — proves byte-identity (run twice → identical). */
	bytesAgain?: string;
	identical?: boolean;
}

export const emptyView: DeriveView = {
	ok: false,
	concepts: [],
	behaviors: [],
	errors: [],
};
