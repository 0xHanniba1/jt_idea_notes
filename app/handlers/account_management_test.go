package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/getfider/fider/app/handlers"
	"github.com/getfider/fider/app/handlers/apiv1"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/pkg/passwordauth"
	"github.com/getfider/fider/app/pkg/web"
)

func TestAccountManagementTemporaryPasswordResponse(t *testing.T) {
	for _, operation := range []string{"create", "initialize", "reset", "restore"} {
		for _, supplied := range []bool{false, true} {
			label := operation + "/generated"
			if supplied {
				label = operation + "/supplied"
			}
			t.Run(label, func(t *testing.T) {
				server, credential := newPasswordHandlerFixture(t, false)
				server.Use(passwordHandlerIdentity(credential)).AddParam("id", 42).AddParam("userID", 42)
				bus.AddHandler(func(_ context.Context, q *query.GetPasswordCredential) error {
					q.Result = credential
					return nil
				})
				var hash string
				var request *web.Context
				calls := 0
				capture := func(ctx context.Context, value string) {
					calls++
					hash, request = value, ctx.(*web.Context)
				}
				bus.AddHandler(func(ctx context.Context, c *cmd.CreatePasswordAccount) error {
					capture(ctx, c.PasswordHash)
					c.Result = &entity.User{ID: 42}
					return nil
				})
				bus.AddHandler(func(ctx context.Context, c *cmd.InitializePasswordAccount) error {
					capture(ctx, c.PasswordHash)
					return nil
				})
				bus.AddHandler(func(ctx context.Context, c *cmd.ResetPasswordAccount) error {
					capture(ctx, c.PasswordHash)
					if c.Restore != (operation == "restore") {
						t.Error("restore intent was not preserved")
					}
					return nil
				})
				body := map[string]any{"username": "new.member", "name": "新昵称", "role": "visitor"}
				if supplied {
					body["password"] = passwordHandlerNew
				} else if operation == "reset" {
					// Both an omitted field and an explicitly empty field mean generate.
					body["password"] = ""
				}
				status, response := server.ExecutePost(handlers.ManagePasswordAccount(operation), passwordHandlerBody(t, body))
				if status != http.StatusOK || calls != 1 || request == nil || !request.TransactionFinished() {
					t.Fatalf("account operation did not commit once: status=%d calls=%d", status, calls)
				}
				var result struct {
					ID                int     `json:"id"`
					TemporaryPassword *string `json:"temporaryPassword"`
				}
				if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil || result.ID != 42 {
					t.Fatal("successful response lost account identity")
				}
				password := passwordHandlerNew
				if supplied {
					if result.TemporaryPassword != nil || strings.Contains(response.Body.String(), password) {
						t.Fatal("supplied password was echoed")
					}
				} else {
					if result.TemporaryPassword == nil || passwordauth.ValidatePassword(*result.TemporaryPassword) != nil {
						t.Fatal("generated password is absent or violates the password policy")
					}
					password = *result.TemporaryPassword
				}
				if !passwordauth.Verify(hash, password) {
					t.Fatal("delivered password does not match the persisted command hash")
				}
				if strings.Contains(response.Body.String(), hash) || response.Header().Get("Cache-Control") != "no-store" {
					t.Fatal("credential response leaked its hash or allowed caching")
				}
				assertNoPasswordHandlerCookie(t, response)
			})
		}
	}
}

func TestAccountManagementGeneratedPasswordFailurePrivacy(t *testing.T) {
	for _, scenario := range []string{"duplicate username", "revoked administrator", "commit failure"} {
		t.Run(scenario, func(t *testing.T) {
			server, credential := newPasswordHandlerFixture(t, false)
			server.Use(passwordHandlerIdentity(credential))
			bus.AddHandler(func(_ context.Context, q *query.GetPasswordCredential) error {
				if scenario == "revoked administrator" {
					return passwordauth.ErrUnauthorized
				}
				q.Result = credential
				return nil
			})
			calls, hash := 0, ""
			bus.AddHandler(func(ctx context.Context, c *cmd.CreatePasswordAccount) error {
				calls++
				hash = c.PasswordHash
				if scenario == "duplicate username" {
					return passwordauth.ErrUsernameTaken
				}
				c.Result = &entity.User{ID: 42}
				ctx.(*web.Context).Rollback()
				return nil
			})
			status, response := server.ExecutePost(handlers.ManagePasswordAccount("create"), passwordHandlerBody(t, map[string]any{"username": "new.member", "name": "新昵称", "role": "visitor"}))
			expected, expectedCalls := http.StatusBadRequest, 1
			switch scenario {
			case "revoked administrator":
				expected, expectedCalls = http.StatusForbidden, 0
			case "commit failure":
				expected = http.StatusInternalServerError
			}
			if status != expected || calls != expectedCalls {
				t.Fatalf("incorrect failure boundary: status=%d calls=%d", status, calls)
			}
			body := response.Body.String()
			if strings.Contains(body, "temporaryPassword") || strings.Contains(body, `"id":42`) || (hash != "" && strings.Contains(body, hash)) {
				t.Fatal("failed account operation exposed credential output or success identity")
			}
			assertNoPasswordHandlerCookie(t, response)
		})
	}
}

