package jwt

import (
	"errors"
	"time"
)

const PasswordAuthVersion = 1
const PasswordSessionPurpose = "session"
const PasswordChangePurpose = "password-change"

// PasswordClaims cannot be decoded as a legacy Fider login identity.
type PasswordClaims struct {
	UserID        int    `json:"uid"`
	TenantID      int    `json:"tid"`
	Version       int    `json:"av"`
	Purpose       string `json:"purpose"`
	SecurityStamp string `json:"stamp"`
	Metadata
}

func (c PasswordClaims) Valid() error {
	if err := c.Metadata.Valid(); err != nil {
		return err
	}
	if c.UserID <= 0 || c.TenantID <= 0 || c.Version != PasswordAuthVersion || c.SecurityStamp == "" || c.ExpiresAt == nil || c.IssuedAt == nil {
		return errors.New("invalid password session")
	}
	limit := 12 * time.Hour
	if c.Purpose == PasswordChangePurpose {
		limit = 10 * time.Minute
	} else if c.Purpose != PasswordSessionPurpose {
		return errors.New("invalid session purpose")
	}
	if c.ExpiresAt.Sub(c.IssuedAt.Time) <= 0 || c.ExpiresAt.Sub(c.IssuedAt.Time) > limit || c.IssuedAt.After(time.Now().Add(time.Minute)) {
		return errors.New("invalid session lifetime")
	}
	return nil
}

func DecodePasswordClaims(token string) (*PasswordClaims, error) {
	c := &PasswordClaims{}
	if err := decode(token, c); err != nil {
		return nil, err
	}
	return c, nil
}
