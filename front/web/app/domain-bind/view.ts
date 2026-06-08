import type { BindPlan } from "@/lib/domainbind";

/**
 * View model for the /domain-bind panel (S97 — custom-domain binding + TLS). Kept OUT of
 * actions.ts because a Next "use server" module may only export async functions — types and the
 * initial value live here so both the Server Action and the client panel import them.
 */
export interface DomainBindView {
	ok: boolean;
	/** the deterministic, content-addressed bind plan (URL, Traefik labels, DNS CNAME). */
	plan?: BindPlan;
	/** whether the plan's labels actually serve the app over HTTPS (the Godog done-criteria). */
	servesHTTPS?: boolean;
	/** whether the resulting registry stays injective (the property done-criteria). */
	injective?: boolean;
	/** the refusal code when the bind is refused (DOMAIN_ALREADY_BOUND / OUT_OF_SCOPE). */
	blockCode?: string;
	/** a domain already bound elsewhere / a malformed domain → the BlockReason explanation. */
	blockExplanation?: string;
}

export const DOMAIN_BIND_INITIAL: DomainBindView = { ok: false };
