package handlers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/handlers"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/jwt"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/pkg/passwordauth"
	"github.com/getfider/fider/app/pkg/web"
)

const passwordHandlerCurrent = "A test account temporary password!"
const passwordHandlerNew = "A different new account password!"

var passwordHandlerSequence atomic.Int64
var passwordHandlerHash struct {
	sync.Once
	value string
	err   error
}

func newPasswordHandlerFixture(t *testing.T, mustChange bool) (*mock.Server, *entity.PasswordCredential) {
	t.Helper()
	previousMode, previousURL := env.Config.HostMode, env.Config.BaseURL
	t.Cleanup(func() { env.Config.HostMode = previousMode; env.Config.BaseURL = previousURL })
	env.Config.BaseURL = "https://password-handler.test"
	server := mock.NewSingleTenantServer()
	sequence := int(passwordHandlerSequence.Add(1))
	tenant := &entity.Tenant{ID: 10000 + sequence, Name: "Password test", Status: enum.TenantActive, Locale: "en"}
	username := fmt.Sprintf("handler.user%d", sequence)
	user := &entity.User{ID: 100 + sequence, Tenant: tenant, Name: "Test account", Username: username, Role: enum.RoleAdministrator, Status: enum.UserActive, SecurityStamp: fmt.Sprintf("handler-stamp-%d", sequence), PasswordInitialized: true, MustChangePassword: mustChange}
	passwordHandlerHash.Do(func() { passwordHandlerHash.value, passwordHandlerHash.err = passwordauth.Hash(passwordHandlerCurrent) })
	if passwordHandlerHash.err != nil {
		t.Fatal(passwordHandlerHash.err)
	}
	credential := &entity.PasswordCredential{User: user, Username: username, PasswordHash: passwordHandlerHash.value, MustChangePassword: mustChange}
	server.OnTenant(tenant).WithURL(env.Config.BaseURL+"/_api/auth/password/signin").AddHeader("Accept", "application/json")
	return server, credential
}

func passwordHandlerBody(t *testing.T, values map[string]any) string {
	t.Helper()
	encoded, err := json.Marshal(values)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}

func passwordHandlerIdentity(credential *entity.PasswordCredential) web.MiddlewareFunc {
	return func(next web.HandlerFunc) web.HandlerFunc {
		return func(c *web.Context) error {
			purpose := jwt.PasswordSessionPurpose
			if credential.MustChangePassword {
				purpose = jwt.PasswordChangePurpose
			}
			c.SetPasswordIdentity(&jwt.PasswordClaims{UserID: credential.User.ID, TenantID: credential.User.Tenant.ID, Version: jwt.PasswordAuthVersion, Purpose: purpose, SecurityStamp: credential.User.SecurityStamp}, credential)
			if !credential.MustChangePassword {
				c.SetUser(credential.User)
			}
			return next(c)
		}
	}
}

func assertNoPasswordHandlerCookie(t *testing.T, response *httptest.ResponseRecorder) {
	t.Helper()
	for _, cookie := range response.Result().Cookies() {
		if cookie.Value != "" && (cookie.Name == web.CookiePasswordSession || cookie.Name == web.CookiePasswordChange || cookie.Name == web.CookieAuthName || cookie.Name == web.CookieSignUpAuthName) {
			t.Fatalf("failure issued a live authentication cookie: %s", cookie.Name)
		}
	}
}

func assertPasswordHandlerCookieCleared(t *testing.T, response *httptest.ResponseRecorder, name string) {
	t.Helper()
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == name && cookie.Domain == "" && cookie.Value == "" && cookie.MaxAge < 0 && cookie.Path == "/" {
			return
		}
	}
	t.Fatalf("cookie was not cleared: %s", name)
}

