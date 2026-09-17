package postgres_test

import (
	"context"
	"strings"
	"testing"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/passwordauth"
)

func TestAccountManagementGeneratedCredentialAndNicknameIdentity(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	admin := passwordAccountForTest(t, jonSnow, "jon.snow")
	password, err := passwordauth.GenerateTemporaryPassword()
	if err != nil {
		t.Fatal(err)
	}
	hash, err := passwordauth.Hash(password)
	if err != nil {
		t.Fatal(err)
	}
	create := &cmd.CreatePasswordAccount{Username: "  New.Member  ", Name: strings.Repeat("字", 100), Role: enum.RoleVisitor, PasswordHash: hash}
	if err := bus.Dispatch(admin, create); err != nil {
		t.Fatal(err)
	}
	before := passwordCredentialForTest(t, admin, create.Result.ID)
	if before.Username != "new.member" || !before.MustChangePassword || !before.User.MustChangePassword || !passwordauth.Verify(before.PasswordHash, password) || before.User.Name != create.Name {
		t.Fatal("created account did not retain the usable temporary credential, required change, or full Chinese nickname")
	}
	newName := "更新后的昵称"
	if err := bus.Dispatch(withUser(demoTenantCtx, before.User), &cmd.UpdateCurrentUser{Name: newName, AvatarType: enum.AvatarTypeLetter, Avatar: &dto.ImageUpload{}}); err != nil {
		t.Fatal(err)
	}
	after := passwordCredentialForTest(t, admin, before.User.ID)
	if after.User.Name != newName || after.Username != before.Username || after.User.ID != before.User.ID || after.PasswordHash != before.PasswordHash || after.MustChangePassword != before.MustChangePassword || after.User.SecurityStamp != before.User.SecurityStamp {
		t.Fatal("changing nickname altered login identity or credentials")
	}
	lookup := &query.GetPasswordCredential{Username: "new.member"}
	if err := bus.Dispatch(admin, lookup); err != nil || lookup.Result.User.ID != before.User.ID {
		t.Fatalf("original login name stopped resolving after nickname update: %v", err)
	}
	invalid := &cmd.CreatePasswordAccount{Username: "too.long", Name: strings.Repeat("字", 101), Role: enum.RoleVisitor, PasswordHash: hash}
	if err := bus.Dispatch(admin, invalid); err != passwordauth.ErrInvalidInput || invalid.Result != nil {
		t.Fatalf("oversized Chinese nickname was not rejected: %v", err)
	}
	search := &query.SearchUsers{Query: "too.long", Status: "all"}
	if err := bus.Dispatch(admin, search); err != nil || search.TotalCount != 0 || len(search.Result) != 0 {
		t.Fatalf("invalid creation left an account behind: %v", err)
	}
}

func TestAccountManagementStatusSearchPaginationAndTenantIsolation(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	admin := passwordAccountForTest(t, jonSnow, "jon.snow")
	otherAdmin := passwordAccountForTest(t, tonyStark, "tony.stark")
	create := func(ctx context.Context, username, name string, role enum.Role, status enum.UserStatus) *entity.User {
		t.Helper()
		command := &cmd.CreatePasswordAccount{Username: username, Name: name, Role: role, PasswordHash: passwordauth.PlaceholderHash()}
		if err := bus.Dispatch(ctx, command); err != nil {
			t.Fatal(err)
		}
		if status != enum.UserActive {
			if _, err := trx.Execute("UPDATE users SET status=$1 WHERE id=$2 AND tenant_id=$3", status, command.Result.ID, command.Result.Tenant.ID); err != nil {
				t.Fatal(err)
			}
		}
		return command.Result
	}
	first := create(admin, "acct.filter.first", "A member", enum.RoleVisitor, enum.UserActive)
	second := create(admin, "acct.filter.second", "B member", enum.RoleVisitor, enum.UserActive)
	blocked := create(admin, "acct.filter.blocked", "C member", enum.RoleVisitor, enum.UserBlocked)
	collaborator := create(admin, "acct.filter.collab", "D collaborator", enum.RoleCollaborator, enum.UserActive)
	blockedAdmin := create(admin, "acct.filter.admin", "E administrator", enum.RoleAdministrator, enum.UserBlocked)
	create(admin, "acct.filter.deleted", "F deleted", enum.RoleVisitor, enum.UserDeleted)
	foreign := create(otherAdmin, "acct.filter.first", "A member", enum.RoleVisitor, enum.UserActive)
	create(otherAdmin, "acct.filter.blocked", "C member", enum.RoleVisitor, enum.UserBlocked)

	for _, test := range []struct {
		name, status, query string
		roles               []string
		page, total         int
		ids                 []int
	}{
		{"all states", "all", "acct.filter.", nil, 1, 5, []int{blockedAdmin.ID}},
		{"default states", "", "acct.filter.", nil, 1, 5, []int{blockedAdmin.ID}},
		{"active second page", "active", "ACCT.FILTER.", []string{"visitor"}, 2, 2, []int{second.ID}},
		{"inactive visitor", "inactive", "acct.filter.", []string{"visitor"}, 1, 1, []int{blocked.ID}},
		{"inactive role union", "inactive", "acct.filter.", []string{"administrator", "visitor"}, 2, 2, []int{blocked.ID}},
		{"active collaborator", "active", "acct.filter.", []string{"collaborator"}, 1, 1, []int{collaborator.ID}},
		{"name search", "active", "A member", []string{"visitor"}, 1, 1, []int{first.ID}},
		{"query eliminates inactive", "inactive", "acct.filter.first", nil, 1, 0, nil},
		{"page beyond matching rows", "active", "acct.filter.", []string{"visitor"}, 3, 2, nil},
	} {
		t.Run(test.name, func(t *testing.T) {
			q := &query.SearchUsers{Status: test.status, Query: test.query, Roles: test.roles, Page: test.page, Limit: 1}
			if err := bus.Dispatch(admin, q); err != nil {
				t.Fatal(err)
			}
			if q.TotalCount != test.total || len(q.Result) != len(test.ids) {
				t.Fatalf("status filters disagreed with pagination count: total=%d rows=%d", q.TotalCount, len(q.Result))
			}
			for i, user := range q.Result {
				if user.ID != test.ids[i] || user.Tenant.ID != demoTenant.ID || user.Status == enum.UserDeleted {
					t.Fatal("page included an unexpected, foreign, or deleted account")
				}
			}
		})
	}
	other := &query.SearchUsers{Status: "active", Query: "acct.filter.", Roles: []string{"visitor"}, Page: 1, Limit: 1}
	if err := bus.Dispatch(otherAdmin, other); err != nil || other.TotalCount != 1 || len(other.Result) != 1 || other.Result[0].ID != foreign.ID {
		t.Fatalf("the other tenant received an incorrect filtered page: %v", err)
	}
	for _, status := range []string{"blocked", "deleted", "unknown"} {
		if err := bus.Dispatch(admin, &query.SearchUsers{Status: status}); err != passwordauth.ErrInvalidInput {
			t.Fatalf("invalid account status accepted: %s: %v", status, err)
		}
	}
}
