package passwordauth

import (
	"strings"
	"testing"
)

func TestUsernamePolicy(t *testing.T) {
	if got := NormalizeUsername("  A.User-01_ "); got != "a.user-01_" {
		t.Fatalf("unexpected normalized name: %q", got)
	}
	for _, value := range []string{"abc", "a.b_c-1", strings.Repeat("a", 32)} {
		if err := ValidateUsername(value); err != nil {
			t.Errorf("valid name %q: %v", value, err)
		}
	}
	for _, value := range []string{"", "ab", "Aname", " abc", "abc ", "_abc", "名字", "a/b", strings.Repeat("a", 33)} {
		if ValidateUsername(value) == nil {
			t.Errorf("invalid name accepted: %q", value)
		}
	}
}

func TestPasswordPolicyUnicodeAndBounds(t *testing.T) {
	for _, value := range []string{"Valid!08", "ValidPass!12", "中文密码允许空格", " Space PW ", strings.Repeat("🔒🔑", 4), strings.Repeat("🔒🔑", 6)} {
		if err := ValidatePassword(value); err != nil {
			t.Errorf("valid password rejected: %v", err)
		}
	}
	for _, value := range []string{"1234567", "ValidPass!123", strings.Repeat("🔒", 7), strings.Repeat("🔒", 13), "invalid\xff"} {
		if ValidatePassword(value) != ErrInvalidPassword {
			t.Errorf("expected length/encoding rejection")
		}
	}
	for _, value := range []string{"password", "PASSWORD1234", "12345678", strings.Repeat("a", 8), strings.Repeat(" ", 12)} {
		if ValidatePassword(value) != ErrWeakPassword {
			t.Errorf("weak password accepted")
		}
	}
}

func TestHashVerifyNoPasswordNormalization(t *testing.T) {
	password := " 中文密 A码 "
	hash, err := Hash(password)
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateHash(hash); err != nil {
		t.Fatal(err)
	}
	second, err := Hash(password)
	if err != nil {
		t.Fatal(err)
	}
	if hash == second {
		t.Fatal("independent hashes reused a salt")
	}
	if !Verify(hash, password) {
		t.Fatal("correct password did not verify")
	}
	for _, wrong := range []string{strings.TrimSpace(password), strings.ToLower(password), password + "x"} {
		if Verify(hash, wrong) {
			t.Fatal("changed password verified")
		}
	}
	if Verify(hash, strings.Repeat("x", 513)) {
		t.Fatal("oversized password verified")
	}
	if _, err := Hash("short"); err != ErrInvalidPassword {
		t.Fatal("hash did not enforce password policy")
	}
}

func TestInvalidHashRejectedBeforeArgon2(t *testing.T) {
	good := PlaceholderHash()
	bad := []string{"", "argon2", strings.Replace(good, "argon2id", "argon2i", 1), strings.Replace(good, "v=19", "v=16", 1), strings.Replace(good, "m=19456", "m=4294967295", 1), strings.Replace(good, "m=19456", "m=19455", 1), strings.Replace(good, "m=19456", "m=019456", 1), strings.Replace(good, "t=2", "t=0", 1), strings.Replace(good, "t=2", "t=999999999999999999999", 1), strings.Replace(good, "p=1", "p=255", 1), strings.Replace(good, "p=1", "p=0", 1), good + "$extra", good + "=", strings.Repeat("a", 257)}
	parts := strings.Split(good, "$")
	original := parts[4]
	parts[4] = "YWJj"
	bad = append(bad, strings.Join(parts, "$"))
	parts[4] = original
	parts[5] = "YWJj"
	bad = append(bad, strings.Join(parts, "$"))
	for _, value := range bad {
		if ValidateHash(value) != ErrInvalidHash {
			t.Errorf("malformed hash accepted")
		}
		if ok, err := VerifyWithError(value, "otherwise valid password"); ok || err != ErrInvalidHash {
			t.Errorf("invalid hash reached verifier")
		}
	}
	if PlaceholderHash() != good {
		t.Fatal("placeholder changed inside process")
	}
	if Verify(good, "this is not the placeholder password") {
		t.Fatal("unknown account placeholder verified")
	}
}

func TestTemporaryPasswordFitsPolicy(t *testing.T) {
	password, err := GenerateTemporaryPassword()
	if err != nil {
		t.Fatal(err)
	}
	if len(password) != 12 || ValidatePassword(password) != nil {
		t.Fatal("generated password does not meet the 8-12 character policy")
	}
}

func TestExistingLongPasswordStillVerifies(t *testing.T) {
	const password = "Legacy password from old policy"
	const hash = "$argon2id$v=19$m=19456,t=2,p=1$4KpdxfKRXJ0EoMXDcOx5gw$BakhqK9dxWzdGusnGDZZ/gQnbPgAl5+DUIgnUUkSNCo"
	if ValidatePassword(password) != ErrInvalidPassword {
		t.Fatal("new long password was accepted")
	}
	if !Verify(hash, password) {
		t.Fatal("existing password was invalidated by the new creation policy")
	}
	if Verify(hash, password+"x") {
		t.Fatal("wrong legacy password was accepted")
	}
}
