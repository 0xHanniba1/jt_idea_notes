package postgres

import (
	"context"
	"crypto/subtle"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/dbx"
	"github.com/getfider/fider/app/pkg/passwordauth"
	"github.com/getfider/fider/app/services/sqlstore/dbEntities"
)

// Every authentication-sensitive write takes the tenant lock first and keeps it
// until the request-owned transaction commits. This intentionally serializes
// writes in a small internal site and makes revocation linearizable with them.
// NO KEY UPDATE still excludes other authentication writers, but permits the
// FK KEY SHARE lock taken by SQL blob storage in its separate transaction.
// A stronger FOR UPDATE would make an upload wait on its own parent request.
func lockPasswordTenant(trx *dbx.Trx, tenant *entity.Tenant) error {
	if trx == nil || tenant == nil || tenant.ID <= 0 {
		return passwordauth.ErrUnauthorized
	}
	var id int
	return trx.ScalarSensitive(&id, "SELECT id FROM tenants WHERE id = $1 FOR NO KEY UPDATE", tenant.ID)
}

const passwordUserColumns = `u.id, u.name, u.email, u.tenant_id, u.role, u.status,
 u.avatar_type, u.avatar_bkey, u.is_trusted, u.security_stamp,
 (SELECT c.username FROM user_credentials c WHERE c.tenant_id = u.tenant_id AND c.user_id = u.id) AS username,
 EXISTS(SELECT 1 FROM user_credentials c WHERE c.tenant_id = u.tenant_id AND c.user_id = u.id) AS password_initialized,
 COALESCE((SELECT c.must_change_password FROM user_credentials c WHERE c.tenant_id = u.tenant_id AND c.user_id = u.id), false) AS must_change_password`

func passwordUser(ctx context.Context, trx *dbx.Trx, tenantID, userID int, lock bool) (*entity.User, error) {
	sql := "SELECT " + passwordUserColumns + " FROM users u WHERE u.tenant_id = $1 AND u.id = $2"
	if lock {
		sql += " FOR UPDATE OF u"
	}
	var row dbEntities.User
	if err := trx.GetSensitive(&row, sql, tenantID, userID); err != nil {
		return nil, err
	}
	return row.ToModel(ctx), nil
}

func getPasswordCredential(ctx context.Context, q *query.GetPasswordCredential) error {
	q.Result = nil
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, _ *entity.User) error {
		if trx == nil || tenant == nil || tenant.ID <= 0 || (q.UserID > 0) == (q.Username != "") {
			return passwordauth.ErrInvalidInput
		}
		if q.Lock {
			if err := lockPasswordTenant(trx, tenant); err != nil {
				return err
			}
		}
		id := q.UserID
		if id <= 0 {
			if err := trx.ScalarSensitive(&id, "SELECT user_id FROM user_credentials WHERE tenant_id = $1 AND username = $2", tenant.ID, passwordauth.NormalizeUsername(q.Username)); err != nil {
				return err
			}
		}
		u, err := passwordUser(ctx, trx, tenant.ID, id, q.Lock)
		if err != nil {
			return err
		}
		if u.Status == enum.UserDeleted {
			return app.ErrNotFound
		}
		row := struct {
			Username           string `db:"username"`
			PasswordHash       string `db:"password_hash"`
			MustChangePassword bool   `db:"must_change_password"`
		}{}
		if err := trx.GetSensitive(&row, "SELECT username, password_hash, must_change_password FROM user_credentials WHERE tenant_id = $1 AND user_id = $2", tenant.ID, id); err != nil {
			return err
		}
		q.Result = &entity.PasswordCredential{User: u, Username: row.Username, PasswordHash: row.PasswordHash, MustChangePassword: row.MustChangePassword}
		return nil
	})
}

