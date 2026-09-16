package entity

// PasswordCredential is an internal authentication result. It must never be
// embedded in a response, event or SSR payload.
type PasswordCredential struct {
	User               *User  `json:"-"`
	Username           string `json:"-"`
	PasswordHash       string `json:"-"`
	MustChangePassword bool   `json:"-"`
}
