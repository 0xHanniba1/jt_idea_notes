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
	for _, value := range []string{"A sufficiently long passphrase", "中文密码允许空格并且长度足够了", " leading and trailing spaces ", strings.Repeat("ab", 64), strings.Repeat("🔒🔑", 64)} {
		if err := ValidatePassword(value); err != nil {
			t.Errorf("valid password rejected: %v", err)
		}
	}
	for _, value := range []string{"short", strings.Repeat("ab", 65), strings.Repeat("🔒", 129), "long but invalid utf8\xff"} {
		if ValidatePassword(value) != ErrInvalidPassword {
			t.Errorf("expected length/encoding rejection")
		}
	}
	for _, value := range []string{"passwordpassword", "PASSWORD12345678", strings.Repeat("a", 15), strings.Repeat(" ", 15)} {
		if ValidatePassword(value) != ErrWeakPassword {
			t.Errorf("weak password accepted")
		}
	}
}

func TestHashVerifyNoPasswordNormalization(t *testing.T) {
	password := "  中文密码与 空格 Exact  "
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