func hasPasswordAdministrator(ctx context.Context, q *query.HasPasswordAdministrator) error {
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, _ *entity.User) error {
		if trx == nil || tenant == nil {
			return passwordauth.ErrInvalidInput
		}
		return trx.ScalarSensitive(&q.Result, `SELECT EXISTS(SELECT 1 FROM users u JOIN user_credentials c ON c.tenant_id = u.tenant_id AND c.user_id = u.id WHERE u.tenant_id = $1 AND u.status = $2 AND u.role = $3)`, tenant.ID, enum.UserActive, enum.RoleAdministrator)
	})
}

func validOfflinePasswordContext(ctx context.Context, actor *entity.User) bool {
	return ctx.Value(app.RequestCtxKey) == nil && actor == nil
}

func validPasswordRole(role enum.Role) bool {
	return role == enum.RoleVisitor || role == enum.RoleCollaborator || role == enum.RoleAdministrator
}

// Callers must not trust the request's cached role or stamp. Recheck the actor
// and target inside the tenant lock and lock user rows in a stable order.
func lockPasswordUsers(ctx context.Context, trx *dbx.Trx, tenant *entity.Tenant, actor *entity.User, targetID int) (map[int]*entity.User, error) {
	if err := lockPasswordTenant(trx, tenant); err != nil {
		return nil, err
	}
	ids := []int{}
	if actor != nil {
		if actor.Tenant == nil || actor.Tenant.ID != tenant.ID || actor.ID <= 0 {
			return nil, passwordauth.ErrUnauthorized
		}
		ids = append(ids, actor.ID)
	}
	if targetID > 0 && (actor == nil || targetID != actor.ID) {
		ids = append(ids, targetID)
	}
	sort.Ints(ids)
	users := make(map[int]*entity.User, len(ids))
	for _, id := range ids {
		u, err := passwordUser(ctx, trx, tenant.ID, id, true)
		if err != nil {
			return nil, err
		}
		users[id] = u
	}
	return users, nil
}

func checkPasswordActor(actor, current *entity.User, administrator bool) error {
	if actor == nil || current == nil || current.Status != enum.UserActive || !current.PasswordInitialized || current.MustChangePassword || actor.SecurityStamp == "" || subtle.ConstantTimeCompare([]byte(actor.SecurityStamp), []byte(current.SecurityStamp)) != 1 {
		return passwordauth.ErrUnauthorized
	}
	if administrator && current.Role != enum.RoleAdministrator {
		return passwordauth.ErrUnauthorized
	}
	return nil
}

func checkLastPasswordAdministrator(trx *dbx.Trx, tenant *entity.Tenant, target *entity.User) error {
	if target.Status != enum.UserActive || target.Role != enum.RoleAdministrator || !target.PasswordInitialized {
		return nil
	}
	var count int
	if err := trx.ScalarSensitive(&count, `SELECT COUNT(*) FROM users u JOIN user_credentials c ON c.tenant_id = u.tenant_id AND c.user_id = u.id WHERE u.tenant_id = $1 AND u.status = $2 AND u.role = $3`, tenant.ID, enum.UserActive, enum.RoleAdministrator); err != nil {
		return err
	}
	if count <= 1 {
		return passwordauth.ErrLastAdministrator
	}
	return nil
}

func insertPasswordCredential(trx *dbx.Trx, tenantID, userID int, username, hash string) error {
	var taken bool
	if err := trx.ScalarSensitive(&taken, "SELECT EXISTS(SELECT 1 FROM user_credentials WHERE tenant_id = $1 AND username = $2)", tenantID, username); err != nil {
		return err
	}
	if taken {
		return passwordauth.ErrUsernameTaken
	}
	_, err := trx.ExecuteSensitive("INSERT INTO user_credentials (tenant_id, user_id, username, password_hash, must_change_password) VALUES ($1, $2, $3, $4, true)", tenantID, userID, username, hash)
	if e, ok := err.(*dbx.SensitiveError); ok && e.Code == "23505" {
		return passwordauth.ErrUsernameTaken
	}
	return err
}

