package middlewares

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/jwt"
	"github.com/getfider/fider/app/pkg/web"
)

// PasswordReady fails closed until an operator has initialized an administrator.
func PasswordReady() web.MiddlewareFunc {
	return func(next web.HandlerFunc) web.HandlerFunc {
		return func(c *web.Context) error {
			origin, err := url.Parse(c.ConfiguredOrigin())
			if err != nil || origin == nil || origin.Host == "" {
				return c.String(http.StatusServiceUnavailable, i18n.T(c, "auth.transport.required"))
			}
			local := origin.Hostname() == "localhost" || strings.HasSuffix(origin.Hostname(), ".localhost")
			if ip := net.ParseIP(origin.Hostname()); ip != nil && ip.IsLoopback() {
				local = true
			}
			insecureDev := env.IsTest() || (env.IsDevelopment() && local)
			if origin.Scheme != "https" && !insecureDev {
				return c.String(http.StatusServiceUnavailable, i18n.T(c, "auth.transport.required"))
			}
			if origin.Scheme == "https" && !c.Request.IsSecure && !env.IsTest() {
				if c.Request.Method == http.MethodGet {
					return c.Redirect(strings.TrimRight(c.ConfiguredOrigin(), "/") + c.Request.URL.RequestURI())
				}
				return c.JSON(http.StatusForbidden, web.Map{})
			}
			q := &query.HasPasswordAdministrator{}
			if err := bus.Dispatch(c, q); err != nil {
				return err
			}
			if !q.Result {
				c.Response.Header().Set("Cache-Control", "no-store")
				return c.String(http.StatusServiceUnavailable, i18n.T(c, "auth.setup.required"))
			}
			return next(c)
		}
	}
}

// RequirePasswordLogin also protects data that used to be anonymously readable.
func RequirePasswordLogin() web.MiddlewareFunc {
	return func(next web.HandlerFunc) web.HandlerFunc {
		return func(c *web.Context) error {
			c.Response.Header().Set("Cache-Control", "private, no-store")
			if c.IsAuthenticated() {
				return next(c)
			}
			target := "/signin"
			if claims := c.PasswordClaims(); claims != nil && claims.Purpose == jwt.PasswordChangePurpose {
				target = "/password/change-required"
			}
			if c.IsAjax() || strings.HasPrefix(c.Request.URL.Path, "/api/") || strings.HasPrefix(c.Request.URL.Path, "/_api/") {
				code := "authentication_required"
				if target != "/signin" {
					code = "password_change_required"
				}
				return c.JSON(http.StatusUnauthorized, web.Map{"code": code})
			}
			if target == "/signin" && c.Request.Method == http.MethodGet && c.Request.URL.Path != "/" {
				target += "?redirect=" + url.QueryEscape(c.Request.URL.RequestURI())
			}
			return c.Redirect(target)
		}
	}
}

func RequirePasswordChange() web.MiddlewareFunc {
	return func(next web.HandlerFunc) web.HandlerFunc {
		return func(c *web.Context) error {
			c.Response.Header().Set("Cache-Control", "no-store")
			if claims := c.PasswordClaims(); claims != nil && claims.Purpose == jwt.PasswordChangePurpose {
				return next(c)
			}
			if c.IsAjax() {
				return c.JSON(http.StatusUnauthorized, web.Map{})
			}
			return c.Redirect("/signin")
		}
	}
}
