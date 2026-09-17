package actions

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"strings"
	"unicode/utf8"

	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/validate"
)

// UpdateUserProfile changes only the current user's display name.
type UpdateUserProfile struct {
	Username json.RawMessage `json:"username"`
	Name     string          `json:"name"`
}

func (action *UpdateUserProfile) IsAuthorized(_ context.Context, user *entity.User) bool {
	return user != nil
}
func (action *UpdateUserProfile) Validate(ctx context.Context, _ *entity.User) *validate.Result {
	result := validate.Success()
	if action.Username != nil {
		result.AddFieldFailure("username", i18n.T(ctx, "auth.username.immutable"))
	}
	action.Name = strings.TrimSpace(action.Name)
	if action.Name == "" {
		result.AddFieldFailure("name", propertyIsRequired(ctx, "name"))
	}
	if !utf8.ValidString(action.Name) || utf8.RuneCountInString(action.Name) > 100 {
		result.AddFieldFailure("name", propertyMaxStringLen(ctx, "name", 100))
	}
	return result
}

// UpdateUserNotifications changes only in-app notification preferences.
type UpdateUserNotifications struct {
	Settings map[string]string `json:"settings"`
}

func (action *UpdateUserNotifications) IsAuthorized(_ context.Context, user *entity.User) bool {
	return user != nil
}
func (action *UpdateUserNotifications) Validate(ctx context.Context, _ *entity.User) *validate.Result {
	result := validate.Success()
	for key, value := range action.Settings {
		known := false
		for _, event := range enum.AllNotificationEvents {
			if event.UserSettingsKeyName == key {
				known = true
				if !event.Validate(value) {
					result.AddFieldFailure("settings", i18n.T(ctx, "validation.invalidvalue", i18n.Params{"name": key}, i18n.Params{"value": value}))
				}
			}
		}
		if !known {
			result.AddFieldFailure("settings", i18n.T(ctx, "validation.custom.unknownsettings", i18n.Params{"name": key}))
		}
	}
	return result
}

// UpdateUserAvatar changes only the current user's avatar.
type UpdateUserAvatar struct {
	AvatarType enum.AvatarType  `json:"avatarType"`
	Avatar     *dto.ImageUpload `json:"avatar"`
}

func (action *UpdateUserAvatar) IsAuthorized(_ context.Context, user *entity.User) bool {
	return user != nil
}
func (action *UpdateUserAvatar) Validate(ctx context.Context, _ *entity.User) *validate.Result {
	result := validate.Success()
	if action.AvatarType != enum.AvatarTypeCustom && action.AvatarType != enum.AvatarTypeLetter {
		result.AddFieldFailure("avatarType", propertyIsInvalid(ctx, "avatarType"))
		return result
	}
	if action.Avatar == nil {
		result.AddFieldFailure("avatar", propertyIsRequired(ctx, "image"))
		return result
	}
	// Never accept client-provided blob keys or let this endpoint reuse another user's image.
	action.Avatar.BlobKey = ""
	if action.AvatarType == enum.AvatarTypeLetter {
		if !action.Avatar.Remove || action.Avatar.Upload != nil {
			result.AddFieldFailure("avatar", propertyIsInvalid(ctx, "image"))
		}
		return result
	}
	if action.Avatar.Remove || action.Avatar.Upload == nil || len(action.Avatar.Upload.Content) == 0 {
		result.AddFieldFailure("avatar", propertyIsRequired(ctx, "image"))
		return result
	}
	data := action.Avatar.Upload
	if len(data.Content) > 512*1024 {
		result.AddFieldFailure("avatar", i18n.T(ctx, "validation.custom.maximagesize", i18n.Params{"kilobytes": 512}))
		return result
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(data.Content))
	if err != nil || format != "png" {
		result.AddFieldFailure("avatar", i18n.T(ctx, "validation.custom.unsupportedfileformat"))
		return result
	}
	if config.Width < 50 || config.Height < 50 {
		result.AddFieldFailure("avatar", i18n.T(ctx, "validation.custom.minimagedimensions", i18n.Params{"width": 50, "height": 50}))
		return result
	}
	if config.Width != config.Height {
		result.AddFieldFailure("avatar", i18n.T(ctx, "validation.custom.imagesquareratio"))
		return result
	}
	// Bound decoding memory even for highly compressed, malicious image headers.
	if config.Width > 4096 {
		result.AddFieldFailure("avatar", propertyIsInvalid(ctx, "image"))
		return result
	}
	decoded, _, err := image.Decode(bytes.NewReader(data.Content))
	if err != nil {
		result.AddFieldFailure("avatar", i18n.T(ctx, "validation.custom.unsupportedfileformat"))
		return result
	}
	// Re-encode one decoded frame so metadata, trailing payloads and animations
	// cannot enter storage through a forged crop request.
	var clean bytes.Buffer
	if err := png.Encode(&clean, decoded); err != nil {
		return validate.Error(err)
	}
	if clean.Len() > 512*1024 {
		result.AddFieldFailure("avatar", i18n.T(ctx, "validation.custom.maximagesize", i18n.Params{"kilobytes": 512}))
		return result
	}
	data.Content = clean.Bytes()
	data.ContentType = "image/png"
	data.FileName = "avatar.png"
	return result
}