func TestPasswordSignInNextCookiesAndLegacyCleanup(t *testing.T) {
	for _, test := range []struct {
		name              string
		mustChange, https bool
	}{
		{"normal HTTPS session", false, true}, {"first password change", true, true}, {"local HTTP session", false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, test.mustChange)
			if !test.https {
				env.Config.BaseURL = "http://password-handler.test"
				server.WithURL(env.Config.BaseURL + "/_api/auth/password/signin")
			}
			reads, locks := 0, 0
			bus.AddHandler(func(ctx context.Context, q *query.GetPasswordCredential) error {
				if q.Lock {
					locks++
					if q.UserID != credential.User.ID || q.Username != "" {
						t.Error("final validation did not use the same user ID")
					}
				} else {
					reads++
					if q.Username != credential.Username {
						t.Error("login name was not normalized")
					}
				}
				q.Result = credential
				return nil
			})
			server.AddCookie(web.CookieAuthName, "legacy-auth").AddCookie(web.CookieSignUpAuthName, "legacy-signup").AddCookie(web.CookiePasswordSession, "previous-full-session").AddCookie(web.CookiePasswordChange, "previous-change-session")
			status, response := server.ExecutePost(handlers.PasswordSignIn(), passwordHandlerBody(t, map[string]any{"username": "  " + strings.ToUpper(credential.Username) + "  ", "password": passwordHandlerCurrent}))
			if status != http.StatusOK {
				t.Fatalf("sign in returned %d: %s", status, response.Body.String())
			}
			expectedName, expectedPurpose, expectedNext, lifetime := web.CookiePasswordSession, jwt.PasswordSessionPurpose, "signed_in", 12*time.Hour
			if test.mustChange {
				expectedName, expectedPurpose, expectedNext, lifetime = web.CookiePasswordChange, jwt.PasswordChangePurpose, "password_change_required", 10*time.Minute
			}
			var payload struct {
				Next string `json:"next"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload.Next != expectedNext {
				t.Fatal("incorrect next state")
			}
			if reads != 1 || locks != 1 {
				t.Fatalf("password proof was not followed by locked validation: reads=%d locks=%d", reads, locks)
			}
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("authentication response is cacheable")
			}
			live := []*http.Cookie{}
			for _, cookie := range response.Result().Cookies() {
				if cookie.Value != "" {
					live = append(live, cookie)
				}
			}
			if len(live) != 1 {
				t.Fatalf("expected one live identity cookie, got %d", len(live))
			}
			cookie := live[0]
			if cookie.Name != expectedName || cookie.Domain != "" || cookie.Path != "/" || !cookie.HttpOnly || cookie.Secure != test.https || cookie.SameSite != http.SameSiteLaxMode {
				t.Fatalf("incorrect cookie name or security attributes: %s", cookie.Name)
			}
			if cookie.MaxAge < int(lifetime.Seconds())-3 || cookie.MaxAge > int(lifetime.Seconds()) {
				t.Fatal("incorrect cookie lifetime")
			}
			claims, err := jwt.DecodePasswordClaims(cookie.Value)
			if err != nil {
				t.Fatal(err)
			}
			if claims.UserID != credential.User.ID || claims.TenantID != credential.User.Tenant.ID || claims.Purpose != expectedPurpose || claims.SecurityStamp != credential.User.SecurityStamp || claims.Version != jwt.PasswordAuthVersion {
				t.Fatal("incorrect session identity/purpose")
			}
			if claims.ExpiresAt.Sub(claims.IssuedAt.Time) != lifetime {
				t.Fatal("JWT lifetime differs from expected purpose")
			}
			for _, name := range []string{web.CookiePasswordSession, web.CookiePasswordChange, web.CookieAuthName, web.CookieSignUpAuthName} {
				assertPasswordHandlerCookieCleared(t, response, name)
			}
		})
	}
}

func TestPasswordSignInFailuresAreIndistinguishable(t *testing.T) {
	expectedBody := ""
	for _, scenario := range []string{"wrong password", "unknown account", "blocked account", "stamp changed after verification"} {
		t.Run(scenario, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, false)
			lockedCalls := 0
			bus.AddHandler(func(ctx context.Context, q *query.GetPasswordCredential) error {
				if scenario == "unknown account" {
					return app.ErrNotFound
				}
				copyCredential := *credential
				copyUser := *credential.User
				copyCredential.User = &copyUser
				if scenario == "blocked account" {
					copyUser.Status = enum.UserBlocked
				}
				if q.Lock {
					lockedCalls++
					if scenario == "stamp changed after verification" {
						copyUser.SecurityStamp = "replaced-during-password-verification"
					}
				}
				q.Result = &copyCredential
				return nil
			})
			password := passwordHandlerCurrent
			if scenario == "wrong password" {
				password = "A deliberately incorrect password!"
			}
			status, response := server.ExecutePost(handlers.PasswordSignIn(), passwordHandlerBody(t, map[string]any{"username": credential.Username, "password": password}))
			if status != http.StatusUnauthorized {
				t.Fatalf("failed sign in returned %d", status)
			}
			if expectedBody == "" {
				expectedBody = response.Body.String()
			} else if response.Body.String() != expectedBody {
				t.Fatal("login failures reveal account state")
			}
			if !strings.Contains(response.Body.String(), "Incorrect login name or password.") {
				t.Fatal("expected generic login message")
			}
			for _, secret := range []string{credential.Username, credential.PasswordHash, credential.User.SecurityStamp, password} {
				if strings.Contains(response.Body.String(), secret) {
					t.Fatal("failed login leaked input or credentials")
				}
			}
			if scenario == "stamp changed after verification" && lockedCalls != 1 {
				t.Fatal("stamp race did not reach final locked check")
			}
			assertNoPasswordHandlerCookie(t, response)
		})
	}
}

func TestPasswordSignInCommitFailureDoesNotIssueCookie(t *testing.T) {
	server, credential := newPasswordHandlerFixture(t, false)
	bus.AddHandler(func(ctx context.Context, q *query.GetPasswordCredential) error {
		q.Result = credential
		if q.Lock {
			ctx.(*web.Context).Rollback()
		}
		return nil
	})
	status, response := server.ExecutePost(handlers.PasswordSignIn(), passwordHandlerBody(t, map[string]any{"username": credential.Username, "password": passwordHandlerCurrent}))
	if status != http.StatusInternalServerError {
		t.Fatalf("failed commit returned success/status %d", status)
	}
	if strings.Contains(response.Body.String(), "signed_in") || strings.Contains(response.Body.String(), "password_change_required") {
		t.Fatal("failed commit returned successful next state")
	}
	assertNoPasswordHandlerCookie(t, response)
}

func TestChangeAccountPasswordValidation(t *testing.T) {
	for _, test := range []struct{ name, current, next, confirm, field string }{
		{"wrong current", "An incorrect current password!", passwordHandlerNew, passwordHandlerNew, "currentPassword"},
		{"same password", passwordHandlerCurrent, passwordHandlerCurrent, passwordHandlerCurrent, "newPassword"},
		{"confirmation mismatch", passwordHandlerCurrent, passwordHandlerNew, "Not the same confirmation password!", "confirmPassword"},
		{"too short", passwordHandlerCurrent, "short", "short", "newPassword"},
	} {
		t.Run(test.name, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, false)
			server.Use(passwordHandlerIdentity(credential))
			commands := 0
			bus.AddHandler(func(ctx context.Context, c *cmd.ChangePassword) error { commands++; return nil })
			status, response := server.ExecutePost(handlers.ChangeAccountPassword(false), passwordHandlerBody(t, map[string]any{"currentPassword": test.current, "newPassword": test.next, "confirmPassword": test.confirm}))
			if status != http.StatusBadRequest || commands != 0 {
				t.Fatalf("invalid change reached storage or incorrect status: %d/%d", status, commands)
			}
			if !strings.Contains(response.Body.String(), `"field":"`+test.field+`"`) {
				t.Fatal("validation error is not attached to the correct field")
			}
			assertNoPasswordHandlerCookie(t, response)
		})
	}
}

func TestChangeAccountPasswordCommitsThenRequiresLogin(t *testing.T) {
	for _, required := range []bool{false, true} {
		t.Run(fmt.Sprintf("required=%t", required), func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, required)
			server.Use(passwordHandlerIdentity(credential))
			var command *cmd.ChangePassword
			var request *web.Context
			bus.AddHandler(func(ctx context.Context, c *cmd.ChangePassword) error {
				command = c
				request = ctx.(*web.Context)
				return nil
			})
			input := map[string]any{"newPassword": passwordHandlerNew, "confirmPassword": passwordHandlerNew}
			if !required {
				input["currentPassword"] = passwordHandlerCurrent
			}
			status, response := server.ExecutePost(handlers.ChangeAccountPassword(required), passwordHandlerBody(t, input))
			if status != http.StatusOK || command == nil {
				t.Fatalf("password change failed: %d", status)
			}
			if command.UserID != credential.User.ID || command.ExpectedStamp != credential.User.SecurityStamp || command.RequireChange != required {
				t.Fatal("password change lost validated identity/state")
			}
			if !passwordauth.Verify(command.PasswordHash, passwordHandlerNew) || passwordauth.Verify(command.PasswordHash, passwordHandlerCurrent) {
				t.Fatal("stored value is not a hash of the new password")
			}
			if !request.TransactionFinished() {
				t.Fatal("password change replied before transaction completion")
			}
			assertNoPasswordHandlerCookie(t, response)
			for _, name := range []string{web.CookiePasswordSession, web.CookiePasswordChange, web.CookieAuthName, web.CookieSignUpAuthName} {
				assertPasswordHandlerCookieCleared(t, response, name)
			}
		})
	}
}

func TestChangeAccountPasswordRejectsStaleStateAndCommitFailure(t *testing.T) {
	for _, scenario := range []string{"storage conflict", "commit failure", "wrong required state"} {
		t.Run(scenario, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, false)
			server.Use(passwordHandlerIdentity(credential))
			commands := 0
			bus.AddHandler(func(ctx context.Context, c *cmd.ChangePassword) error {
				commands++
				if scenario == "storage conflict" {
					return passwordauth.ErrConflict
				}
				ctx.(*web.Context).Rollback()
				return nil
			})
			status, response := server.ExecutePost(handlers.ChangeAccountPassword(scenario == "wrong required state"), passwordHandlerBody(t, map[string]any{"currentPassword": passwordHandlerCurrent, "newPassword": passwordHandlerNew, "confirmPassword": passwordHandlerNew}))
			expected := http.StatusConflict
			if scenario == "commit failure" {
				expected = http.StatusInternalServerError
			}
			if scenario == "wrong required state" {
				expected = http.StatusUnauthorized
				if commands != 0 {
					t.Fatal("wrong required state reached storage")
				}
			}
			if status != expected {
				t.Fatalf("expected status %d, got %d", expected, status)
			}
			assertNoPasswordHandlerCookie(t, response)
		})
	}
}

func TestManagePasswordAccountDispatchesValidatedCommands(t *testing.T) {
	for _, operation := range []string{"create", "initialize", "reset", "restore"} {
		t.Run(operation, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, false)
			server.Use(passwordHandlerIdentity(credential))
			targetID := 42
			param := "id"
			if operation == "restore" {
				param = "userID"
			}
			server.AddParam(param, targetID)
			locked := 0
			bus.AddHandler(func(ctx context.Context, q *query.GetPasswordCredential) error {
				if !q.Lock || q.UserID != credential.User.ID {
					t.Error("administrator was not revalidated under a lock")
				}
				locked++
				q.Result = credential
				return nil
			})
			var created *cmd.CreatePasswordAccount
			var initialized *cmd.InitializePasswordAccount
			var reset *cmd.ResetPasswordAccount
			var request *web.Context
			bus.AddHandler(func(ctx context.Context, c *cmd.CreatePasswordAccount) error {
				created = c
				request = ctx.(*web.Context)
				c.Result = &entity.User{ID: targetID}
				return nil
			})
			bus.AddHandler(func(ctx context.Context, c *cmd.InitializePasswordAccount) error {
				initialized = c
				request = ctx.(*web.Context)
				return nil
			})
			bus.AddHandler(func(ctx context.Context, c *cmd.ResetPasswordAccount) error {
				reset = c
				request = ctx.(*web.Context)
				return nil
			})
			status, response := server.ExecutePost(handlers.ManagePasswordAccount(operation), passwordHandlerBody(t, map[string]any{"username": "  New.Member  ", "name": "  新同事  ", "password": passwordHandlerNew, "role": "visitor"}))
			if status != http.StatusOK || locked != 1 || request == nil || !request.TransactionFinished() {
				t.Fatalf("account operation failed to commit: %s status=%d lock=%d", operation, status, locked)
			}
			hash := ""
			switch operation {
			case "create":
				if created == nil || initialized != nil || reset != nil || created.Username != "new.member" || created.Name != "新同事" || created.Role != enum.RoleVisitor || created.Offline {
					t.Fatal("incorrect create-account command")
				}
				hash = created.PasswordHash
			case "initialize":
				if initialized == nil || created != nil || reset != nil || initialized.UserID != targetID || initialized.Username != "new.member" || initialized.Offline {
					t.Fatal("incorrect initialize-account command")
				}
				hash = initialized.PasswordHash
			default:
				if reset == nil || created != nil || initialized != nil || reset.UserID != targetID || reset.Restore != (operation == "restore") || reset.Offline {
					t.Fatal("incorrect reset/restore-account command")
				}
				hash = reset.PasswordHash
			}
			if !passwordauth.Verify(hash, passwordHandlerNew) {
				t.Fatal("account command does not contain the validated password hash")
			}
			var payload struct {
				ID int `json:"id"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload.ID != targetID {
				t.Fatal("account response lost target user identity")
			}
			if strings.Contains(response.Body.String(), hash) || strings.Contains(response.Body.String(), passwordHandlerNew) {
				t.Fatal("account operation returned credential secrets")
			}
			assertNoPasswordHandlerCookie(t, response)
		})
	}
}

