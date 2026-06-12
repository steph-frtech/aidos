/**
 * View model of the DP07 matrix-measure control (« mesurer la matrice ») —
 * the serializable state the server action returns to the client panel.
 */
export interface MatrixMeasureView {
	measured: boolean;
	hash?: string;
	sameAsSeeded?: boolean;
}

export const MATRIX_MEASURE_INITIAL: MatrixMeasureView = { measured: false };
