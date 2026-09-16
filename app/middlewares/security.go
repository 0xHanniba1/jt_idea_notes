package middlewares

import (
	"fmt"
	"mime"
	"net/url"
	"strings"

	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/web"
)

// Secure middleware is responsible for
// 1. Setting the HTTP Security Headers
// 2. Protecting from Host attacks
func Secure() web.MiddlewareFunc {
	return func(next web.HandlerFunc) web.HandlerFunc {
		return func(c *web.Context) error {
			cdnHost := env.Config.CDN.Host
			if cdnHost != "" {
				if !env.IsSingleHostMode() {
					cdnHost = "*." + cdnHost
				}
				cdnHost = " " + cdnHost
			}
			csp := fmt.Sprintf(web.CspPolicyTemplate, c.ContextID(), cdnHost)

			c.Response.Header().Set("Content-Security-Policy", strings.TrimSpace(csp))
			c.Response.Header().Set("X-XSS-Protection", "1; mode=block")
			c.Response.Header().Set("X-Content-Type-Options", "nosniff")
			c.Response.Header().Set("Referrer-Policy", "no-referrer-when-downgrade")
			return next(c)
		}
	}
}

// CSRF requires JSON and the configured origin for browser state changes.
// Stripe's signed webhook is registered before this middleware.
func CSRF() web.MiddlewareFunc {
	return func(next web.HandlerFunc) web.HandlerFunc {
		return func(c *web.Context) error {
			if web.IsWriteMethod(c.Request.Method) {
				contentType, _, err := mime.ParseMediaType(c.Request.GetHeader("Content-Type"))
				if err != nil || contentType != web.JSONContentType {
					return c.JSON(403, web.Map{})
				}
				origin := c.Request.GetHeader("Origin")
				fromOrigin := origin != ""
				if !fromOrigin {
					origin = c.Request.GetHeader("Referer")
				}
				expected, expectedErr := url.Parse(c.ConfiguredOrigin())
				provided, providedErr := url.Parse(origin)
				if expectedErr != nil || providedErr != nil || expected == nil || provided == nil || provided.User != nil || provided.Scheme == "" || provided.Host == "" || expected.Scheme != provided.Scheme || !strings.EqualFold(expected.Host, provided.Host) || (fromOrigin && (provided.Path != "" || provided.RawQuery != "" || provided.Fragment != "")) {
					return c.JSON(403, web.Map{})
				}
			}
			return next(c)
		}
	}
}