func TestManagePasswordAccountCannotOperateOnSelf(t *testing.T) {
	for _, operation := range []string{"initialize", "reset", "restore"} {
		t.Run(operation, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, false)
			server.Use(passwordHandlerIdentity(credential))
			param := "id"
			if operation == "restore" {
				param = "userID"
			}
			server.AddParam(param, credential.User.ID)
			queries, commands := 0, 0
			bus.AddHandler(func(ctx context.Context, q *query.GetPasswordCredential) error {
				queries++
				q.Result = credential
				return nil
			})
			bus.AddHandler(func(ctx context.Context, c *cmd.InitializePasswordAccount) error { commands++; return nil })
			bus.AddHandler(func(ctx context.Context, c *cmd.ResetPasswordAccount) error { commands++; return nil })
			status, response := server.ExecutePost(handlers.ManagePasswordAccount(operation), passwordHandlerBody(t, map[string]any{"username": "another.name", "password": passwordHandlerNew}))
			if status != http.StatusForbidden || queries != 0 || commands != 0 {
				t.Fatalf("self operation was not rejected before storage: %d/%d/%d", status, queries, commands)
			}
			assertNoPasswordHandlerCookie(t, response)
		})
	}
}

func TestManagePasswordAccountRequiresCurrentAdministrator(t *testing.T) {
	for _, scenario := range []string{"anonymous", "member", "collaborator", "revoked stamp", "demoted after authentication", "blocked after authentication", "pending change after authentication"} {
		t.Run(scenario, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, false)
			switch scenario {
			case "member":
				credential.User.Role = enum.RoleVisitor
			case "collaborator":
				credential.User.Role = enum.RoleCollaborator
			}
			if scenario != "anonymous" {
				server.Use(passwordHandlerIdentity(credential))
			}
			server.AddParam("id", 42)
			commands := 0
			bus.AddHandler(func(ctx context.Context, q *query.GetPasswordCredential) error {
				changed := *credential
				user := *credential.User
				changed.User = &user
				switch scenario {
				case "revoked stamp":
					user.SecurityStamp = "new-stamp-after-auth"
				case "demoted after authentication":
					user.Role = enum.RoleVisitor
				case "blocked after authentication":
					user.Status = enum.UserBlocked
				case "pending change after authentication":
					changed.MustChangePassword = true
				}
				q.Result = &changed
				return nil
			})
			bus.AddHandler(func(ctx context.Context, c *cmd.ResetPasswordAccount) error { commands++; return nil })
			status, response := server.ExecutePost(handlers.ManagePasswordAccount("reset"), passwordHandlerBody(t, map[string]any{"password": passwordHandlerNew}))
			if status != http.StatusForbidden || commands != 0 {
				t.Fatalf("unauthorized administrator operation reached storage: %d/%d", status, commands)
			}
			assertNoPasswordHandlerCookie(t, response)
		})
	}
}

