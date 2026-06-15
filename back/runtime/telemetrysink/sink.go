// Package telemetrysink is the OTLP→Postgres SPAN SINK (ADR 0076 phase 2 : « le substrat
// gelé est UTILISÉ, pas juste déclaré »). L'app émise envoie déjà ses traces OTLP au
// collector ; le collector n'avait qu'un exporter `debug` (les spans étaient perdus sur
// stdout). Ce sink REÇOIT l'OTLP (encodage JSON) et PERSISTE chaque span dans
// telemetry.span — la table que telemetry-reader (S/MCP) relit ensuite pour la boucle
// reality-ingest (§1521/§1524). Sans cette persistance, la « réalité » de prod n'a aucune
// donnée à ingérer : c'est le chaînon manquant de la boucle d'apprentissage.
//
// LE MUR (CLAUDE.md §2) : telemetry n'est PAS kernel/mirrors/fitness — c'est de la réalité
// OBSERVÉE (runtime), below the line. Le sink l'ÉCRIT (un service, pas l'agent au passage) ;
// l'agent reste SELECT-only dessus (telemetry-reader observe, n'écrit jamais la vérité).
//
// DETERMINISM-FIRST (§6/§8) : Decode est une fonction PURE et TOTALE du corps OTLP-JSON —
// pas d'horloge, pas de réseau, pas de LLM. Même requête → mêmes lignes (miroir : sink_test).
// Seul l'INSERT (pg.go) touche le monde. Un span malformé est REFUSÉ (fail-closed), jamais
// une ligne moitié-inventée.
package telemetrysink

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"
)

// SpanRow is one row of telemetry.span — exactly the columns the schema declares
// (trace_id, span_id, name, status, attributes jsonb, started_at, ended_at) and the shape
// telemetry-reader's SpanRow reads back. Content of attributes is a flat key→value map.
type SpanRow struct {
	TraceID    string
	SpanID     string
	Name       string
	Status     string
	Attributes map[string]string
	StartedAt  time.Time
	EndedAt    time.Time
}

// ── the OTLP/HTTP JSON wire shape (the subset we persist) ─────────────────────────────
// OTLP/JSON encodes a trace export as resourceSpans[].scopeSpans[].spans[]. We read only
// the fields telemetry.span holds; unknown fields are ignored (forward-compatible).

type otlpExport struct {
	ResourceSpans []otlpResourceSpans `json:"resourceSpans"`
}

type otlpResourceSpans struct {
	Resource   otlpResource     `json:"resource"`
	ScopeSpans []otlpScopeSpans `json:"scopeSpans"`
}

type otlpResource struct {
	Attributes []otlpKeyValue `json:"attributes"`
}

type otlpScopeSpans struct {
	Spans []otlpSpan `json:"spans"`
}

type otlpSpan struct {
	TraceID           string         `json:"traceId"`
	SpanID            string         `json:"spanId"`
	Name              string         `json:"name"`
	StartTimeUnixNano string         `json:"startTimeUnixNano"`
	EndTimeUnixNano   string         `json:"endTimeUnixNano"`
	Status            otlpStatus     `json:"status"`
	Attributes        []otlpKeyValue `json:"attributes"`
}

// otlpStatus.Code is RAW because the OTLP/JSON status code is encoded INCONSISTENTLY by
// producers: the otelcol json exporter emits the enum as a NUMBER (1/2), the spec's proto3
// mapping allows the enum NAME string ("STATUS_CODE_OK"), and an UNSET status is often
// omitted entirely. statusOf normalises all three; typing it `string` would 400 the
// collector's numeric form (the bug this fixes).
type otlpStatus struct {
	Code json.RawMessage `json:"code"`
}

type otlpKeyValue struct {
	Key   string    `json:"key"`
	Value otlpValue `json:"value"`
}

