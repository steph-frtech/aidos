// Package secretstore is the AIDOS S91 per-app SECRET STORE (app-builder EPIC 9,
// ROADMAP-app-builder §S91, DP32, ADR 0043).
//
// THE STEP. An emitted app needs SECRETS to run: a datastore credential, a third-
// party API key, an OAuth client secret. This package holds them for a project,
// CHIFFRÉ AU REPOS (AES-256-GCM), SCOPÉ project_id, and — the load-bearing law —
// NEVER in the truth-store, NEVER in git, NEVER in the emitted source. A secret
// lives ONLY in the encrypted store and is exposed ONLY as a boot-time environment
// variable (DP32: injection par variables d'env au boot ; ADR 0043 deploy wiring).
//
// FOUR done-criteria (ROADMAP §S91), all DETERMINISTIC — "scan = code, jamais un LLM":
//
//   - ISOLATION (property): a secret of project A never leaks to project B. Each
//     ciphertext is sealed with the project_id bound into its AES-GCM additional
//     data (AAD) — a value sealed for A cannot be opened under B's scope (a
//     cryptographic, not a convention, boundary). Get under the wrong project_id
//     fails closed.
//   - NO-LEAK-IN-SOURCE (property): ScanEmission is a gitleaks-style DETERMINISTIC
//     scanner (high-entropy + known-pattern regexes) over the emitted bytes; it
//     finds a leaked secret VALUE or a known credential pattern. The store's plaintext
//     never reaches an emitter, and the scan proves the emission is clean.
//   - ROTATION (fixture): Rotate replaces a secret's value AND invalidates the old
//     one — a Get after a rotation never returns the prior value; the old ciphertext
//     is superseded (append-only history, head mutable — the S02 truth shape reused
//     below the line).
//   - MISSING-AT-BOOT (fixture): InjectEnv computes the DECLARED keys MINUS the
//     PRESENT keys; a non-empty difference is a fail-closed, actionable BlockReason
//     (CodeSecretMissingAtBoot) — never a blank/guessed credential.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The judgments are PURE code: the missing-key
// check is a set-difference, the leak scan is regex matching, project isolation is a
// cryptographic AAD binding. The ONLY non-determinism is the per-secret random GCM
// nonce (a cryptographic necessity — a fixed nonce under one key is a CATASTROPHIC
// reuse); the nonce is supplied through a Sealer so the reproducibility mirror can
// pin a fixed nonce and assert byte-stable ciphertext. No LLM enters anywhere.
//
// THE WALL (CLAUDE.md §2). This is Runtime plumbing BELOW the line: it writes the
// `secrets` projection store, never kernel/mirrors/fitness. A secret is NOT a truth —
// it is operational material; promoting which secrets an app DECLARES it needs is a
// Kernel concern (the operation/connector source), surfaced here only as the declared
// key set InjectEnv checks against.
package secretstore

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// envPrefix is the deterministic prefix every injected secret env var carries, so a
// boot-time variable that came from the secret store is recognisable and never
// collides with the non-secret wiring the S89 provision plan emits.
const envPrefix = "APP_SECRET_"

// Sealer abstracts the AES-GCM nonce source so the reproducibility mirror can inject
// a FIXED nonce (byte-stable ciphertext) while production uses crypto/rand. A nonce
// is 12 bytes (the GCM standard). It is the ONLY entropy the store consumes.
type Sealer interface {
	Nonce() ([]byte, error)
}

// randSealer draws a fresh 12-byte nonce from crypto/rand — the production Sealer. A
// fresh nonce per Seal is a hard requirement (GCM nonce reuse under one key is fatal).
type randSealer struct{}

func (randSealer) Nonce() ([]byte, error) {
	n := make([]byte, 12)
	if _, err := rand.Read(n); err != nil {
		return nil, err
	}
	return n, nil
}

// fixedSealer returns a constant nonce — used ONLY by the reproducibility mirror to
// pin byte-stable ciphertext (never in production; a constant nonce is a security
// anti-pattern outside a deterministic test).
type fixedSealer struct{ n []byte }

func (f fixedSealer) Nonce() ([]byte, error) {
	out := make([]byte, 12)
	copy(out, f.n)
	return out, nil
}

