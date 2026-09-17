package middlewares

import (
	"strings"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/errors"
	"github.com/getfider/fider/app/pkg/jwt"
	"github.com/getfider/fider/app/pkg/web"
)

// User accepts only this deployment's password session format. Legacy Fider,
// signup handoff, OAuth and API-key credentials never establish an identity.
func User() web.MiddlewareFunc {
	return func(next web.HandlerFunc) web.HandlerFunc {
		return func(c *web.Context) error {
			if c.Request.GetHeader("Authorization") != "" || c.Request.GetHeader("X-Fider-UserID") != "" {
				return c.JSON(401, web.Map{})
			}
			normal, _ := c.Request.Cookie(web.CookiePasswordSession)
			restricted, _ := c.Request.Cookie(web.CookiePasswordChange)
			hasNormal := normal != nil && normal.Value != ""
			hasRestricted := restricted != nil && restricted.Value != ""
			if hasNormal && hasRestricted {
				c.ClearPasswordCookies()
				return c.JSON(401, web.Map{})
			}
			if !hasNormal && !hasRestricted {
				if old, _ := c.Request.Cookie(web.CookieAuthName); old != nil {
					c.ClearPasswordCookies()
				} else if old, _ := c.Request.Cookie(web.CookieSignUpAuthName); old != nil {
					c.ClearPasswordCookies()
				}
				return next(c)
			}
			value, purpose := "", jwt.PasswordSessionPurpose
			if hasNormal {
				value = normal.Value
			} else {
				value = restricted.Value
				purpose = jwt.PasswordChangePurpose
			}
			reject := func() error { c.ClearPasswordCookies(); return next(c) }
			if len(value) > 4096 || c.Tenant() == nil {
				return reject()
			}
			claims, err := jwt.DecodePasswordClaims(value)
			if err != nil || claims.Purpose != purpose || claims.TenantID != c.Tenant().ID {
				return reject()
			}
			// Hashing endpoints take their lock after doing expensive password work.
			restore := c.Request.Method == "DELETE" && strings.HasPrefix(c.Request.URL.Path, "/_api/admin/users/") && strings.HasSuffix(c.Request.URL.Path, "/block")
			getMutation := c.Request.Method == "GET" && (strings.HasPrefix(c.Request.URL.Path, "/notifications/") || strings.HasPrefix(c.Request.URL.Path, "/_api/admin/webhook/test/"))
			writeLock := (web.IsWriteMethod(c.Request.Method) || getMutation) && !strings.HasPrefix(c.Request.URL.Path, "/_api/auth/") && !strings.HasPrefix(c.Request.URL.Path, "/_api/admin/accounts") && !restore
			q := &query.GetPasswordCredential{UserID: claims.UserID, Lock: writeLock}
			if err := bus.Dispatch(c, q); err != nil {
				if errors.Cause(err) == app.ErrNotFound {
					return reject()
				}
				return err
			}
			credential := q.Result
			if credential == nil || credential.User == nil || credential.User.Tenant == nil || credential.User.Tenant.ID != claims.TenantID || credential.User.Status != enum.UserActive || credential.User.SecurityStamp != claims.SecurityStamp || credential.MustChangePassword != (purpose == jwt.PasswordChangePurpose) {
				return reject()
			}
			c.SetPasswordIdentity(claims, credential)
			if purpose == jwt.PasswordSessionPurpose {
				c.SetUser(credential.User)
			}
			return next(c)
		}
	}
}
