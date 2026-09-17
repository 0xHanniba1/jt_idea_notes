package handlers_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/getfider/fider/app"

	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"

	"github.com/getfider/fider/app/models/cmd"

	"github.com/getfider/fider/app/handlers"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
)

func TestSettingsHandler(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.GetCurrentUserSettings) error {
		return nil
	})

	server := mock.NewServer()
	code, _ := server.
		AsUser(mock.JonSnow).
		Execute(handlers.UserSettings())

	Expect(code).Equals(http.StatusOK)
}

func TestUpdateUserSettingsHandler_EmptyInput(t *testing.T) {
	RegisterT(t)

	server := mock.NewServer()
	code, _ := server.
		AsUser(mock.JonSnow).
		ExecutePost(handlers.UpdateUserSettings(), `{ }`)

	Expect(code).Equals(http.StatusBadRequest)
}

func TestUpdateUserSettingsHandler_ValidName(t *testing.T) {
	RegisterT(t)

	var newName string
	bus.AddHandler(func(ctx context.Context, c *cmd.UpdateCurrentUser) error {
		newName = c.Name
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.UpdateCurrentUserSettings) error {
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImage) error {
		Expect(c.Image.Upload).IsNil()
		Expect(c.Image.Remove).IsFalse()
		return nil
	})

	server := mock.NewServer()
	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		ExecutePost(handlers.UpdateUserSettings(), `{ "name": "Jon Stark", "avatarType": "letter" }`)

	Expect(code).Equals(http.StatusOK)
	Expect(newName).Equals("Jon Stark")
}

func TestUpdateUserSettingsHandler_NewSettings(t *testing.T) {
	RegisterT(t)

	var updateCmd *cmd.UpdateCurrentUser
	bus.AddHandler(func(ctx context.Context, c *cmd.UpdateCurrentUser) error {
		updateCmd = c
		return nil
	})

	var updateSettingsCmd *cmd.UpdateCurrentUserSettings
	bus.AddHandler(func(ctx context.Context, c *cmd.UpdateCurrentUserSettings) error {
		updateSettingsCmd = c
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImage) error {
		Expect(c.Image.Upload).IsNil()
		Expect(c.Image.Remove).IsFalse()
		return nil
	})

	server := mock.NewServer()
	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		ExecutePost(handlers.UpdateUserSettings(), `{
			"name": "Jon Stark",
			"avatarType": "letter",
			"settings": {
				"event_notification_new_post": "1",
				"event_notification_new_comment": "0",
				"event_notification_change_status": "1"
			}
		}`)

	Expect(code).Equals(http.StatusOK)
	Expect(updateCmd.Name).Equals("Jon Stark")
	Expect(updateCmd.AvatarType).Equals(enum.AvatarTypeLetter)

	Expect(updateSettingsCmd.Settings[enum.NotificationEventNewPost.UserSettingsKeyName]).Equals("1")
	Expect(updateSettingsCmd.Settings[enum.NotificationEventNewComment.UserSettingsKeyName]).Equals("0")
	Expect(updateSettingsCmd.Settings[enum.NotificationEventChangeStatus.UserSettingsKeyName]).Equals("1")
}

func TestChangeRoleHandler_Valid(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.GetUserByID) error {
		if q.UserID == mock.AryaStark.ID {
			q.Result = mock.AryaStark
			return nil
		}
		return app.ErrNotFound
	})

	var changeRole *cmd.ChangeUserRole
	bus.AddHandler(func(ctx context.Context, c *cmd.ChangeUserRole) error {
		changeRole = c
		return nil
	})

	server := mock.NewServer()
	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("role", enum.RoleAdministrator).
		ExecutePost(handlers.ChangeUserRole(), fmt.Sprintf(`{ "userID": %d }`, mock.AryaStark.ID))

	Expect(code).Equals(http.StatusOK)
	Expect(changeRole.UserID).Equals(mock.AryaStark.ID)
	Expect(changeRole.Role).Equals(enum.RoleAdministrator)
}
