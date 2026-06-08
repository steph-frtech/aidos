package operation

import "time"

// parseRFC3339 parses an RFC3339 timestamp for the scheduling predicate (Due/Tick).
// time.Parse is a deterministic PURE parse (no clock read, no zone surprise — RFC3339
// carries its own offset), so the scheduler stays a pure function of its inputs. A
// malformed timestamp returns the error for the caller to surface (totality, never a
// panic). It is the ONLY place this package touches the time package, and only to PARSE
// declared instants — never to READ the wall clock (the clock is injected, S73).
func parseRFC3339(s string) (time.Time, error) {
	return time.Parse(time.RFC3339, s)
}
