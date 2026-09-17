package actions

import (
	"context"
	"encoding/json"
	"strings"
	"unicode/utf8"

	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/validate"
)

// UpdateUserSettings happens when users updates their settings
type UpdateUserSettings struct {
	// Detect attempts to change the login identifier, including null/empty input.
	Username   json.RawMessage   `json:"username"`
	Name       string            `json:"name"`
	AvatarType enum.AvatarType   `json:"avatarType"`
	Avatar     *dto.ImageUpload  `json:"avatar"`
	Settings   map[string]string `json:"settings"`
}

func NewUpdateUserSettings() *UpdateUserSettings {
	return &UpdateUserSettings{
		Avatar: &dto.ImageUpload{},
	}
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *UpdateUserSettings) IsAuthorized(ctx context.Context, user *entity.User) bool {
	return user != nil
}

// Validate if current model is valid
func (action *UpdateUserSettings) Validate(ctx context.Context, user *entity.User) *validate.Result {
	result := validate.Success()
	if action.Username != nil {
		result.AddFieldFailure("username", i18n.T(ctx, "auth.username.immutable"))
	}
	action.Name = strings.TrimSpace(action.Name)

	if action.Name == "" {
		result.AddFieldFailure("name", propertyIsRequired(ctx, "name"))
	}

	if action.AvatarType < 1 || action.AvatarType > 3 {
		result.AddFieldFailure("avatarType", propertyIsInvalid(ctx, "avatarType"))
	}

	if utf8.RuneCountInString(action.Name) > 100 || !utf8.ValidString(action.Name) {
		result.AddFieldFailure("name", propertyMaxStringLen(ctx, "name", 100))
	}

	action.Avatar.BlobKey = user.AvatarBlobKey
	messages, err := validate.ImageUpload(ctx, action.Avatar, validate.ImageUploadOpts{
		IsRequired:   action.AvatarType == enum.AvatarTypeCustom,
		MinHeight:    50,
		MinWidth:     50,
		ExactRatio:   true,
		MaxKilobytes: 100,
	})
	if err != nil {
		return validate.Error(err)
	}
	result.AddFieldFailure("avatar", messages...)

	if action.Settings != nil {
		for k, v := range action.Settings {
			ok := false
			for _, e := range enum.AllNotificationEvents {
				if e.UserSettingsKeyName == k {
					ok = true
					if !e.Validate(v) {
						result.AddFieldFailure("settings", i18n.T(ctx, "validation.invalidvalue", i18n.Params{"name": k}, i18n.Params{"value": v}))
					}
				}
			}
			if !ok {
				result.AddFieldFailure("settings", i18n.T(ctx, "validation.custom.unknownsettings", i18n.Params{"name": k}))
			}
		}
	}

	return result
}