// otlpValue is the OTLP AnyValue (we flatten to a string — the telemetry.span attributes
// jsonb is a flat string map, enough for the reality reader's observation).
type otlpValue struct {
	StringValue *string  `json:"stringValue"`
	IntValue    *string  `json:"intValue"`
	BoolValue   *bool    `json:"boolValue"`
	DoubleValue *float64 `json:"doubleValue"`
}

func (v otlpValue) flatten() string {
	switch {
	case v.StringValue != nil:
		return *v.StringValue
	case v.IntValue != nil:
		return *v.IntValue
	case v.BoolValue != nil:
		return strconv.FormatBool(*v.BoolValue)
	case v.DoubleValue != nil:
		return strconv.FormatFloat(*v.DoubleValue, 'g', -1, 64)
	default:
		return ""
	}
}

// ErrNoSpans is returned when a well-formed payload carries zero spans (a no-op export,
// not a failure — the caller treats it as "nothing to persist", HTTP 200).
var ErrNoSpans = errors.New("telemetrysink: no spans in export")

// statusOf normalises the OTLP status code to the short text telemetry.span stores
// ("ok" | "error" | "unset"), accepting the enum as a JSON number (1/2), the name string
// ("STATUS_CODE_OK"), or absent. A missing/unknown code is "unset" — never invented.
func statusOf(raw json.RawMessage) string {
	code := strings.Trim(strings.TrimSpace(string(raw)), `"`)
	switch code {
	case "STATUS_CODE_OK", "1", "Ok":
		return "ok"
	case "STATUS_CODE_ERROR", "2", "Error":
		return "error"
	default:
		return "unset"
	}
}

// nanoToTime converts an OTLP UnixNano string to a UTC time. Empty/zero → zero time; a
// non-numeric value is a malformed span (fail-closed at Decode).
func nanoToTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, true // absent timestamp is tolerated (zero), not a parse error
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return time.Time{}, false
	}
	return time.Unix(0, n).UTC(), true
}

// flattenAttrs merges resource + span attributes into one flat string map. Resource
// attributes (service.name…) are included so the reader can scope by service; a span
// attribute of the same key wins (the more specific value).
func flattenAttrs(resource, span []otlpKeyValue) map[string]string {
	out := make(map[string]string, len(resource)+len(span))
	for _, kv := range resource {
		out[kv.Key] = kv.Value.flatten()
	}
	for _, kv := range span {
		out[kv.Key] = kv.Value.flatten()
	}
	return out
}

// Decode is the PURE heart of the sink: an OTLP/HTTP-JSON trace export → the rows to
// persist. Total and deterministic (same bytes → same rows, in document order). A span
// missing trace_id/span_id/name, or carrying an unparenable timestamp, makes the WHOLE
// decode fail (fail-closed — a malformed export does not partially land, KRD §82). A
// well-formed export with zero spans returns ErrNoSpans (a benign no-op).
func Decode(body []byte) ([]SpanRow, error) {
	var ex otlpExport
	if err := json.Unmarshal(body, &ex); err != nil {
		return nil, err
	}
	var rows []SpanRow
	for _, rs := range ex.ResourceSpans {
		for _, ss := range rs.ScopeSpans {
			for _, sp := range ss.Spans {
				if sp.TraceID == "" || sp.SpanID == "" || sp.Name == "" {
					return nil, errors.New("telemetrysink: span missing trace_id/span_id/name")
				}
				start, ok1 := nanoToTime(sp.StartTimeUnixNano)
				end, ok2 := nanoToTime(sp.EndTimeUnixNano)
				if !ok1 || !ok2 {
					return nil, errors.New("telemetrysink: span has a non-numeric timestamp")
				}
				rows = append(rows, SpanRow{
					TraceID:    sp.TraceID,
					SpanID:     sp.SpanID,
					Name:       sp.Name,
					Status:     statusOf(sp.Status.Code),
					Attributes: flattenAttrs(rs.Resource.Attributes, sp.Attributes),
					StartedAt:  start,
					EndedAt:    end,
				})
			}
		}
	}
	if len(rows) == 0 {
		return nil, ErrNoSpans
	}
	return rows, nil
}
