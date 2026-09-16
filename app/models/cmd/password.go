package cmd

import (
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
)

// Offline is reserved for an explicit local CLI context without an HTTP
// request or current user. Storage validates it; callers cannot bypass HTTP
// authorization by binding this flag from a request.
type CreatePasswordAccount struct {
	Username     string
	Name         string
	PasswordHash string `json:"-"`
	Role         enum.Role
	Offline      bool `json:"-"`
	Result       *entity.User
}

type InitializePasswordAccount struct {
	UserID       int
	Username     string
	PasswordHash string `json:"-"`
	Offline      bool   `json:"-"`
}

type ResetPasswordAccount struct {
	UserID       int
	PasswordHash string `json:"-"`
	Restore      bool
	Offline      bool `json:"-"`
}

// ChangePassword performs a stamp/state compare-and-swap, then clears
// must_change_password and rotates the stamp. RequireChange differentiates
// temporary-password completion from a normal authenticated password change.
type ChangePassword struct {
	UserID        int
	ExpectedStamp string `json:"-"`
	PasswordHash  string `json:"-"`
	RequireChange bool
}
