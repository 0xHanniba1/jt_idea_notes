package query

import "github.com/getfider/fider/app/models/entity"

// GetPasswordCredential looks up one tenant-scoped credential by user ID or
// normalized username. Lock serializes tenant writes before locking the user;
// the caller must keep the current transaction open until its write commits.
type GetPasswordCredential struct {
	UserID   int
	Username string
	Lock     bool
	Result   *entity.PasswordCredential
}

type HasPasswordAdministrator struct {
	Result bool
}
