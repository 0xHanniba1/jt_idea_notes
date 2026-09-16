package postgres_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/dbx"
	"github.com/getfider/fider/app/pkg/passwordauth"
)

func passwordOfflineContext(tenant *entity.Tenant) context.Context {
	ctx := context.WithValue(context.Background(), app.TransactionCtxKey, trx)
	return context.WithValue(ctx, app.TenantCtxKey, tenant)
}

// Password-aware tests explicitly initialize fixtures; legacy rows remain
// uninitialized elsewhere so that their migration state is also exercised.
func passwordAccountForTest(t *testing.T, user *entity.User, username string) context.Context {
	t.Helper()
	ctx := passwordOfflineContext(user.Tenant)
	if err := bus.Dispatch(ctx, &cmd.InitializePasswordAccount{UserID: user.ID, Username: username, PasswordHash: passwordauth.PlaceholderHash(), Offline: true}); err != nil {
		t.Fatal(err)
	}
	q := &query.GetPasswordCredential{UserID: user.ID}
	if err := bus.Dispatch(ctx, q); err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(ctx, &cmd.ChangePassword{UserID: user.ID, ExpectedStamp: q.Result.User.SecurityStamp, PasswordHash: passwordauth.PlaceholderHash(), RequireChange: true}); err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(ctx, q); err != nil {
		t.Fatal(err)
	}
	return withUser(demoTenantCtx, q.Result.User)
}

func passwordCredentialForTest(t *testing.T, ctx context.Context, id int) *entity.PasswordCredential {
	t.Helper()
	q := &query.GetPasswordCredential{UserID: id}
	if err := bus.Dispatch(ctx, q); err != nil {
		t.Fatal(err)
	}
	return q.Result
}

func TestPasswordStorageInitializationAndCAS(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	offline := passwordOfflineContext(demoTenant)
	available := &query.HasPasswordAdministrator{}
	if err := bus.Dispatch(offline, available); err != nil || available.Result {
		t.Fatalf("legacy administrator unexpectedly initialized: %v", err)
	}
	init := &cmd.InitializePasswordAccount{UserID: jonSnow.ID, Username: "  JON.SNOW  ", PasswordHash: passwordauth.PlaceholderHash(), Offline: true}
	if err := bus.Dispatch(offline, init); err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(offline, available); err != nil || !available.Result {
		t.Fatalf("pending-change admin not considered available: %v", err)
	}
	initial := passwordCredentialForTest(t, offline, jonSnow.ID)
	if initial.Username != "jon.snow" || !initial.MustChangePassword || initial.User.ID != jonSnow.ID || initial.User.Role != jonSnow.Role || !initial.User.PasswordInitialized {
		t.Fatal("initialization changed identity or missing pending state")
	}
	if initial.User.AvatarURL != "" {
		t.Fatal("CLI context should not construct an HTTP avatar URL")
	}
	if err := bus.Dispatch(offline, init); err != passwordauth.ErrAlreadyInitialized {
		t.Fatalf("overwrite accepted: %v", err)
	}
	change := &cmd.ChangePassword{UserID: jonSnow.ID, ExpectedStamp: initial.User.SecurityStamp, PasswordHash: passwordauth.PlaceholderHash(), RequireChange: true}
	if err := bus.Dispatch(offline, change); err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(offline, change); err != passwordauth.ErrConflict {
		t.Fatalf("replayed change succeeded: %v", err)
	}
	current := passwordCredentialForTest(t, offline, jonSnow.ID)
	if current.MustChangePassword || current.User.SecurityStamp == initial.User.SecurityStamp {
		t.Fatal("change did not clear state/rotate stamp")
	}
	normal := &cmd.ChangePassword{UserID: jonSnow.ID, ExpectedStamp: current.User.SecurityStamp, PasswordHash: passwordauth.PlaceholderHash()}
	if err := bus.Dispatch(offline, normal); err != passwordauth.ErrUnauthorized {
		t.Fatalf("normal change accepted no actor: %v", err)
	}
	if err := bus.Dispatch(withUser(demoTenantCtx, current.User), normal); err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(withUser(demoTenantCtx, current.User), normal); err != passwordauth.ErrConflict {
		t.Fatalf("replayed normal change succeeded: %v", err)
	}
}