func TestManagePasswordAccountCommitFailureAndInputBoundary(t *testing.T) {
	for _, scenario := range []string{"commit failure", "offline input", "duplicate name"} {
		t.Run(scenario, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, false)
			server.Use(passwordHandlerIdentity(credential))
			bus.AddHandler(func(ctx context.Context, q *query.GetPasswordCredential) error { q.Result = credential; return nil })
			commands := 0
			bus.AddHandler(func(ctx context.Context, c *cmd.CreatePasswordAccount) error {
				commands++
				if scenario == "duplicate name" {
					return passwordauth.ErrUsernameTaken
				}
				c.Result = &entity.User{ID: 42}
				ctx.(*web.Context).Rollback()
				return nil
			})
			body := map[string]any{"username": "new.member", "name": "New member", "role": "visitor", "password": passwordHandlerNew}
			if scenario == "offline input" {
				body["offline"] = true
			}
			status, response := server.ExecutePost(handlers.ManagePasswordAccount("create"), passwordHandlerBody(t, body))
			expected := http.StatusBadRequest
			if scenario == "commit failure" {
				expected = http.StatusInternalServerError
			}
			if status != expected {
				t.Fatalf("incorrect failure status: %d", status)
			}
			if scenario == "offline input" && commands != 0 {
				t.Fatal("HTTP input accepted internal Offline capability")
			}
			if scenario != "offline input" && commands != 1 {
				t.Fatal("test did not reach command execution")
			}
			if strings.Contains(response.Body.String(), `"id":42`) {
				t.Fatal("failed commit returned successful account identity")
			}
			if scenario == "duplicate name" && !strings.Contains(response.Body.String(), `"field":"username"`) {
				t.Fatal("duplicate name is not attached to login-name field")
			}
			assertNoPasswordHandlerCookie(t, response)
		})
	}
}