func rotatePasswordStamp(trx *dbx.Trx, tenantID, userID int) error {
	_, err := trx.ExecuteSensitive("UPDATE users SET security_stamp = $3, api_key = NULL, api_key_date = NULL WHERE tenant_id = $1 AND id = $2", tenantID, userID, generateSecurityStamp())
	return err
}

func createPasswordAccount(ctx context.Context, c *cmd.CreatePasswordAccount) error {
	c.Result = nil
	c.Username = passwordauth.NormalizeUsername(c.Username)
	if err := passwordauth.ValidateUsername(c.Username); err != nil {
		return err
	}
	if err := passwordauth.ValidateHash(c.PasswordHash); err != nil {
		return err
	}
	if strings.TrimSpace(c.Name) == "" || !utf8.ValidString(c.Name) || utf8.RuneCountInString(c.Name) > 100 || !validPasswordRole(c.Role) {
		return passwordauth.ErrInvalidInput
	}
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, actor *entity.User) error {
		users, err := lockPasswordUsers(ctx, trx, tenant, actor, 0)
		if err != nil {
			return err
		}
		if c.Offline {
			if !validOfflinePasswordContext(ctx, actor) || c.Role != enum.RoleAdministrator {
				return passwordauth.ErrUnauthorized
			}
			var count int
			if err := trx.ScalarSensitive(&count, "SELECT COUNT(*) FROM users WHERE tenant_id = $1", tenant.ID); err != nil {
				return err
			}
			if count != 0 {
				return passwordauth.ErrInvalidInput
			}
		} else {
			if actor == nil {
				return passwordauth.ErrUnauthorized
			}
			if err := checkPasswordActor(actor, users[actor.ID], true); err != nil {
				return err
			}
		}
		var taken bool
		if err := trx.ScalarSensitive(&taken, "SELECT EXISTS(SELECT 1 FROM user_credentials WHERE tenant_id = $1 AND username = $2)", tenant.ID, c.Username); err != nil {
			return err
		}
		if taken {
			return passwordauth.ErrUsernameTaken
		}
		var id int
		if err := trx.ScalarSensitive(&id, `INSERT INTO users (name, email, created_at, tenant_id, role, status, avatar_type, avatar_bkey, security_stamp) VALUES ($1, '', now(), $2, $3, $4, $5, '', $6) RETURNING id`, c.Name, tenant.ID, c.Role, enum.UserActive, enum.AvatarTypeLetter, generateSecurityStamp()); err != nil {
			return err
		}
		if err := insertPasswordCredential(trx, tenant.ID, id, c.Username, c.PasswordHash); err != nil {
			return err
		}
		c.Result, err = passwordUser(ctx, trx, tenant.ID, id, false)
		return err
	})
}

func initializePasswordAccount(ctx context.Context, c *cmd.InitializePasswordAccount) error {
	c.Username = passwordauth.NormalizeUsername(c.Username)
	if err := passwordauth.ValidateUsername(c.Username); err != nil {
		return err
	}
	if err := passwordauth.ValidateHash(c.PasswordHash); err != nil {
		return err
	}
	if c.UserID <= 0 {
		return passwordauth.ErrInvalidInput
	}
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, actor *entity.User) error {
		users, err := lockPasswordUsers(ctx, trx, tenant, actor, c.UserID)
		if err != nil {
			return err
		}
		if c.Offline {
			if !validOfflinePasswordContext(ctx, actor) {
				return passwordauth.ErrUnauthorized
			}
		} else {
			if actor == nil || actor.ID == c.UserID {
				return passwordauth.ErrUnauthorized
			}
			if err := checkPasswordActor(actor, users[actor.ID], true); err != nil {
				return err
			}
		}
		target := users[c.UserID]
		if target.Status != enum.UserActive && (c.Offline || target.Status != enum.UserBlocked) {
			return passwordauth.ErrInvalidInput
		}
		if target.PasswordInitialized {
			return passwordauth.ErrAlreadyInitialized
		}
		if err := insertPasswordCredential(trx, tenant.ID, c.UserID, c.Username, c.PasswordHash); err != nil {
			return err
		}
		return rotatePasswordStamp(trx, tenant.ID, c.UserID)
	})
}

