/**
 * View types + the empty initial state for the FK16 /proof-levels bascule. Kept OUT of the
 * "use server" actions module (which may only export async functions). Pure types + a const.
 */

export interface ETagView {
	mirrorId: string;
	n: string;
	nLifecycle: string;
	e: number;
	eName: string;
}

export interface BasculeView {
	ok: boolean;
	error?: string;
	noLoss: boolean;
	tags: ETagView[];
	histogram: { level: number; name: string; count: number }[];
}

export const emptyBascule: BasculeView = {
	ok: false,
	noLoss: false,
	tags: [],
	histogram: [],
};
