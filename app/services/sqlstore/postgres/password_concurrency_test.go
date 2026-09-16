package postgres_test

import (
	"context"
	"testing"
	"time"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/dbx"
	"github.com/getfider/fider/app/pkg/passwordauth"
)

func passwordConcurrentFixture(t *testing.T) (*entity.Tenant, *entity.User, *entity.User) {
	t.Helper()
	SetupDatabaseTest(t)
	t.Cleanup(TeardownDatabaseTest)
	ctx := context.WithValue(context.Background(), app.TransactionCtxKey, trx)
	site := &cmd.CreateTenant{Name: "Password race test", Subdomain: "password-race-test", Status: enum.TenantActive}
	if err := bus.Dispatch(ctx, site); err != nil {
		t.Fatal(err)
	}
	ctx = context.WithValue(ctx, app.TenantCtxKey, site.Result)
	create := &cmd.CreatePasswordAccount{Username: "first.admin", Name: "First", Role: enum.RoleAdministrator, PasswordHash: passwordauth.PlaceholderHash(), Offline: true}
	if err := bus.Dispatch(ctx, create); err != nil {
		t.Fatal(err)
	}
	first := create.Result
	if err := bus.Dispatch(ctx, &cmd.ChangePassword{UserID: first.ID, ExpectedStamp: first.SecurityStamp, PasswordHash: passwordauth.PlaceholderHash(), RequireChange: true}); err != nil {
		t.Fatal(err)
	}
	first = passwordCredentialForTest(t, ctx, first.ID).User
	secondCmd := &cmd.CreatePasswordAccount{Username: "second.admin", Name: "Second", Role: enum.RoleAdministrator, PasswordHash: passwordauth.PlaceholderHash()}
	if err := bus.Dispatch(context.WithValue(ctx, app.UserCtxKey, first), secondCmd); err != nil {
		t.Fatal(err)
	}
	second := secondCmd.Result
	if err := bus.Dispatch(ctx, &cmd.ChangePassword{UserID: second.ID, ExpectedStamp: second.SecurityStamp, PasswordHash: passwordauth.PlaceholderHash(), RequireChange: true}); err != nil {
		t.Fatal(err)
	}
	second = passwordCredentialForTest(t, ctx, second.ID).User
	if err := trx.Commit(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		err := passwordConcurrentTransaction(site.Result, nil, func(ctx context.Context) error { return bus.Dispatch(ctx, &cmd.DeleteTenant{TenantID: site.Result.ID}) })
		if err != nil {
			t.Errorf("clean up isolated race fixture: %v", err)
		}
	})
	return site.Result, first, second
}

func passwordConcurrentTransaction(tenant *entity.Tenant, actor *entity.User, run func(context.Context) error) error {
	base, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tx, err := dbx.BeginTx(base)
	if err != nil {
		return err
	}
	defer tx.MustRollback()
	ctx := context.WithValue(base, app.TransactionCtxKey, tx)
	ctx = context.WithValue(ctx, app.TenantCtxKey, tenant)
	if actor != nil {
		ctx = context.WithValue(ctx, app.UserCtxKey, actor)
	}
	if err := run(ctx); err != nil {
		return err
	}
	return tx.Commit()
}

