// Package passwordauth contains password policy and hashing primitives. It has
// no dependency on HTTP, database connections or application configuration.
package passwordauth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

var (
	ErrInvalidUsername    = errors.New("invalid login name")
	ErrInvalidPassword    = errors.New("password does not satisfy policy")
	ErrWeakPassword       = errors.New("password is too common")
	ErrInvalidHash        = errors.New("invalid password hash")
	ErrUnauthorized       = errors.New("password operation is not authorized")
	ErrConflict           = errors.New("password credentials have changed")
	ErrLastAdministrator  = errors.New("the last available administrator must be retained")
	ErrAlreadyInitialized = errors.New("password account is already initialized")
	ErrUsernameTaken      = errors.New("login name is already in use")
	ErrInvalidInput       = errors.New("invalid password account input")
)

const (
	MinPasswordRunes = 8
	MaxPasswordRunes = 12
	MaxPasswordBytes = 512
	// Existing credentials remain valid after changing the creation policy.
	maxVerificationRunes        = 128
	memoryKiB            uint32 = 19456
	iterations           uint32 = 2
	parallelism          uint8  = 1
	saltBytes                   = 16
	hashBytes                   = 32
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{2,31}$`)

func NormalizeUsername(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

func ValidateUsername(s string) error {
	if !usernamePattern.MatchString(s) {
		return ErrInvalidUsername
	}
	return nil
}

// These local examples cover common passwords that pass the length rule.
// Values are used only for comparison; a password is never sent to a service.
var commonPasswords = map[string]struct{}{
	"12345678": {}, "123456789": {}, "1234567890": {}, "12345678901": {}, "123456789012": {},
	"password": {}, "password1": {}, "password12": {}, "password123": {}, "password1234": {},
	"qwerty123": {}, "qwertyuiop": {}, "admin123": {}, "admin1234": {}, "admin123456": {},
	"123456789012345": {}, "1234567890123456": {}, "12345678901234567890": {},
	"passwordpassword": {}, "password1234567": {}, "password12345678": {}, "password123456789": {},
	"passwordpasswordpassword": {}, "qwertyuiopasdfgh": {}, "qwertyuiopasdfghjkl": {},
	"qwertyuiop123456": {}, "iloveyouiloveyou": {}, "letmeinletmeinletmein": {},
	"changemechangeme": {}, "adminadminadmin": {}, "administrator123": {},
}

func ValidatePassword(s string) error {
	if len(s) > MaxPasswordBytes || !utf8.ValidString(s) {
		return ErrInvalidPassword
	}
	length := utf8.RuneCountInString(s)
	if length < MinPasswordRunes || length > MaxPasswordRunes {
		return ErrInvalidPassword
	}
	if _, common := commonPasswords[strings.ToLower(s)]; common {
		return ErrWeakPassword
	}
	// A repeated single character is a trivial password, including whitespace.
	runes := []rune(s)
	repeated := true
	for _, r := range runes[1:] {
		if r != runes[0] {
			repeated = false
			break
		}
	}
	if repeated {
		return ErrWeakPassword
	}
	return nil
}

// GenerateTemporaryPassword returns a random password for one-time handoff.
// Only its hash is persisted; plaintext must never be logged or cached.
func GenerateTemporaryPassword() (string, error) {
	// Nine random bytes encode to exactly twelve URL-safe characters.
	value := make([]byte, 9)
	for {
		if _, err := rand.Read(value); err != nil {
			return "", errors.New("temporary password generation failed")
		}
		password := base64.RawURLEncoding.EncodeToString(value)
		if ValidatePassword(password) == nil {
			return password, nil
		}
	}
}

func Hash(s string) (string, error) {
	if err := ValidatePassword(s); err != nil {
		return "", err
	}
	salt := make([]byte, saltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", errors.New("password salt generation failed")
	}
	key := argon2.IDKey([]byte(s), salt, iterations, memoryKiB, parallelism, hashBytes)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, memoryKiB, iterations, parallelism,
		base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(key)), nil
}

type parameters struct {
	memory, time uint32
	threads      uint8
	salt, key    []byte
}

func parse(encoded string) (parameters, error) {
	var p parameters
	if len(encoded) > 256 {
		return p, ErrInvalidHash
	}
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 || parts[0] != "" || parts[1] != "argon2id" || parts[2] != "v=19" {
		return p, ErrInvalidHash
	}
	values := strings.Split(parts[3], ",")
	if len(values) != 3 {
		return p, ErrInvalidHash
	}
	names := []string{"m=", "t=", "p="}
	parsed := make([]uint64, 3)
	for i, value := range values {
		if !strings.HasPrefix(value, names[i]) {
			return p, ErrInvalidHash
		}
		n, err := strconv.ParseUint(strings.TrimPrefix(value, names[i]), 10, 32)
		if err != nil || strconv.FormatUint(n, 10) != strings.TrimPrefix(value, names[i]) {
			return p, ErrInvalidHash
		}
		parsed[i] = n
	}
	// Bound resource consumption before calling Argon2; only accept at least the
	// current minimum strength, with a bounded allowance for future upgrades.
	if parsed[0] < uint64(memoryKiB) || parsed[0] > 65536 || parsed[1] < uint64(iterations) || parsed[1] > 5 || parsed[2] < 1 || parsed[2] > 4 {
		return p, ErrInvalidHash
	}
	p.memory, p.time, p.threads = uint32(parsed[0]), uint32(parsed[1]), uint8(parsed[2])
	var err error
	p.salt, err = base64.RawStdEncoding.Strict().DecodeString(parts[4])
	if err != nil || len(p.salt) < saltBytes || len(p.salt) > 32 {
		return parameters{}, ErrInvalidHash
	}
	p.key, err = base64.RawStdEncoding.Strict().DecodeString(parts[5])
	if err != nil || len(p.key) != hashBytes {
		return parameters{}, ErrInvalidHash
	}
	return p, nil
}

// ValidateHash checks a PHC encoding without performing an expensive hash.
func ValidateHash(encoded string) error { _, err := parse(encoded); return err }

func Verify(encoded, password string) bool {
	ok, _ := VerifyWithError(encoded, password)
	return ok
}

func VerifyWithError(encoded, password string) (bool, error) {
	if len(password) > MaxPasswordBytes || !utf8.ValidString(password) || utf8.RuneCountInString(password) > maxVerificationRunes {
		return false, ErrInvalidPassword
	}
	p, err := parse(encoded)
	if err != nil {
		return false, err
	}
	key := argon2.IDKey([]byte(password), p.salt, p.time, p.memory, p.threads, uint32(len(p.key)))
	return subtle.ConstantTimeCompare(key, p.key) == 1, nil
}

var placeholder struct {
	sync.Once
	hash string
}

// PlaceholderHash is generated once per process at the normal work factor.
// Unknown accounts must verify against this value before returning failure.
func PlaceholderHash() string {
	placeholder.Do(func() {
		value, err := Hash("UnknownUser!")
		if err != nil {
			panic("cannot initialize password placeholder")
		}
		placeholder.hash = value
	})
	return placeholder.hash
}