func resetPasswordAccount(ctx context.Context, c *cmd.ResetPasswordAccount) error {
	if err := passwordauth.ValidateHash(c.PasswordHash); err != nil {
		return err
	}
	if c.UserID <= 0 {
		return passwordauth.ErrInvalidInput
	}
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, actor *entity.User) error {
		users, err := lockPasswordUsers(ctx, trx, tenant, actor, c.UserID)
		if err != nil {
			return err
		}
		target := users[c.UserID]
		if c.Offline {
			if !validOfflinePasswordContext(ctx, actor) || c.Restore || target.Role != enum.RoleAdministrator {
				return passwordauth.ErrUnauthorized
			}
		} else {
			if actor == nil || actor.ID == c.UserID {
				return passwordauth.ErrUnauthorized
			}
			if err := checkPasswordActor(actor, users[actor.ID], true); err != nil {
				return err
			}
		}
		if !target.PasswordInitialized {
			return passwordauth.ErrInvalidInput
		}
		expectedStatus := enum.UserActive
		if c.Restore {
			expectedStatus = enum.UserBlocked
		}
		if target.Status != expectedStatus {
			return passwordauth.ErrConflict
		}
		if _, err := trx.ExecuteSensitive("UPDATE user_credentials SET password_hash = $3, must_change_password = true, updated_at = now() WHERE tenant_id = $1 AND user_id = $2", tenant.ID, c.UserID, c.PasswordHash); err != nil {
			return err
		}
		_, err = trx.ExecuteSensitive("UPDATE users SET status = $3, security_stamp = $4, api_key = NULL, api_key_date = NULL WHERE tenant_id = $1 AND id = $2", tenant.ID, c.UserID, enum.UserActive, generateSecurityStamp())
		return err
	})
}

func changePassword(ctx context.Context, c *cmd.ChangePassword) error {
	if c.UserID <= 0 || c.ExpectedStamp == "" {
		return passwordauth.ErrInvalidInput
	}
	if err := passwordauth.ValidateHash(c.PasswordHash); err != nil {
		return err
	}
	return using(ctx, func(trx *dbx.Trx, tenant *entity.Tenant, actor *entity.User) error {
		users, err := lockPasswordUsers(ctx, trx, tenant, actor, c.UserID)
		if err != nil {
			return err
		}
		target := users[c.UserID]
		if target.Status != enum.UserActive || !target.PasswordInitialized || target.MustChangePassword != c.RequireChange || subtle.ConstantTimeCompare([]byte(target.SecurityStamp), []byte(c.ExpectedStamp)) != 1 {
			return passwordauth.ErrConflict
		}
		// A limited password-change session deliberately has no full actor. Its
		// expected stamp is supplied only by the verified restricted JWT handler.
		if !c.RequireChange {
			if actor == nil || actor.ID != c.UserID {
				return passwordauth.ErrUnauthorized
			}
			if err := checkPasswordActor(actor, target, false); err != nil {
				return err
			}
		} else if actor != nil {
			return passwordauth.ErrUnauthorized
		}
		count, err := trx.ExecuteSensitive("UPDATE users SET security_stamp = $4, api_key = NULL, api_key_date = NULL WHERE tenant_id = $1 AND id = $2 AND security_stamp = $3 AND status = $5", tenant.ID, c.UserID, c.ExpectedStamp, generateSecurityStamp(), enum.UserActive)
		if err != nil {
			return err
		}
		if count != 1 {
			return passwordauth.ErrConflict
		}
		count, err = trx.ExecuteSensitive("UPDATE user_credentials SET password_hash = $3, must_change_password = false, updated_at = now() WHERE tenant_id = $1 AND user_id = $2 AND must_change_password = $4", tenant.ID, c.UserID, c.PasswordHash, c.RequireChange)
		if err != nil {
			return err
		}
		if count != 1 {
			return passwordauth.ErrConflict
		}
		return nil
	})
}
