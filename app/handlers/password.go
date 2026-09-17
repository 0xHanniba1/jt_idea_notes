package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/errors"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/jwt"
	"github.com/getfider/fider/app/pkg/log"
	"github.com/getfider/fider/app/pkg/passwordauth"
	"github.com/getfider/fider/app/pkg/web"
)

var passwordLimiter = passwordauth.NewLimiter()

type passwordInput struct {
	Username        string    `json:"username"`
	Name            string    `json:"name"`
	Password        string    `json:"password"`
	CurrentPassword string    `json:"currentPassword"`
	NewPassword     string    `json:"newPassword"`
	ConfirmPassword string    `json:"confirmPassword"`
	Role            enum.Role `json:"role"`
}

func bindPassword(c *web.Context, value *passwordInput) bool {
	c.Response.Header().Set("Cache-Control", "no-store")
	if c.Request.BodyError != nil || len(c.Request.Body) > 8192 {
		return false
	}
	decoder := json.NewDecoder(strings.NewReader(c.Request.Body))
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil {
		return false
	}
	return decoder.Decode(new(any)) == io.EOF
}

func passwordError(c *web.Context, status int, field, key string) error {
	c.Response.Header().Set("Cache-Control", "no-store")
	return c.JSON(status, web.Map{"errors": []web.Map{{"field": field, "message": i18n.T(c, key)}}})
}

func passwordStoreFailure(c *web.Context, err error) error {
	c.Rollback()
	switch errors.Cause(err) {
	case passwordauth.ErrUnauthorized:
		return passwordError(c, 403, "", "auth.forbidden")
	case passwordauth.ErrConflict:
		return passwordError(c, 409, "", "auth.changed")
	case passwordauth.ErrLastAdministrator:
		return passwordError(c, 400, "", "auth.lastadmin")
	case passwordauth.ErrAlreadyInitialized:
		return passwordError(c, 409, "", "auth.alreadyinitialized")
	case passwordauth.ErrUsernameTaken:
		return passwordError(c, 400, "username", "auth.username.taken")
	case passwordauth.ErrInvalidInput:
		return passwordError(c, 400, "", "auth.invalidinput")
	case app.ErrNotFound:
		return passwordError(c, 404, "", "auth.account.notfound")
	default:
		return c.Failure(err)
	}
}

func passwordPolicyError(c *web.Context, field, value string) error {
	if err := passwordauth.ValidatePassword(value); err != nil {
		key := "auth.password.policy"
		if errors.Cause(err) == passwordauth.ErrWeakPassword {
			key = "auth.password.weak"
		}
		return passwordError(c, 400, field, key)
	}
	return nil
}

func passwordBusy(c *web.Context, retry time.Duration) error {
	seconds := int(retry.Seconds()) + 1
	if seconds < 1 {
		seconds = 1
	}
	c.Response.Header().Set("Retry-After", strconv.Itoa(seconds))
	return passwordError(c, 429, "", "auth.toomany")
}

