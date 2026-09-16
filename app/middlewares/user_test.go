package middlewares_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/middlewares"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/jwt"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/pkg/web"
)

func passwordClaims(user *entity.User, purpose string) jwt.PasswordClaims {
	now := time.Now()
	return jwt.PasswordClaims{UserID: user.ID, TenantID: user.Tenant.ID, Version: jwt.PasswordAuthVersion, Purpose: purpose, SecurityStamp: user.SecurityStamp, Metadata: jwt.Metadata{IssuedAt: jwt.Time(now), ExpiresAt: jwt.Time(now.Add(5 * time.Minute))}}
}

func TestUser_PasswordIdentityBoundaries(t *testing.T) {
	cases := []struct {
		name    string
		change  func(*jwt.PasswordClaims, *entity.PasswordCredential)
		cookie  string
		method  string
		want    string
		missing bool
	}{
		{name: "complete session", want: "complete"},
		{name: "write holds authentication lock", method: "POST", want: "complete"},
		{name: "temporary credential", cookie: web.CookiePasswordChange, change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) {
			c.Purpose = jwt.PasswordChangePurpose
			p.MustChangePassword = true
		}, want: "restricted"},
		{name: "expired", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) {
			c.ExpiresAt = jwt.Time(time.Now().Add(-time.Second))
		}, want: "anonymous"},
		{name: "missing stamp", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) { c.SecurityStamp = "" }, want: "anonymous"},
		{name: "old auth version", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) { c.Version = 0 }, want: "anonymous"},
		{name: "reset stamp", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) { p.User.SecurityStamp = "new-stamp" }, want: "anonymous"},
		{name: "blocked", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) { p.User.Status = enum.UserBlocked }, want: "anonymous"},
		{name: "deleted", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) { p.User.Status = enum.UserDeleted }, want: "anonymous"},
		{name: "must change cannot use full cookie", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) { p.MustChangePassword = true }, want: "anonymous"},
		{name: "wrong tenant", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) { c.TenantID++ }, want: "anonymous"},
		{name: "lookup tenant mismatch", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) {
			other := *p.User.Tenant
			other.ID++
			p.User.Tenant = &other
		}, want: "anonymous"},
		{name: "wrong purpose in normal cookie", change: func(c *jwt.PasswordClaims, p *entity.PasswordCredential) {
			c.Purpose = jwt.PasswordChangePurpose
			p.MustChangePassword = true
		}, want: "anonymous"},
		{name: "no credential", missing: true, want: "anonymous"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			server := mock.NewServer()
			u := *mock.JonSnow
			u.SecurityStamp = "original-stamp"
			u.Status = enum.UserActive
			credential := &entity.PasswordCredential{User: &u, Username: "jon.snow"}
			claims := passwordClaims(&u, jwt.PasswordSessionPurpose)
			if test.change != nil {
				test.change(&claims, credential)
			}
			bus.AddHandler(func(_ context.Context, q *query.GetPasswordCredential) error {
				if test.missing {
					return app.ErrNotFound
				}
				if q.UserID != claims.UserID {
					t.Fatal("lookup not scoped to token user")
				}
				if q.Lock != (test.method == "POST") {
					t.Fatalf("unexpected write lock: %v", q.Lock)
				}
				q.Result = credential
				return nil
			})
			token, err := jwt.Encode(claims)
			if err != nil {
				t.Fatal(err)
			}
			cookie := test.cookie
			if cookie == "" {
				cookie = web.CookiePasswordSession
			}
			server.OnTenant(mock.DemoTenant).AddCookie(cookie, token).Use(middlewares.User())
			handler := func(c *web.Context) error {
				state := "anonymous"
				if c.IsAuthenticated() {
					state = "complete"
				} else if c.PasswordClaims() != nil {
					state = "restricted"
				}
				return c.String(http.StatusOK, state)
			}
			var status int
			var body string
			if test.method == "POST" {
				s, r := server.ExecutePost(handler, "{}")
				status = s
				body = r.Body.String()
			} else {
				s, r := server.Execute(handler)
				status = s
				body = r.Body.String()
			}
			if status != 200 || body != test.want {
				t.Fatalf("got %d %q, want %q", status, body, test.want)
			}
		})
	}
}

func TestUser_RetiredCredentialsNeverAuthenticate(t *testing.T) {
	for _, kind := range []string{"legacy JWT", "signup cookie", "API key", "impersonation", "mixed password cookies"} {
		t.Run(kind, func(t *testing.T) {
			s := mock.NewServer().OnTenant(mock.DemoTenant).Use(middlewares.User())
			token, _ := jwt.Encode(jwt.FiderClaims{UserID: mock.JonSnow.ID, SecurityStamp: "old"})
			expected := 204
			switch kind {
			case "legacy JWT":
				s.AddCookie(web.CookieAuthName, token)
			case "signup cookie":
				s.AddCookie(web.CookieSignUpAuthName, token)
			case "API key":
				s.AddHeader("Authorization", "Bearer old-api-key")
				expected = 401
			case "impersonation":
				s.AddHeader("X-Fider-UserID", "2")
				expected = 401
			case "mixed password cookies":
				s.AddCookie(web.CookiePasswordSession, "one").AddCookie(web.CookiePasswordChange, "two")
				expected = 401
			}
			bus.AddHandler(func(_ context.Context, q *query.GetPasswordCredential) error {
				t.Fatal("retired identity reached credential lookup")
				return nil
			})
			status, _ := s.Execute(func(c *web.Context) error {
				if c.IsAuthenticated() || c.PasswordClaims() != nil {
					t.Fatal("retired identity accepted")
				}
				return c.NoContent(204)
			})
			if status != expected {
				t.Fatalf("status %d, want %d", status, expected)
			}
		})
	}
}

func TestPasswordChangeCannotReadBusinessRoutes(t *testing.T) {
	for _, path := range []string{"/", "/roadmap", "/api/v1/posts", "/_api/notifications/unread", "/admin/export/backup.zip", "/static/images/private-image"} {
		t.Run(path, func(t *testing.T) {
			s := mock.NewServer()
			u := *mock.JonSnow
			u.SecurityStamp = "temporary-stamp"
			u.Status = enum.UserActive
			bus.AddHandler(func(_ context.Context, q *query.GetPasswordCredential) error {
				q.Result = &entity.PasswordCredential{User: &u, MustChangePassword: true}
				return nil
			})
			token, _ := jwt.Encode(passwordClaims(&u, jwt.PasswordChangePurpose))
			s.OnTenant(mock.DemoTenant).WithURL("http://demo.test.fider.io"+path).AddCookie(web.CookiePasswordChange, token).Use(middlewares.User()).Use(middlewares.RequirePasswordLogin())
			status, res := s.Execute(func(c *web.Context) error { t.Fatal("business handler reached"); return nil })
			if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/_api/") {
				if status != 401 {
					t.Fatalf("status %d", status)
				}
			} else if status != 307 || res.Header().Get("Location") != "/password/change-required" {
				t.Fatalf("unexpected redirect %d %q", status, res.Header().Get("Location"))
			}
		})
	}
}

func TestPasswordLoginRequiredEvenForFormerPublicTenant(t *testing.T) {
	s := mock.NewServer().OnTenant(mock.DemoTenant).AddHeader("Accept", "application/json").Use(middlewares.RequirePasswordLogin())
	mock.DemoTenant.IsPrivate = false
	status, _ := s.Execute(func(c *web.Context) error { t.Fatal("anonymous handler reached"); return nil })
	if status != 401 {
		t.Fatalf("status %d", status)
	}
}
