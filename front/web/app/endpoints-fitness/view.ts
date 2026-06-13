import type { Finding } from "@/lib/endpoint-fitness";

/**
 * View model of the DP08 sensor controls (« injecter / retirer / mesurer »)
 * — the serializable state the server action returns to the client panel.
 */
export interface SensorView {
	/** whether the canonical leak file is currently injected in the sandbox. */
	injected: boolean;
	/** the sensor verdict over the sandbox tree. */
	state: "green" | "red";
	/** the content address of the canonical verdict (Go-parity-pinned). */
	address: string;
	/** the content address of the scanned tree. */
	treeAddress: string;
	/** the hardcoded-endpoint findings (empty when green). */
	findings: Finding[];
	/** how many measures were taken from the screen. */
	measures: number;
}