func PasswordSignIn() web.HandlerFunc {
	return func(c *web.Context) error {
		var input passwordInput
		if !bindPassword(c, &input) {
			return passwordError(c, 400, "", "auth.invalidinput")
		}
		username := passwordauth.NormalizeUsername(input.Username)
		if passwordauth.ValidateUsername(username) != nil || len(input.Password) > 512 || !utf8.ValidString(input.Password) || input.Password == "" {
			return passwordError(c, 401, "", "auth.invalidlogin")
		}
		done, retry := passwordLimiter.Start(c.Tenant().ID, username, c.Request.ClientIP())
		if done == nil {
			return passwordBusy(c, retry)
		}
		success := false
		defer func() { done(success) }()
		release, ok := passwordLimiter.Acquire(c)
		if !ok {
			return passwordBusy(c, time.Second)
		}
		defer release()
		q := &query.GetPasswordCredential{Username: username}
		err := bus.Dispatch(c, q)
		if err != nil && errors.Cause(err) != app.ErrNotFound {
			return c.Failure(err)
		}
		hash := passwordauth.PlaceholderHash()
		var user *entity.User
		stamp := ""
		if q.Result != nil {
			hash = q.Result.PasswordHash
			user = q.Result.User
			if user != nil {
				stamp = user.SecurityStamp
			}
		}
		matches := passwordauth.Verify(hash, input.Password)
		input.Password = ""
		if !matches || user == nil || user.Status != enum.UserActive {
			return passwordError(c, 401, "", "auth.invalidlogin")
		}
		locked := &query.GetPasswordCredential{UserID: user.ID, Lock: true}
		if err := bus.Dispatch(c, locked); err != nil {
			if errors.Cause(err) == app.ErrNotFound {
				return passwordError(c, 401, "", "auth.invalidlogin")
			}
			return c.Failure(err)
		}
		credential := locked.Result
		if credential == nil || credential.User == nil || credential.User.SecurityStamp != stamp || credential.User.Status != enum.UserActive || credential.PasswordHash != hash {
			return passwordError(c, 401, "", "auth.invalidlogin")
		}
		purpose, next, cookie, lifetime := jwt.PasswordSessionPurpose, "signed_in", web.CookiePasswordSession, 12*time.Hour
		if credential.MustChangePassword {
			purpose = jwt.PasswordChangePurpose
			next = "password_change_required"
			cookie = web.CookiePasswordChange
			lifetime = 10 * time.Minute
		}
		now := time.Now()
		claims := jwt.PasswordClaims{UserID: user.ID, TenantID: c.Tenant().ID, Version: jwt.PasswordAuthVersion, Purpose: purpose, SecurityStamp: stamp, Metadata: jwt.Metadata{IssuedAt: jwt.Time(now), ExpiresAt: jwt.Time(now.Add(lifetime))}}
		token, err := jwt.Encode(claims)
		if err != nil {
			return c.Failure(err)
		}
		if err := c.Commit(); err != nil {
			return c.Failure(err)
		}
		success = true
		c.ClearPasswordCookies()
		c.SetPasswordCookie(cookie, token, now.Add(lifetime))
		return c.Ok(web.Map{"next": next})
	}
}

func PasswordChangePage() web.HandlerFunc {
	return func(c *web.Context) error {
		return c.Page(http.StatusOK, web.Props{Title: i18n.T(c, "auth.password.required"), Page: "SignIn/ChangePasswordRequired.page"})
	}
}

func ChangeAccountPassword(requireChange bool) web.HandlerFunc {
	return func(c *web.Context) error {
		claims, credential := c.PasswordClaims(), c.PasswordCredential()
		if claims == nil || credential == nil || credential.User == nil || credential.MustChangePassword != requireChange {
			return passwordError(c, 401, "", "auth.changed")
		}
		var input passwordInput
		if !bindPassword(c, &input) {
			return passwordError(c, 400, "", "auth.invalidinput")
		}
		if err := passwordauth.ValidatePassword(input.NewPassword); err != nil {
			return passwordPolicyError(c, "newPassword", input.NewPassword)
		}
		if input.NewPassword != input.ConfirmPassword {
			return passwordError(c, 400, "confirmPassword", "auth.password.mismatch")
		}
		if len(input.CurrentPassword) > 512 {
			return passwordError(c, 400, "currentPassword", "auth.password.current")
		}
		done, retry := passwordLimiter.Start(c.Tenant().ID, "change:"+credential.Username, c.Request.ClientIP())
		if done == nil {
			return passwordBusy(c, retry)
		}
		success := false
		defer func() { done(success) }()
		release, ok := passwordLimiter.Acquire(c)
		if !ok {
			return passwordBusy(c, time.Second)
		}
		defer release()
		if !requireChange && !passwordauth.Verify(credential.PasswordHash, input.CurrentPassword) {
			return passwordError(c, 400, "currentPassword", "auth.password.current")
		}
		if passwordauth.Verify(credential.PasswordHash, input.NewPassword) {
			return passwordError(c, 400, "newPassword", "auth.password.different")
		}
		hash, err := passwordauth.Hash(input.NewPassword)
		input = passwordInput{}
		if err != nil {
			return c.Failure(err)
		}
		command := &cmd.ChangePassword{UserID: claims.UserID, ExpectedStamp: claims.SecurityStamp, PasswordHash: hash, RequireChange: requireChange}
		if err := bus.Dispatch(c, command); err != nil {
			return passwordStoreFailure(c, err)
		}
		if err := c.Commit(); err != nil {
			return c.Failure(err)
		}
		success = true
		c.ClearPasswordCookies()
		auditAccount(c, "password_changed", claims.UserID)
		return c.Ok(web.Map{})
	}
}

func PasswordSignOut() web.HandlerFunc {
	return func(c *web.Context) error {
		if err := c.Commit(); err != nil {
			return c.Failure(err)
		}
		c.ClearPasswordCookies()
		c.Response.Header().Set("Cache-Control", "no-store")
		return c.Ok(web.Map{})
	}
}

