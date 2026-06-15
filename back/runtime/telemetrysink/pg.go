package telemetrysink

import (
	"context"
	"encoding/json"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Writer is the impure edge of the sink: it appends decoded spans to telemetry.span.
// telemetry is BELOW the wall (observed reality, not kernel/mirrors/fitness), so a service
// MAY write it directly — the agent stays SELECT-only (telemetry-reader). The INSERT is
// idempotent on the (trace_id, span_id) primary key (a span is immutable; a re-export of
// the same span is a no-op, never a duplicate or an overwrite — append-only spirit §9).
type Writer struct {
	Pool *pgxpool.Pool
}

// Write persists the rows in one batch and returns how many statements ran. A pure decode
// (Decode) precedes this; Write performs no parsing — it only touches the world.
func (w *Writer) Write(ctx context.Context, rows []SpanRow) (int, error) {
	if len(rows) == 0 {
		return 0, nil
	}
	batch := &pgx.Batch{}
	for _, r := range rows {
		attrs, err := json.Marshal(r.Attributes)
		if err != nil {
			return 0, err
		}
		batch.Queue(
			`insert into telemetry.span (trace_id, span_id, name, status, attributes, started_at, ended_at)
			 values ($1, $2, $3, $4, $5, $6, $7)
			 on conflict (trace_id, span_id) do nothing`,
			r.TraceID, r.SpanID, r.Name, r.Status, attrs, r.StartedAt, r.EndedAt,
		)
	}
	br := w.Pool.SendBatch(ctx, batch)
	defer br.Close()
	n := 0
	for range rows {
		if _, err := br.Exec(); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}
