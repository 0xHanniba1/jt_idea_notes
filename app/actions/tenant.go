package actions

import (
	"context"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/validate"
)

// UpdateTenantSettings is the input model used to update tenant settings
type UpdateTenantSettings struct {
	Logo                *dto.ImageUpload `json:"logo"`
	Title               string           `json:"title"`
	Invitation          string           `json:"invitation"`
	WelcomeMessage      string           `json:"welcomeMessage"`
	WelcomeHeader       string           `json:"welcomeHeader"`
	DescriptionTemplate string           `json:"descriptionTemplate"`
	Locale              string           `json:"locale"`
	CNAME               string           `json:"cname" format:"lower"`
}

func NewUpdateTenantSettings() *UpdateTenantSettings {
	return &UpdateTenantSettings{
		Logo: &dto.ImageUpload{},
	}
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *UpdateTenantSettings) IsAuthorized(ctx context.Context, user *entity.User) bool {
	return user != nil && user.Role == enum.RoleAdministrator
}

// Validate if current model is valid
func (action *UpdateTenantSettings) Validate(ctx context.Context, user *entity.User) *validate.Result {
	result := validate.Success()

	tenant, hasTenant := ctx.Value(app.TenantCtxKey).(*entity.Tenant)
	if hasTenant {
		action.Logo.BlobKey = tenant.LogoBlobKey
	}

	messages, err := validate.ImageUpload(ctx, action.Logo, validate.ImageUploadOpts{
		IsRequired:   false,
		MinHeight:    200,
		MinWidth:     200,
		MaxKilobytes: 100,
		ExactRatio:   true,
	})
	if err != nil {
		return validate.Error(err)
	}
	result.AddFieldFailure("logo", messages...)

	if action.Title == "" {
		result.AddFieldFailure("title", i18n.T(ctx, "validation.admin.title.required"))
	}

	if len(action.Title) > 60 {
		result.AddFieldFailure("title", i18n.T(ctx, "validation.admin.title.maxbytes"))
	}

	if len(action.Invitation) > 60 {
		result.AddFieldFailure("invitation", i18n.T(ctx, "validation.admin.invitation.maxbytes"))
	}

	if len(action.WelcomeHeader) > 100 {
		result.AddFieldFailure("welcomeHeader", i18n.T(ctx, "validation.admin.welcomeheader.maxbytes"))
	}

	if len(action.DescriptionTemplate) > 2000 {
		result.AddFieldFailure("descriptionTemplate", i18n.T(ctx, "validation.admin.descriptiontemplate.maxbytes"))
	}

	if !i18n.IsValidLocale(action.Locale) {
		result.AddFieldFailure("locale", i18n.T(ctx, "validation.admin.locale.invalid"))
	}

	if action.CNAME != "" {
		messages := validate.CNAME(ctx, action.CNAME)
		result.AddFieldFailure("cname", messages...)
	}

	return result
}

// UpdateTenantAdvancedSettings is the input model used to update tenant advanced settings
type UpdateTenantAdvancedSettings struct {
	CustomCSS      string `json:"customCSS"`
	AllowedSchemes string `json:"allowedSchemes"`
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *UpdateTenantAdvancedSettings) IsAuthorized(ctx context.Context, user *entity.User) bool {
	return user != nil && user.Role == enum.RoleAdministrator
}

// Validate if current model is valid
func (action *UpdateTenantAdvancedSettings) Validate(ctx context.Context, user *entity.User) *validate.Result {
	return validate.Success()
}

// UpdateTenantPrivacySettings is the input model used to update tenant privacy settings
type UpdateTenantPrivacySettings struct {
	IsPrivate     bool `json:"isPrivate"`
	IsFeedEnabled bool `json:"isFeedEnabled"`
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *UpdateTenantPrivacySettings) IsAuthorized(ctx context.Context, user *entity.User) bool {
	return user != nil && user.Role == enum.RoleAdministrator
}

// Validate if current model is valid
func (action *UpdateTenantPrivacySettings) Validate(ctx context.Context, user *entity.User) *validate.Result {
	if action.IsPrivate && action.IsFeedEnabled {
		return validate.Failed(i18n.T(ctx, "validation.admin.feed.private"))
	}
	return validate.Success()
}