func freshPasswordAdministrator(c *web.Context) error {
	claims := c.PasswordClaims()
	if claims == nil || claims.Purpose != jwt.PasswordSessionPurpose {
		return passwordauth.ErrUnauthorized
	}
	q := &query.GetPasswordCredential{UserID: claims.UserID, Lock: true}
	if err := bus.Dispatch(c, q); err != nil {
		return err
	}
	if q.Result == nil || q.Result.User == nil || q.Result.User.Status != enum.UserActive || q.Result.MustChangePassword || q.Result.User.SecurityStamp != claims.SecurityStamp || !q.Result.User.IsAdministrator() {
		return passwordauth.ErrUnauthorized
	}
	c.SetUser(q.Result.User)
	return nil
}

// ManagePasswordAccount serves create, initialize, reset, and atomic restore.
func ManagePasswordAccount(operation string) web.HandlerFunc {
	return func(c *web.Context) error {
		if c.User() == nil || !c.User().IsAdministrator() {
			return passwordError(c, 403, "", "auth.forbidden")
		}
		var input passwordInput
		if !bindPassword(c, &input) {
			return passwordError(c, 400, "", "auth.invalidinput")
		}
		generatedPassword := ""
		if input.Password == "" {
			var err error
			generatedPassword, err = passwordauth.GenerateTemporaryPassword()
			if err != nil {
				return c.Failure(err)
			}
			input.Password = generatedPassword
		}
		if err := passwordauth.ValidatePassword(input.Password); err != nil {
			return passwordPolicyError(c, "password", input.Password)
		}
		input.Username = passwordauth.NormalizeUsername(input.Username)
		if (operation == "create" || operation == "initialize") && passwordauth.ValidateUsername(input.Username) != nil {
			return passwordError(c, 400, "username", "auth.username.policy")
		}
		input.Name = strings.TrimSpace(input.Name)
		if operation == "create" && (input.Name == "" || utf8.RuneCountInString(input.Name) > 100 || !utf8.ValidString(input.Name)) {
			return passwordError(c, 400, "name", "auth.name.policy")
		}
		if operation == "create" && (input.Role < enum.RoleVisitor || input.Role > enum.RoleAdministrator) {
			return passwordError(c, 400, "role", "auth.role.invalid")
		}
		userID := 0
		if operation != "create" {
			param := "id"
			if operation == "restore" {
				param = "userID"
			}
			var err error
			userID, err = c.ParamAsInt(param)
			if err != nil || userID <= 0 {
				return passwordError(c, 404, "", "auth.account.notfound")
			}
			if userID == c.User().ID {
				return passwordError(c, 403, "", "auth.account.self")
			}
		}
		release, ok := passwordLimiter.Acquire(c)
		if !ok {
			return passwordBusy(c, time.Second)
		}
		hash, err := passwordauth.Hash(input.Password)
		release()
		input.Password = ""
		if err != nil {
			return c.Failure(err)
		}
		if err := freshPasswordAdministrator(c); err != nil {
			return passwordStoreFailure(c, err)
		}
		switch operation {
		case "create":
			command := &cmd.CreatePasswordAccount{Username: input.Username, Name: input.Name, PasswordHash: hash, Role: input.Role}
			err = bus.Dispatch(c, command)
			if command.Result != nil {
				userID = command.Result.ID
			}
		case "initialize":
			err = bus.Dispatch(c, &cmd.InitializePasswordAccount{UserID: userID, Username: input.Username, PasswordHash: hash})
		case "reset", "restore":
			err = bus.Dispatch(c, &cmd.ResetPasswordAccount{UserID: userID, PasswordHash: hash, Restore: operation == "restore"})
		default:
			return passwordError(c, 404, "", "auth.account.notfound")
		}
		if err != nil {
			return passwordStoreFailure(c, err)
		}
		if err := c.Commit(); err != nil {
			return c.Failure(err)
		}
		auditAccount(c, operation, userID)
		response := web.Map{"id": userID}
		if generatedPassword != "" {
			response["temporaryPassword"] = generatedPassword
		}
		return c.Ok(response)
	}
}

func auditAccount(c *web.Context, operation string, userID int) {
	actorID := 0
	if c.User() != nil {
		actorID = c.User().ID
	} else if claims := c.PasswordClaims(); claims != nil {
		actorID = claims.UserID
	}
	log.Infof(c, "Account operation @{Operation} by user @{ActorID} on user @{UserID} committed", dto.Props{"Operation": operation, "ActorID": actorID, "UserID": userID})
}