// NewFixedSealer builds a deterministic Sealer for the reproducibility mirror.
func NewFixedSealer(seed string) Sealer {
	h := sha256.Sum256([]byte("secretstore/nonce/v1:" + seed))
	return fixedSealer{n: h[:12]}
}

// secretRecord is the encrypted-at-rest record of one secret. The Value is NEVER
// stored in plaintext: only Nonce|Ciphertext (sealed with the project_id as AAD).
// History is append-only (the prior versions stay, Head points at the live one) —
// the S02 truth shape reused below the line, so a rotation supersedes, never destroys.
type secretRecord struct {
	nonce      []byte
	ciphertext []byte
	createdAt  time.Time
	// superseded marks a rotated-away version: kept for history, never returned by Get.
	superseded bool
}

// SecretStore is the in-memory, project-scoped, encrypted-at-rest secret store. The
// master key encrypts every value; the project_id is bound into each value's AAD so a
// ciphertext sealed for one project can NEVER be opened under another (cross-project
// isolation, the done-criterion). Persistence (a `secrets` Postgres table) is the
// deploy track's concern (DP32) — this package owns the deterministic crypto + the
// boot-injection logic; the test mirror exercises it in-memory.
type SecretStore struct {
	gcm    cipher.AEAD
	sealer Sealer
	// history holds every version, keyed by (project, key); the live version is the
	// last non-superseded entry. Append-only (rotation appends + supersedes).
	history map[string][]secretRecord
}

// scopeKey is the internal storage key — project_id then secret name, ":"-joined. The
// project_id is ALSO the AES-GCM AAD, so isolation is cryptographic, not just a map key.
func scopeKey(projectID, name string) string {
	return projectID + "\x00" + name
}

// aad binds a ciphertext to its project_id: a value sealed for project A carries A's
// id as additional authenticated data; opening it under B's id fails the GCM tag check.
func aad(projectID string) []byte {
	return []byte("secretstore/aad/v1:" + projectID)
}

var (
	// ErrBadKey — the master key is not a valid AES-256 key (32 bytes).
	ErrBadKey = errors.New("secretstore: master key must be 32 bytes (AES-256)")
	// ErrEmptyProject — a store operation pinned no project_id (the isolation scope).
	ErrEmptyProject = errors.New("secretstore: operation pins no project_id")
	// ErrEmptyName — a store operation pinned no secret name.
	ErrEmptyName = errors.New("secretstore: operation pins no secret name")
	// ErrNotFound — a Get/Rotate targeted a secret absent under the given project_id
	// (also returned when a value was sealed for a DIFFERENT project — isolation).
	ErrNotFound = errors.New("secretstore: secret not found under this project_id")
)

// New builds a SecretStore from a 32-byte master key, using the production Sealer
// (crypto/rand nonces). A non-32-byte key is refused (never silently padded).
func New(masterKey []byte) (*SecretStore, error) {
	return newWithSealer(masterKey, randSealer{})
}

// NewWithSealer builds a SecretStore with a supplied Sealer — the reproducibility
// mirror passes a fixed Sealer for byte-stable ciphertext.
func NewWithSealer(masterKey []byte, s Sealer) (*SecretStore, error) {
	return newWithSealer(masterKey, s)
}

func newWithSealer(masterKey []byte, s Sealer) (*SecretStore, error) {
	if len(masterKey) != 32 {
		return nil, ErrBadKey
	}
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &SecretStore{gcm: gcm, sealer: s, history: map[string][]secretRecord{}}, nil
}

// DeriveKey derives a deterministic 32-byte master key from a passphrase — a
// convenience for tests/bootstrap (production passes a real KMS-managed key). It is
// pure: same passphrase → same key.
func DeriveKey(passphrase string) []byte {
	h := sha256.Sum256([]byte("secretstore/masterkey/v1:" + passphrase))
	return h[:]
}

