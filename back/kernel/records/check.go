package records

import "fmt"

// CheckResult is the outcome of validating a set of records. Valid is true iff
// every record passed Validate; Errors lists per-record problems (empty when
// Valid). It is the value `aidos check` prints and the Workbench projects.
type CheckResult struct {
	Valid  bool     `json:"valid"`
	Count  int      `json:"count"`
	Errors []string `json:"errors"`
}

// Check validates a set of records against the content-address invariant and the
// shape rules (Validate). It is read-only and pure: no DB, no write. This is the
// computation behind `aidos check` over the example record set.
func Check(rs []Record) CheckResult {
	res := CheckResult{Valid: true, Count: len(rs)}
	for _, r := range rs {
		if err := Validate(r); err != nil {
			res.Valid = false
			res.Errors = append(res.Errors, fmt.Sprintf("%s: %v", r.Kind, err))
		}
	}
	return res
}

// CheckEmptyExample builds the canonical empty-example set and checks it. It is
// the exact computation the acceptance mirror exercises: the empty example of all
// seven kinds is VALID and each id == version == content hash. No agent write is
// required — this is pure validation, satisfiable by a SELECT-only role.
func CheckEmptyExample() (CheckResult, error) {
	set, err := EmptyExampleSet()
	if err != nil {
		return CheckResult{}, err
	}
	return Check(set), nil
}