func TestPasswordStorageManagementAndPrivacy(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	admin := passwordAccountForTest(t, jonSnow, "jon.snow")
	create := &cmd.CreatePasswordAccount{Username: "  NEW.Member ", Name: "新同事", PasswordHash: passwordauth.PlaceholderHash(), Role: enum.RoleVisitor}
	if err := bus.Dispatch(admin, create); err != nil {
		t.Fatal(err)
	}
	u := create.Result
	if u.Email != "" || u.Username != "new.member" || !u.MustChangePassword || u.Role != enum.RoleVisitor {
		t.Fatal("unexpected created account")
	}
	if err := bus.Dispatch(admin, &cmd.CreatePasswordAccount{Username: "NEW.MEMBER", Name: "重复", PasswordHash: passwordauth.PlaceholderHash(), Role: enum.RoleVisitor}); err != passwordauth.ErrUsernameTaken {
		t.Fatalf("duplicate not rejected: %v", err)
	}
	search := &query.SearchUsers{Query: "NEW.MEMBER"}
	if err := bus.Dispatch(admin, search); err != nil || len(search.Result) != 1 || search.TotalCount != 1 {
		t.Fatalf("username search failed: %v", err)
	}
	for _, value := range []any{u, passwordCredentialForTest(t, admin, u.ID)} {
		encoded, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		for _, secret := range []string{"passwordHash", "securityStamp", "mustChangePassword", "passwordInitialized", "username", u.Username, passwordauth.PlaceholderHash()} {
			if strings.Contains(string(encoded), secret) {
				t.Fatal("public user/credential exposed authentication metadata")
			}
		}
	}
	encoded, err := json.Marshal(entity.UserWithEmail{User: search.Result[0]})
	if err != nil {
		t.Fatal(err)
	}
	for _, safe := range []string{`"username":"new.member"`, `"passwordInitialized":true`, `"mustChangePassword":true`} {
		if !strings.Contains(string(encoded), safe) {
			t.Fatalf("admin field missing: %s", safe)
		}
	}
	if strings.Contains(string(encoded), "securityStamp") || strings.Contains(string(encoded), passwordauth.PlaceholderHash()) {
		t.Fatal("admin list leaked credential secret")
	}
	stale := passwordCredentialForTest(t, admin, u.ID)
	if err := bus.Dispatch(admin, &cmd.ResetPasswordAccount{UserID: u.ID, PasswordHash: passwordauth.PlaceholderHash()}); err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(demoTenantCtx, &cmd.ChangePassword{UserID: u.ID, ExpectedStamp: stale.User.SecurityStamp, PasswordHash: passwordauth.PlaceholderHash(), RequireChange: true}); err != passwordauth.ErrConflict {
		t.Fatalf("reset failed to revoke restricted session: %v", err)
	}
	if err := bus.Dispatch(admin, &cmd.BlockUser{UserID: u.ID}); err != nil {
		t.Fatal(err)
	}
	blocked := passwordCredentialForTest(t, admin, u.ID)
	if blocked.User.Status != enum.UserBlocked {
		t.Fatal("not blocked")
	}
	if err := bus.Dispatch(admin, &cmd.UnblockUser{UserID: u.ID}); err != passwordauth.ErrInvalidInput {
		t.Fatal("legacy restore bypass accepted")
	}
	replacement, err := passwordauth.Hash("Replacement temporary password value")
	if err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(admin, &cmd.ResetPasswordAccount{UserID: u.ID, PasswordHash: replacement, Restore: true}); err != nil {
		t.Fatal(err)
	}
	restored := passwordCredentialForTest(t, admin, u.ID)
	if restored.User.Status != enum.UserActive || !restored.MustChangePassword || restored.User.SecurityStamp == blocked.User.SecurityStamp || restored.PasswordHash != replacement {
		t.Fatal("restore failed to replace credentials atomically")
	}
}

func TestPasswordStorageAuthorizationAndLastAdministrator(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	admin := passwordAccountForTest(t, jonSnow, "jon.snow")
	member := passwordAccountForTest(t, aryaStark, "arya.stark")
	for _, ctx := range []context.Context{demoTenantCtx, member, germanJonSnowCtx} {
		if err := bus.Dispatch(ctx, &cmd.ResetPasswordAccount{UserID: sansaStark.ID, PasswordHash: passwordauth.PlaceholderHash()}); err == nil {
			t.Fatal("unauthorized reset accepted")
		}
	}
	if err := bus.Dispatch(admin, &cmd.BlockUser{UserID: jonSnow.ID}); err != passwordauth.ErrUnauthorized {
		t.Fatal("self block accepted")
	}
	if err := bus.Dispatch(admin, &cmd.ResetPasswordAccount{UserID: jonSnow.ID, PasswordHash: passwordauth.PlaceholderHash()}); err != passwordauth.ErrUnauthorized {
		t.Fatal("self reset accepted")
	}
	if err := bus.Dispatch(admin, &cmd.DeleteCurrentUser{}); err != passwordauth.ErrLastAdministrator {
		t.Fatalf("last administrator deleted: %v", err)
	}
	if err := bus.Dispatch(admin, &cmd.ChangeUserRole{UserID: tonyStark.ID, Role: enum.RoleVisitor}); err != app.ErrNotFound {
		t.Fatalf("cross tenant user accepted: %v", err)
	}
	if err := bus.Dispatch(admin, &cmd.ChangeUserRole{UserID: aryaStark.ID, Role: enum.RoleAdministrator}); err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(member, &cmd.CreatePasswordAccount{Username: "stale.actor", Name: "Stale", PasswordHash: passwordauth.PlaceholderHash(), Role: enum.RoleVisitor}); err != passwordauth.ErrUnauthorized {
		t.Fatalf("pre-promotion session retained access: %v", err)
	}
	if err := bus.Dispatch(admin, &cmd.DeleteCurrentUser{}); err != nil {
		t.Fatal(err)
	}
	if err := bus.Dispatch(demoTenantCtx, &query.GetPasswordCredential{UserID: jonSnow.ID}); err != app.ErrNotFound {
		t.Fatal("deleted user's credential survived")
	}
}

