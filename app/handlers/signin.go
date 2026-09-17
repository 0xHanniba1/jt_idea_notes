package handlers

import (
	"net/http"

	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/web"
)

// SignInPage renders the sign in page
func SignInPage() web.HandlerFunc {
	return func(c *web.Context) error {
		c.Response.Header().Set("Cache-Control", "no-store")
		if c.IsAuthenticated() {
			return c.Redirect("/")
		}
		if c.PasswordClaims() != nil {
			return c.Redirect("/password/change-required")
		}
		return c.Page(http.StatusOK, web.Props{Page: "SignIn/SignIn.page", Title: i18n.T(c, "auth.signin.title")})
	}
}
