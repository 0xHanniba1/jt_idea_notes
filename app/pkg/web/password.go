package web

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/jwt"
)

const CookiePasswordSession = "jt_password_auth"
const CookiePasswordChange = "jt_password_change"

type passwordContextKey int

const passwordClaimsKey passwordContextKey = 0
const passwordCredentialKey passwordContextKey = 1

func (c *Context) SetPasswordIdentity(claims *jwt.PasswordClaims, credential *entity.PasswordCredential) {
	c.Set(passwordClaimsKey, claims)
	c.Set(passwordCredentialKey, credential)
}

func (c *Context) PasswordClaims() *jwt.PasswordClaims {
	claims, _ := c.Value(passwordClaimsKey).(*jwt.PasswordClaims)
	return claims
}

func (c *Context) PasswordCredential() *entity.PasswordCredential {
	credential, _ := c.Value(passwordCredentialKey).(*entity.PasswordCredential)
	return credential
}

// ConfiguredOrigin is independent of attacker-controlled forwarding headers.
func (c *Context) ConfiguredOrigin() string {
	if env.IsSingleHostMode() {
		return strings.TrimRight(env.Config.BaseURL, "/")
	}
	if c.Tenant() != nil {
		return strings.TrimRight(TenantBaseURL(c, c.Tenant()), "/")
	}
	return strings.TrimRight(env.Config.BaseURL, "/")
}

func (c *Context) SetPasswordCookie(name, value string, expires time.Time) {
	origin, _ := url.Parse(c.ConfiguredOrigin())
	secure := origin != nil && origin.Scheme == "https"
	maxAge := int(time.Until(expires).Seconds())
	if value == "" {
		maxAge = -1
		expires = time.Unix(1, 0)
	}
	http.SetCookie(&c.Response, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: maxAge})
}

func (c *Context) ClearPasswordCookies() {
	for _, name := range []string{CookiePasswordSession, CookiePasswordChange, CookieAuthName} {
		c.SetPasswordCookie(name, "", time.Time{})
	}
	// Retire both historical transfer-cookie scopes without ever reading their identity.
	c.SetPasswordCookie(CookieSignUpAuthName, "", time.Time{})
	if domain := env.MultiTenantDomain(); domain != "" {
		http.SetCookie(&c.Response, &http.Cookie{Name: CookieSignUpAuthName, Path: "/", Domain: domain, HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(1, 0)})
	}
}

func IsPasswordRequest(path string) bool {
	return strings.HasPrefix(path, "/_api/auth/") || strings.HasPrefix(path, "/_api/admin/accounts") || strings.HasPrefix(path, "/_api/admin/users/")
}

func IsWriteMethod(method string) bool {
	return method == http.MethodPost || method == http.MethodPut || method == http.MethodPatch || method == http.MethodDelete
}