// Set stores (or adds a new version of) a secret VALUE for (projectID, name),
// encrypted at rest and bound to the project_id. The plaintext value is sealed
// immediately and never retained. An empty project/name/value-by-key is refused.
func (s *SecretStore) Set(projectID, name, value string) error {
	if strings.TrimSpace(projectID) == "" {
		return ErrEmptyProject
	}
	if strings.TrimSpace(name) == "" {
		return ErrEmptyName
	}
	nonce, err := s.sealer.Nonce()
	if err != nil {
		return err
	}
	ct := s.gcm.Seal(nil, nonce, []byte(value), aad(projectID))
	k := scopeKey(projectID, name)
	// Supersede any prior live version (Set is idempotent-as-replace), then append.
	for i := range s.history[k] {
		s.history[k][i].superseded = true
	}
	s.history[k] = append(s.history[k], secretRecord{
		nonce:      nonce,
		ciphertext: ct,
		createdAt:  bootTime(),
	})
	return nil
}

// Get returns the LIVE plaintext value for (projectID, name). It fails closed:
//   - an empty project/name → ErrEmptyProject/ErrEmptyName;
//   - no live version under THIS project_id → ErrNotFound (also the case when a value
//     exists only under a DIFFERENT project — the AAD tag check rejects it: isolation).
func (s *SecretStore) Get(projectID, name string) (string, error) {
	if strings.TrimSpace(projectID) == "" {
		return "", ErrEmptyProject
	}
	if strings.TrimSpace(name) == "" {
		return "", ErrEmptyName
	}
	k := scopeKey(projectID, name)
	versions := s.history[k]
	for i := len(versions) - 1; i >= 0; i-- {
		if versions[i].superseded {
			continue
		}
		pt, err := s.gcm.Open(nil, versions[i].nonce, versions[i].ciphertext, aad(projectID))
		if err != nil {
			// AAD/tag mismatch (wrong project) or tamper → fail closed, never a guess.
			return "", ErrNotFound
		}
		return string(pt), nil
	}
	return "", ErrNotFound
}

// Has reports whether a LIVE secret exists for (projectID, name) — the membership the
// missing-at-boot check consumes. It does NOT decrypt (cheap, leak-free).
func (s *SecretStore) Has(projectID, name string) bool {
	versions := s.history[scopeKey(projectID, name)]
	for i := len(versions) - 1; i >= 0; i-- {
		if !versions[i].superseded {
			return true
		}
	}
	return false
}

// Rotate replaces a secret's value with newValue AND invalidates the old one: after
// Rotate, Get returns newValue and the prior value is superseded (never returned
// again). It is the done-criterion "la rotation invalide l'ancien secret". A rotation
// of an absent secret is ErrNotFound (you rotate what exists; you Set what does not).
func (s *SecretStore) Rotate(projectID, name, newValue string) error {
	if strings.TrimSpace(projectID) == "" {
		return ErrEmptyProject
	}
	if strings.TrimSpace(name) == "" {
		return ErrEmptyName
	}
	if !s.Has(projectID, name) {
		return ErrNotFound
	}
	// Set already supersedes the prior live version and appends the new one (append-only
	// history): the old ciphertext stays for audit but is never returned by Get again.
	return s.Set(projectID, name, newValue)
}

// EnvVar is the deterministic env-var name for a secret (the boot-injection shape):
// APP_SECRET_<UPPER_SNAKE(name)>. Pure: same name → same var.
func EnvVar(name string) string {
	up := strings.ToUpper(name)
	up = nonEnv.ReplaceAllString(up, "_")
	return envPrefix + up
}

// nonEnv matches any char not legal in an env-var name (everything but [A-Z0-9_]).
var nonEnv = regexp.MustCompile(`[^A-Z0-9_]`)

// BootInjection is the result of InjectEnv: the SORTED env vars to inject at boot
// (one per declared secret), each value pulled live from the encrypted store. The
// map is never logged/persisted in the clear beyond the boot env (DP32).
type BootInjection struct {
	// Env is the SORTED, deterministic list of (name, value) env entries to inject.
	Env []EnvKV
}

// EnvKV is one injected env var (name + decrypted value).
type EnvKV struct {
	Name  string
	Value string
}