func TestPasswordStorageOfflineAndBlockedInitialization(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	admin := passwordAccountForTest(t, jonSnow, "jon.snow")
	for _, ctx := range []context.Context{demoTenantCtx, admin} {
		if err := bus.Dispatch(ctx, &cmd.InitializePasswordAccount{UserID: aryaStark.ID, Username: "arya.stark", PasswordHash: passwordauth.PlaceholderHash(), Offline: true}); err != passwordauth.ErrUnauthorized {
			t.Fatalf("offline HTTP bypass accepted: %v", err)
		}
	}
	if err := bus.Dispatch(admin, &cmd.BlockUser{UserID: aryaStark.ID}); err != nil {
		t.Fatal(err)
	}
	init := &cmd.InitializePasswordAccount{UserID: aryaStark.ID, Username: "arya.stark", PasswordHash: passwordauth.PlaceholderHash(), Offline: true}
	if err := bus.Dispatch(passwordOfflineContext(demoTenant), init); err != passwordauth.ErrInvalidInput {
		t.Fatal("offline initialized blocked user")
	}
	init.Offline = false
	if err := bus.Dispatch(admin, init); err != nil {
		t.Fatal(err)
	}
	blocked := passwordCredentialForTest(t, admin, aryaStark.ID)
	if blocked.User.Status != enum.UserBlocked || !blocked.MustChangePassword {
		t.Fatal("initialization unblocked legacy user")
	}
	if err := bus.Dispatch(passwordOfflineContext(demoTenant), &cmd.ResetPasswordAccount{UserID: aryaStark.ID, PasswordHash: passwordauth.PlaceholderHash(), Offline: true}); err != passwordauth.ErrUnauthorized {
		t.Fatal("offline recovery of non-admin accepted")
	}
	if err := bus.Dispatch(passwordOfflineContext(demoTenant), &cmd.CreatePasswordAccount{Username: "offline.admin", Name: "Another", PasswordHash: passwordauth.PlaceholderHash(), Role: enum.RoleAdministrator, Offline: true}); err != passwordauth.ErrInvalidInput {
		t.Fatal("bootstrap accepted nonempty tenant")
	}
}

func TestPasswordStorageNoEmailKeepsWebNotifications(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	admin := passwordAccountForTest(t, jonSnow, "jon.snow")
	create := &cmd.CreatePasswordAccount{Username: "no.email", Name: "无邮箱成员", PasswordHash: passwordauth.PlaceholderHash(), Role: enum.RoleVisitor}
	if err := bus.Dispatch(admin, create); err != nil {
		t.Fatal(err)
	}
	member := withUser(demoTenantCtx, create.Result)
	if err := bus.Dispatch(member, &cmd.UpdateCurrentUserSettings{Settings: map[string]string{
		enum.NotificationEventNewPost.UserSettingsKeyName:    "3",
		enum.NotificationEventNewComment.UserSettingsKeyName: "3",
	}}); err != nil {
		t.Fatal(err)
	}
	post := &cmd.AddNewPost{Title: "Notification regression", Description: "No email address"}
	if err := bus.Dispatch(member, post); err != nil {
		t.Fatal(err)
	}
	for _, event := range []enum.NotificationEvent{enum.NotificationEventNewPost, enum.NotificationEventNewComment} {
		for _, channel := range []enum.NotificationChannel{enum.NotificationChannelWeb, enum.NotificationChannelEmail} {
			q := &query.GetActiveSubscribers{Number: post.Result.Number, Event: event, Channel: channel}
			if err := bus.Dispatch(member, q); err != nil {
				t.Fatal(err)
			}
			found := false
			for _, u := range q.Result {
				if u.ID == create.Result.ID {
					found = true
				}
			}
			if found != (channel == enum.NotificationChannelWeb) {
				t.Fatal("missing email changed web delivery or remained in email recipients")
			}
		}
	}
}

func TestPasswordStorageDatabaseConstraints(t *testing.T) {
	for _, test := range []struct {
		name           string
		targetID       int
		username, code string
	}{
		{"duplicate normalized name", 2, "jon.snow", "23505"},
		{"cross tenant user", 4, "other.tenant", "23503"},
		{"unnormalized name", 2, "UPPERCASE", "23514"},
	} {
		t.Run(test.name, func(t *testing.T) {
			SetupDatabaseTest(t)
			defer TeardownDatabaseTest()
			passwordAccountForTest(t, jonSnow, "jon.snow")
			_, err := trx.ExecuteSensitive("INSERT INTO user_credentials (tenant_id,user_id,username,password_hash) VALUES ($1,$2,$3,$4)", demoTenant.ID, test.targetID, test.username, passwordauth.PlaceholderHash())
			pg, ok := err.(*dbx.SensitiveError)
			if !ok || pg.Code != test.code {
				t.Fatalf("database constraint failed to reject invalid credentials: %v", err)
			}
		})
	}
}