func TestPasswordStorageConcurrentChangeHasOneWinner(t *testing.T) {
	tenant, first, _ := passwordConcurrentFixture(t)
	start := make(chan struct{})
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			<-start
			results <- passwordConcurrentTransaction(tenant, first, func(ctx context.Context) error {
				return bus.Dispatch(ctx, &cmd.ChangePassword{UserID: first.ID, ExpectedStamp: first.SecurityStamp, PasswordHash: passwordauth.PlaceholderHash()})
			})
		}()
	}
	close(start)
	success, conflict := 0, 0
	for i := 0; i < 2; i++ {
		err := <-results
		switch err {
		case nil:
			success++
		case passwordauth.ErrConflict:
			conflict++
		default:
			t.Fatalf("unexpected race error: %v", err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("double password change had %d successes and %d conflicts", success, conflict)
	}
}

func TestPasswordStorageConcurrentAdministratorRevocation(t *testing.T) {
	for _, operation := range []string{"block", "demote"} {
		t.Run(operation, func(t *testing.T) {
			tenant, first, second := passwordConcurrentFixture(t)
			start := make(chan struct{})
			results := make(chan error, 2)
			for _, pair := range [][2]*entity.User{{first, second}, {second, first}} {
				actor, target := pair[0], pair[1]
				go func() {
					<-start
					results <- passwordConcurrentTransaction(tenant, actor, func(ctx context.Context) error {
						if operation == "block" {
							return bus.Dispatch(ctx, &cmd.BlockUser{UserID: target.ID})
						}
						return bus.Dispatch(ctx, &cmd.ChangeUserRole{UserID: target.ID, Role: enum.RoleVisitor})
					})
				}()
			}
			close(start)
			successes := 0
			for i := 0; i < 2; i++ {
				err := <-results
				if err == nil {
					successes++
				} else if err != passwordauth.ErrUnauthorized && err != passwordauth.ErrLastAdministrator {
					t.Fatalf("unexpected revocation race error: %v", err)
				}
			}
			if successes != 1 {
				t.Fatalf("expected one committed revocation, got %d", successes)
			}
			if err := passwordConcurrentTransaction(tenant, nil, func(ctx context.Context) error {
				q := &query.HasPasswordAdministrator{}
				if err := bus.Dispatch(ctx, q); err != nil {
					return err
				}
				if !q.Result {
					t.Error("last available administrator lost")
				}
				return nil
			}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestPasswordStorageResetWaitsForAuthenticatedWrite(t *testing.T) {
	tenant, first, second := passwordConcurrentFixture(t)
	base, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	tx, err := dbx.BeginTx(base)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.MustRollback()
	ctx := context.WithValue(base, app.TransactionCtxKey, tx)
	ctx = context.WithValue(ctx, app.TenantCtxKey, tenant)
	q := &query.GetPasswordCredential{UserID: second.ID, Lock: true}
	if err := bus.Dispatch(ctx, q); err != nil {
		t.Fatal(err)
	}
	started := make(chan struct{})
	result := make(chan error, 1)
	go func() {
		result <- passwordConcurrentTransaction(tenant, first, func(resetCtx context.Context) error {
			close(started)
			return bus.Dispatch(resetCtx, &cmd.ResetPasswordAccount{UserID: second.ID, PasswordHash: passwordauth.PlaceholderHash()})
		})
	}()
	<-started
	select {
	case err := <-result:
		t.Fatalf("reset bypassed authentication lock: %v", err)
	case <-time.After(100 * time.Millisecond):
	}
	if _, err := tx.Execute("UPDATE users SET name = $3 WHERE tenant_id = $1 AND id = $2", tenant.ID, second.ID, "Committed before reset"); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-result; err != nil {
		t.Fatal(err)
	}
	if err := passwordConcurrentTransaction(tenant, second, func(staleCtx context.Context) error {
		return bus.Dispatch(staleCtx, &cmd.ChangePassword{UserID: second.ID, ExpectedStamp: second.SecurityStamp, PasswordHash: passwordauth.PlaceholderHash()})
	}); err != passwordauth.ErrConflict {
		t.Fatalf("stale session survived committed reset: %v", err)
	}
}

// SQL blob storage opens its own transaction while an authenticated request
// transaction remains open. The tenant FK must not wait for that parent request.
func TestPasswordStorageAuthenticatedWriteAllowsIndependentBlobInsert(t *testing.T) {
	tenant, first, _ := passwordConcurrentFixture(t)
	requestBase, cancelRequest := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelRequest()
	requestTx, err := dbx.BeginTx(requestBase)
	if err != nil {
		t.Fatal(err)
	}
	defer requestTx.MustRollback()
	requestCtx := context.WithValue(requestBase, app.TransactionCtxKey, requestTx)
	requestCtx = context.WithValue(requestCtx, app.TenantCtxKey, tenant)
	if err := bus.Dispatch(requestCtx, &query.GetPasswordCredential{UserID: first.ID, Lock: true}); err != nil {
		t.Fatal(err)
	}

	// Keep the request authentication locks held through the independent insert
	// and commit, matching storeBlob's request -> separate transaction dependency.
	uploadCtx, cancelUpload := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelUpload()
	uploadTx, err := dbx.BeginTx(uploadCtx)
	if err != nil {
		t.Fatal(err)
	}
	defer uploadTx.MustRollback()
	key := "uploads/auth-lock-regression.txt"
	content := []byte("independent blob transaction")
	if _, err := uploadTx.Execute(`INSERT INTO blobs (tenant_id, key, size, content_type, file, created_at, modified_at)
  VALUES ($1, $2, $3, $4, $5, now(), now())`, tenant.ID, key, len(content), "text/plain", content); err != nil {
		t.Fatalf("blob tenant FK blocked behind its parent authenticated request: %v", err)
	}
	if err := uploadTx.Commit(); err != nil {
		t.Fatal(err)
	}
	var persisted bool
	if err := requestTx.Scalar(&persisted, "SELECT EXISTS(SELECT 1 FROM blobs WHERE tenant_id = $1 AND key = $2 AND file = $3)", tenant.ID, key, content); err != nil {
		t.Fatal(err)
	}
	if !persisted {
		t.Fatal("independent blob did not commit while request remained open")
	}
}