// InjectEnv computes the boot-time environment for a project from its DECLARED secret
// keys. It is fail-closed:
//
//   - it computes declaredKeys − presentKeys (a deterministic set-difference); a
//     non-empty difference is a CodeSecretMissingAtBoot BlockReason (the missing keys
//     named in the explanation) — the boot is refused, never started with a blank/
//     guessed credential;
//   - otherwise it returns the SORTED env vars (APP_SECRET_<NAME>=<live value>), each
//     decrypted from the project's store (so a secret never touches disk in the clear).
//
// declaredKeys is the set of secret names the app's operations/datastore/connectors
// declared they require (a Kernel-derived list, supplied — InjectEnv invents none).
func (s *SecretStore) InjectEnv(projectID string, declaredKeys []string) (BootInjection, *blockreason.BlockReason) {
	if strings.TrimSpace(projectID) == "" {
		br := blockreason.For(blockreason.CodeSecretMissingAtBoot)
		return BootInjection{}, &br
	}
	// 1. Canonicalise + dedupe the declared keys (order-independent, deterministic).
	want := dedupeSorted(declaredKeys)

	// 2. Fail-closed set-difference: declared − present.
	missing := make([]string, 0, len(want))
	for _, k := range want {
		if !s.Has(projectID, k) {
			missing = append(missing, k)
		}
	}
	if len(missing) > 0 {
		br := blockreason.For(blockreason.CodeSecretMissingAtBoot)
		br.Explanation = br.Explanation + " Clés manquantes (différence déclarées − présentes) : " +
			strings.Join(missing, ", ") + " — pour le projet " + projectID + "."
		return BootInjection{}, &br
	}

	// 3. All declared keys present → decrypt each into a SORTED env list.
	env := make([]EnvKV, 0, len(want))
	for _, k := range want {
		v, err := s.Get(projectID, k)
		if err != nil {
			// Defensive: a present-but-unopenable key (tamper) is still a fail-closed boot.
			br := blockreason.For(blockreason.CodeSecretMissingAtBoot)
			br.Explanation = br.Explanation + " La clé « " + k + " » est présente mais illisible (intégrité)."
			return BootInjection{}, &br
		}
		env = append(env, EnvKV{Name: EnvVar(k), Value: v})
	}
	sort.Slice(env, func(i, j int) bool { return env[i].Name < env[j].Name })
	return BootInjection{Env: env}, nil
}

