package cmd

import (
	"context"
	"errors"

	"github.com/getfider/fider/app"
	modelcmd "github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/dbx"
	"github.com/getfider/fider/app/services/sqlstore/postgres"
)

type accountDatabase struct{}

func (accountDatabase) preview(opts accountOptions) (*accountTarget, error) {
	trx, err := dbx.BeginTx(context.Background())
	if err != nil {
		return nil, errors.New("cannot connect to the configured database")
	}
	defer func() { _ = trx.Rollback() }()
	if _, err = trx.Execute("SET TRANSACTION READ ONLY"); err != nil {
		return nil, errors.New("cannot open a read-only account preview")
	}
	return previewAccount(trx, opts)
}

func previewAccount(trx *dbx.Trx, opts accountOptions) (*accountTarget, error) {
	if opts.operation == "bootstrap" {
		var count int
		if err := trx.Scalar(&count, "SELECT COUNT(*) FROM tenants"); err != nil {
			return nil, errors.New("cannot inspect tenants; check the database and applied migrations")
		}
		if count != 0 {
			return nil, errors.New("bootstrap refused: this database already contains a site")
		}
		return &accountTarget{}, nil
	}
	row := struct {
		TenantName    string            `db:"tenant_name"`
		TenantStatus  enum.TenantStatus `db:"tenant_status"`
		Name          string            `db:"name"`
		Role          enum.Role         `db:"role"`
		Status        enum.UserStatus   `db:"status"`
		Username      string            `db:"username"`
		HasCredential bool              `db:"has_credential"`
	}{}
	if err := trx.Get(&row, `SELECT t.name AS tenant_name, t.status AS tenant_status, u.name, u.role, u.status,
		COALESCE(c.username, '') AS username, (c.user_id IS NOT NULL) AS has_credential
		FROM users u JOIN tenants t ON t.id = u.tenant_id
		LEFT JOIN user_credentials c ON c.tenant_id = u.tenant_id AND c.user_id = u.id
		WHERE u.tenant_id = $1 AND u.id = $2`, opts.tenantID, opts.userID); err != nil {
		return nil, errors.New("exact tenant/user target unavailable; check IDs and applied migrations")
	}
	if row.TenantStatus != enum.TenantActive || row.Status != enum.UserActive {
		return nil, errors.New("only an active user on an active site can be initialized or recovered")
	}
	if opts.operation == "initialize" {
		if row.HasCredential {
			return nil, errors.New("user already has password credentials; initialize will not overwrite them")
		}
		exists, err := trx.Exists("SELECT 1 FROM user_credentials WHERE tenant_id = $1 AND username = $2", opts.tenantID, opts.username)
		if err != nil {
			return nil, errors.New("cannot check username availability")
		}
		if exists {
			return nil, errors.New("username is already in use on this site")
		}
		row.Username = opts.username
	} else if !row.HasCredential || row.Role != enum.RoleAdministrator {
		return nil, errors.New("local recovery is restricted to an existing active administrator with password credentials")
	}
	return &accountTarget{tenantName: row.TenantName, name: row.Name, username: row.Username, role: row.Role}, nil
}

func (accountDatabase) apply(opts accountOptions, hash string) error {
	// Initialize only the storage service: an offline account command must not
	// start workers, mail providers, webhooks, listeners, or the HTTP server.
	postgres.Service{}.Init()
	ctx := context.Background()
	trx, err := dbx.BeginTx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = trx.Rollback() }()
	ctx = context.WithValue(ctx, app.TransactionCtxKey, trx)
	if opts.operation == "bootstrap" {
		// All local bootstrap processes serialize the global empty-site check.
		if _, err = trx.Execute("SELECT pg_advisory_xact_lock(741938052)"); err != nil {
			return err
		}
	} else {
		var tenantID int
		if err = trx.Scalar(&tenantID, "SELECT id FROM tenants WHERE id = $1 AND status = $2 FOR UPDATE", opts.tenantID, enum.TenantActive); err != nil {
			return err
		}
	}
	if _, err = previewAccount(trx, opts); err != nil {
		return err
	}
	if opts.operation == "bootstrap" {
		create := &modelcmd.CreateTenant{Name: opts.siteName, Subdomain: "", Status: enum.TenantActive}
		if err = bus.Dispatch(ctx, create); err != nil {
			return err
		}
		ctx = context.WithValue(ctx, app.TenantCtxKey, create.Result)
		if _, err = trx.Execute("UPDATE tenants SET is_private = true, is_email_auth_allowed = false, is_feed_enabled = false WHERE id = $1", create.Result.ID); err != nil {
			return err
		}
		err = bus.Dispatch(ctx, &modelcmd.CreatePasswordAccount{Name: opts.name, Username: opts.username, PasswordHash: hash, Role: enum.RoleAdministrator, Offline: true})
	} else {
		ctx = context.WithValue(ctx, app.TenantCtxKey, &entity.Tenant{ID: opts.tenantID, Status: enum.TenantActive})
		switch opts.operation {
		case "initialize":
			err = bus.Dispatch(ctx, &modelcmd.InitializePasswordAccount{UserID: opts.userID, Username: opts.username, PasswordHash: hash, Offline: true})
		case "reset-password":
			err = bus.Dispatch(ctx, &modelcmd.ResetPasswordAccount{UserID: opts.userID, PasswordHash: hash, Offline: true})
		default:
			return errors.New("unsupported account operation")
		}
	}
	if err != nil {
		return err
	}
	return trx.Commit()
}
