package handlers

import (
	"net/http"

	"github.com/getfider/fider/app/models/query"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/pkg/bus"

	"github.com/getfider/fider/app/actions"
	"github.com/getfider/fider/app/pkg/web"
)

// UserSettings is the current user's profile settings page
func UserSettings() web.HandlerFunc {
	return func(c *web.Context) error {
		settings := &query.GetCurrentUserSettings{}
		if err := bus.Dispatch(c, settings); err != nil {
			return err
		}

		return c.Page(http.StatusOK, web.Props{
			Page:  "MySettings/MySettings.page",
			Title: "Settings",
			Data: web.Map{
				"userSettings": settings.Result,
			},
		})
	}
}

// UpdateUserSettings updates current user settings
func UpdateUserSettings() web.HandlerFunc {
	return func(c *web.Context) error {
		action := actions.NewUpdateUserSettings()
		if result := c.BindTo(action); !result.Ok {
			return c.HandleValidation(result)
		}

		if err := bus.Dispatch(c,
			&cmd.UploadImage{
				Image:  action.Avatar,
				Folder: "avatars",
			},
			&cmd.UpdateCurrentUser{
				Name:       action.Name,
				Avatar:     action.Avatar,
				AvatarType: action.AvatarType,
			},
			&cmd.UpdateCurrentUserSettings{
				Settings: action.Settings,
			},
		); err != nil {
			return c.Failure(err)
		}

		return c.Ok(web.Map{})
	}
}

// ChangeUserRole changes given user role
func ChangeUserRole() web.HandlerFunc {
	return func(c *web.Context) error {
		action := new(actions.ChangeUserRole)
		if result := c.BindTo(action); !result.Ok {
			return c.HandleValidation(result)
		}

		changeRole := &cmd.ChangeUserRole{
			UserID: action.UserID,
			Role:   action.Role,
		}

		if err := bus.Dispatch(c, changeRole); err != nil {
			return passwordStoreFailure(c, err)
		}

		if err := c.Commit(); err != nil {
			return c.Failure(err)
		}
		return c.Ok(web.Map{})
	}
}

// DeleteUser erases current user personal data and sign them out
func DeleteUser() web.HandlerFunc {
	return func(c *web.Context) error {
		if err := bus.Dispatch(c, &cmd.DeleteCurrentUser{}); err != nil {
			return passwordStoreFailure(c, err)
		}

		if err := c.Commit(); err != nil {
			return c.Failure(err)
		}
		c.ClearPasswordCookies()
		return c.Ok(web.Map{})
	}
}

// RegenerateAPIKey regenerates current user's API Key
func RegenerateAPIKey() web.HandlerFunc {
	return func(c *web.Context) error {
		regenerateAPIKey := &cmd.RegenerateAPIKey{}
		if err := bus.Dispatch(c, regenerateAPIKey); err != nil {
			return c.Failure(err)
		}

		return c.Ok(web.Map{
			"apiKey": regenerateAPIKey.Result,
		})
	}
}
