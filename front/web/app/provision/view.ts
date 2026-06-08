import type { Plan } from "@/lib/provision";

/**
 * View model for the /provision panel (S89). Kept OUT of actions.ts because a Next
 * "use server" module may only export async functions — types and the initial value
 * live here so both the Server Action and the client panel can import them.
 */
export interface PlanView {
	ok: boolean;
	plan?: Plan;
	blockCode?: string;
}

export const PLAN_INITIAL: PlanView = { ok: false };
