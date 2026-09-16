package jwt_test

import (
	"testing"
	"time"

	"github.com/getfider/fider/app/pkg/jwt"
)

func validPasswordClaims() jwt.PasswordClaims {
	issued := time.Now().Add(-time.Minute)
	return jwt.PasswordClaims{UserID: 1, TenantID: 2, Version: jwt.PasswordAuthVersion, Purpose: jwt.PasswordSessionPurpose, SecurityStamp: "test-security-stamp", Metadata: jwt.Metadata{IssuedAt: jwt.Time(issued), ExpiresAt: jwt.Time(issued.Add(12 * time.Hour))}}
}

func TestPasswordClaimsValidPurposesAndLifetimes(t *testing.T) {
	for _, test := range []struct {
		purpose  string
		lifetime time.Duration
	}{{jwt.PasswordSessionPurpose, 12 * time.Hour}, {jwt.PasswordChangePurpose, 10 * time.Minute}} {
		t.Run(test.purpose, func(t *testing.T) {
			claims := validPasswordClaims()
			claims.Purpose = test.purpose
			claims.ExpiresAt = jwt.Time(claims.IssuedAt.Add(test.lifetime))
			token, err := jwt.Encode(claims)
			if err != nil {
				t.Fatal(err)
			}
			decoded, err := jwt.DecodePasswordClaims(token)
			if err != nil {
				t.Fatal(err)
			}
			if decoded.UserID != claims.UserID || decoded.TenantID != claims.TenantID || decoded.Purpose != test.purpose || decoded.SecurityStamp != claims.SecurityStamp {
				t.Fatal("signed identity did not survive decoding")
			}
		})
	}
}

func TestPasswordClaimsRejectMissingIdentityAndInvalidTime(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*jwt.PasswordClaims)
	}{
		{"missing user", func(c *jwt.PasswordClaims) { c.UserID = 0 }},
		{"missing tenant", func(c *jwt.PasswordClaims) { c.TenantID = 0 }},
		{"missing version", func(c *jwt.PasswordClaims) { c.Version = 0 }},
		{"unknown version", func(c *jwt.PasswordClaims) { c.Version = jwt.PasswordAuthVersion + 1 }},
		{"missing stamp", func(c *jwt.PasswordClaims) { c.SecurityStamp = "" }},
		{"missing purpose", func(c *jwt.PasswordClaims) { c.Purpose = "" }},
		{"unknown purpose", func(c *jwt.PasswordClaims) { c.Purpose = "signup" }},
		{"missing issue time", func(c *jwt.PasswordClaims) { c.IssuedAt = nil }},
		{"missing expiry", func(c *jwt.PasswordClaims) { c.ExpiresAt = nil }},
		{"expired", func(c *jwt.PasswordClaims) { c.ExpiresAt = jwt.Time(time.Now().Add(-time.Second)) }},
		{"future issue time", func(c *jwt.PasswordClaims) { c.IssuedAt = jwt.Time(time.Now().Add(2 * time.Minute)) }},
		{"zero lifetime", func(c *jwt.PasswordClaims) { c.ExpiresAt = c.IssuedAt }},
		{"full session too long", func(c *jwt.PasswordClaims) { c.ExpiresAt = jwt.Time(c.IssuedAt.Add(12*time.Hour + time.Second)) }},
		{"restricted session too long", func(c *jwt.PasswordClaims) {
			c.Purpose = jwt.PasswordChangePurpose
			c.ExpiresAt = jwt.Time(c.IssuedAt.Add(10*time.Minute + time.Second))
		}},
	} {
		t.Run(test.name, func(t *testing.T) {
			claims := validPasswordClaims()
			test.mutate(&claims)
			token, err := jwt.Encode(claims)
			if err != nil {
				t.Fatal(err)
			}
			if decoded, err := jwt.DecodePasswordClaims(token); err == nil || decoded != nil {
				t.Fatal("signed but invalid password claims were accepted")
			}
		})
	}
}

func TestPasswordClaimsRejectLegacyIdentity(t *testing.T) {
	token, err := jwt.Encode(jwt.FiderClaims{UserID: 1, Origin: jwt.FiderClaimsOriginUI, SecurityStamp: "legacy-stamp", Metadata: validPasswordClaims().Metadata})
	if err != nil {
		t.Fatal(err)
	}
	if decoded, err := jwt.DecodePasswordClaims(token); err == nil || decoded != nil {
		t.Fatal("legacy signed login token was accepted as password identity")
	}
}