func TestAccountManagementCreateNicknameCharacterBoundary(t *testing.T) {
	for _, length := range []int{100, 101} {
		server, credential := newPasswordHandlerFixture(t, false)
		server.Use(passwordHandlerIdentity(credential))
		bus.AddHandler(func(_ context.Context, q *query.GetPasswordCredential) error { q.Result = credential; return nil })
		calls := 0
		bus.AddHandler(func(_ context.Context, c *cmd.CreatePasswordAccount) error {
			calls++
			if c.Name != strings.Repeat("字", length) {
				t.Error("nickname was not trimmed")
			}
			c.Result = &entity.User{ID: 42}
			return nil
		})
		status, _ := server.ExecutePost(handlers.ManagePasswordAccount("create"), passwordHandlerBody(t, map[string]any{"username": "new.member", "name": "  " + strings.Repeat("字", length) + "  ", "role": "visitor", "password": passwordHandlerNew}))
		if (length == 100 && (status != http.StatusOK || calls != 1)) || (length == 101 && (status != http.StatusBadRequest || calls != 0)) {
			t.Fatalf("nickname character boundary failed: length=%d status=%d calls=%d", length, status, calls)
		}
	}
}

func TestAccountManagementProfileRejectsUsernameBeforeWriting(t *testing.T) {
	for _, username := range []any{nil, "", "new.login", 123, map[string]any{}} {
		server := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow)
		writes := 0
		bus.AddHandler(func(_ context.Context, _ *cmd.UploadImage) error { writes++; return nil })
		bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUser) error { writes++; return nil })
		bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUserSettings) error { writes++; return nil })
		status, response := server.ExecutePost(handlers.UpdateUserSettings(), passwordHandlerBody(t, map[string]any{"username": username, "name": "新昵称", "avatarType": "gravatar"}))
		if status != http.StatusBadRequest || writes != 0 || !strings.Contains(response.Body.String(), `"field":"username"`) {
			t.Fatalf("username mutation reached writing: status=%d writes=%d", status, writes)
		}
	}
}

func TestAccountManagementProfileNicknameCharacterBoundary(t *testing.T) {
	for _, length := range []int{100, 101} {
		server := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow)
		writes, name := 0, ""
		bus.AddHandler(func(_ context.Context, _ *cmd.UploadImage) error { writes++; return nil })
		bus.AddHandler(func(_ context.Context, c *cmd.UpdateCurrentUser) error { writes++; name = c.Name; return nil })
		bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUserSettings) error { writes++; return nil })
		status, _ := server.ExecutePost(handlers.UpdateUserSettings(), passwordHandlerBody(t, map[string]any{"name": "  " + strings.Repeat("字", length) + "  ", "avatarType": "gravatar"}))
		if length == 100 {
			if status != http.StatusOK || writes != 3 || name != strings.Repeat("字", 100) {
				t.Fatalf("valid trimmed Chinese nickname rejected: status=%d writes=%d", status, writes)
			}
		} else if status != http.StatusBadRequest || writes != 0 {
			t.Fatalf("oversized Chinese nickname reached writing: status=%d writes=%d", status, writes)
		}
	}
}

func TestAccountManagementListStatusValidation(t *testing.T) {
	for _, statusFilter := range []string{"all", "active", "inactive", "blocked", "unknown"} {
		server := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).WithURL("http://demo.test.fider.io/api/v1/users?status=" + statusFilter + "&query=person&roles=visitor&page=2&limit=1")
		calls := 0
		bus.AddHandler(func(_ context.Context, q *query.SearchUsers) error {
			calls++
			if q.Status != statusFilter || q.Query != "person" || len(q.Roles) != 1 || q.Roles[0] != "visitor" || q.Page != 2 || q.Limit != 1 {
				t.Error("list filters were not forwarded together")
			}
			q.Result, q.TotalCount = []*entity.User{}, 0
			return nil
		})
		status, _ := server.Execute(apiv1.ListUsers())
		valid := statusFilter == "all" || statusFilter == "active" || statusFilter == "inactive"
		if (valid && (status != http.StatusOK || calls != 1)) || (!valid && (status != http.StatusBadRequest || calls != 0)) {
			t.Fatalf("incorrect status filter boundary: filter=%s status=%d calls=%d", statusFilter, status, calls)
		}
	}
}