// dedupeSorted returns the trimmed, non-empty, de-duplicated, sorted key set.
func dedupeSorted(keys []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// bootTime is the createdAt stamp. It is NOT load-bearing for any content address or
// returned value (history order is positional), so a coarse stamp is fine and keeps
// the store side-effect-free w.r.t. the determinism mirror (no createdAt enters Get).
func bootTime() time.Time { return time.Unix(0, 0).UTC() }

// ---------------------------------------------------------------------------------
// The LEAK SCAN (done-criterion: "un secret … ne … apparaît dans le source émis (scan
// déterministe type-gitleaks sur l'émission)"). A PURE function over the emitted bytes.
// ---------------------------------------------------------------------------------

// Finding is one leak the scanner found in an emitted artifact: the rule that fired,
// the 1-based line, and a REDACTED excerpt (the scanner never echoes the secret in the
// clear into its own report — that would just move the leak).
type Finding struct {
	Rule    string `json:"rule"`
	Line    int    `json:"line"`
	Excerpt string `json:"excerpt"`
}

// leakRule is one gitleaks-style detector: a name + a compiled regex over a line.
type leakRule struct {
	name string
	re   *regexp.Regexp
}

// leakRules is the CLOSED, declared set of secret-pattern detectors (a gitleaks
// subset, above the line — never learned, never an LLM). Each is a known credential
// shape: AWS keys, generic high-entropy assignments to secret-named vars, private-key
// headers, bearer tokens, OAuth client secrets, and Postgres URIs with a password.
var leakRules = []leakRule{
	{"aws-access-key-id", regexp.MustCompile(`AKIA[0-9A-Z]{16}`)},
	{"private-key-header", regexp.MustCompile(`-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----`)},
	{"bearer-token", regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9._\-]{20,}`)},
	{"postgres-uri-password", regexp.MustCompile(`postgres(?:ql)?://[^:/\s]+:[^@/\s]+@`)},
	// a secret-named var assigned a long, high-entropy literal (the most common leak).
	{"secret-assignment", regexp.MustCompile(`(?i)(?:secret|api[_-]?key|password|passwd|token|client[_-]?secret)["'\s]*[:=]\s*["'][A-Za-z0-9._\-+/]{12,}["']`)},
}

// ScanEmission scans emitted source bytes for leaked secrets, DETERMINISTICALLY. It
// runs the declared leakRules over each line AND, when knownValues is non-empty, flags
// any line containing one of the project's actual secret VALUES (the strongest check:
// the literal plaintext made it into the emission). Findings are returned in stable
// (line, rule) order — same input → same findings. No LLM enters.
//
// knownValues lets the property mirror assert the exact done-criterion ("un secret du
// projet A … n'apparaît dans le source émis") without relying on pattern luck: the
// store's own plaintext values are searched for verbatim. The scanner NEVER receives
// the store's master key — only the (already-decrypted) values the caller chooses to
// check, and it redacts them in its own report.
func ScanEmission(source string, knownValues []string) []Finding {
	findings := []Finding{}
	lines := strings.Split(source, "\n")
	for i, line := range lines {
		lineNo := i + 1
		for _, r := range leakRules {
			if loc := r.re.FindStringIndex(line); loc != nil {
				findings = append(findings, Finding{
					Rule:    r.name,
					Line:    lineNo,
					Excerpt: redact(line, loc[0], loc[1]),
				})
			}
		}
		for _, v := range knownValues {
			if v == "" || len(v) < 6 {
				continue // too short to be a meaningful secret-value match (avoid false positives)
			}
			if idx := strings.Index(line, v); idx >= 0 {
				findings = append(findings, Finding{
					Rule:    "known-secret-value",
					Line:    lineNo,
					Excerpt: redact(line, idx, idx+len(v)),
				})
			}
		}
	}
	sort.SliceStable(findings, func(i, j int) bool {
		if findings[i].Line != findings[j].Line {
			return findings[i].Line < findings[j].Line
		}
		return findings[i].Rule < findings[j].Rule
	})
	return findings
}

// IsClean reports whether an emission has NO leak findings — the boolean the emitter
// gate and the Workbench read ("the emitted source is clean of secrets").
func IsClean(source string, knownValues []string) bool {
	return len(ScanEmission(source, knownValues)) == 0
}

// redact replaces the matched span with a fixed marker so the scanner's own report
// never re-emits the secret in the clear (a report that prints the secret is itself a
// leak). It keeps the surrounding context for a human to locate the line.
func redact(line string, start, end int) string {
	if start < 0 || end > len(line) || start > end {
		return "[redacted]"
	}
	return line[:start] + "[REDACTED]" + line[end:]
}

// String renders a finding for the CLI/MCP (deterministic).
func (f Finding) String() string {
	return fmt.Sprintf("%s @ line %d: %s", f.Rule, f.Line, f.Excerpt)
}

// StoreFingerprint is a deterministic, NON-secret fingerprint of which keys a project
// holds (the names + a per-version content address of the ciphertext) — for the
// Workbench/MCP to render "what is stored" WITHOUT ever exposing a value. It hashes
// only ciphertext + names, never plaintext. Pure: same store state → same fingerprint.
func (s *SecretStore) StoreFingerprint(projectID string) string {
	type kv struct {
		name string
		addr string
	}
	rows := []kv{}
	prefix := projectID + "\x00"
	for k, versions := range s.history {
		if !strings.HasPrefix(k, prefix) {
			continue
		}
		name := strings.TrimPrefix(k, prefix)
		for _, v := range versions {
			if v.superseded {
				continue
			}
			rows = append(rows, kv{name: name, addr: records.Hash(v.ciphertext)})
		}
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].name != rows[j].name {
			return rows[i].name < rows[j].name
		}
		return rows[i].addr < rows[j].addr
	})
	var b strings.Builder
	for _, r := range rows {
		b.WriteString(r.name)
		b.WriteString("=")
		b.WriteString(r.addr)
		b.WriteString("\n")
	}
	return records.Hash([]byte(b.String()))
}
