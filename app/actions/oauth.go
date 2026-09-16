package actions

import (
	"context"
	"strings"

	"github.com/getfider/fider/app"

	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/i18n"

	"github.com/getfider/fider/app/pkg/rand"
	"github.com/getfider/fider/app/pkg/validate"
)

// CreateEditOAuthConfig is used to create/edit OAuth config
type CreateEditOAuthConfig struct {
	ID                int
	Logo              *dto.ImageUpload `json:"logo"`
	Provider          string           `json:"provider"`
	Status            int              `json:"status"`
	DisplayName       string           `json:"displayName"`
	ClientID          string           `json:"clientID"`
	ClientSecret      string           `json:"clientSecret"`
	AuthorizeURL      string           `json:"authorizeURL"`
	TokenURL          string           `json:"tokenURL"`
	Scope             string           `json:"scope"`
	ProfileURL        string           `json:"profileURL"`
	IsTrusted         bool             `json:"isTrusted"`
	JSONUserIDPath    string           `json:"jsonUserIDPath"`
	JSONUserNamePath  string           `json:"jsonUserNamePath"`
	JSONUserEmailPath string           `json:"jsonUserEmailPath"`
	JSONUserRolesPath string           `json:"jsonUserRolesPath"`
	AllowedRoles      string           `json:"allowedRoles"`
}

func NewCreateEditOAuthConfig() *CreateEditOAuthConfig {
	return &CreateEditOAuthConfig{
		Logo: &dto.ImageUpload{},
	}
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *CreateEditOAuthConfig) IsAuthorized(ctx context.Context, user *entity.User) bool {
	return user != nil && user.IsAdministrator()
}

// SetSystemProviderStatus is used to enable/disable built-in OAuth providers
type SetSystemProviderStatus struct {
	Provider  string `json:"provider"`
	IsEnabled bool   `json:"isEnabled"`
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *SetSystemProviderStatus) IsAuthorized(ctx context.Context, user *entity.User) bool {
	return user != nil && user.IsAdministrator()
}

// Validate if current model is valid
func (action *SetSystemProviderStatus) Validate(ctx context.Context, user *entity.User) *validate.Result {
	result := validate.Success()

	if !action.IsEnabled {
		tenant := ctx.Value(app.TenantCtxKey).(*entity.Tenant)
		activeProviders := &query.ListActiveOAuthProviders{}
		if err := bus.Dispatch(ctx, activeProviders); err != nil {
			return validate.Failed(i18n.T(ctx, "validation.oauth.providersfailed"))
		}

		if !tenant.IsEmailAuthAllowed && len(activeProviders.Result) == 1 {
			result.AddFieldFailure("isEnabled", i18n.T(ctx, "validation.oauth.lastprovider"))
		}
	}

	if action.Provider == "" {
		result.AddFieldFailure("provider", i18n.T(ctx, "validation.oauth.providerrequired"))
	}

	return result
}

func (action *CreateEditOAuthConfig) Validate(ctx context.Context, user *entity.User) *validate.Result {
	result := validate.Success()

	if action.Status == enum.OAuthConfigDisabled {
		tenant := ctx.Value(app.TenantCtxKey).(*entity.Tenant)
		activeProviders := &query.ListActiveOAuthProviders{}
		if err := bus.Dispatch(ctx, activeProviders); err != nil {
			return validate.Failed(i18n.T(ctx, "validation.oauth.providersfailed"))
		}

		if !tenant.IsEmailAuthAllowed && len(activeProviders.Result) == 1 {
			result.AddFieldFailure("status", i18n.T(ctx, "validation.oauth.lastprovider"))
		}
	}

	if action.Provider != "" {
		getConfig := &query.GetCustomOAuthConfigByProvider{Provider: action.Provider}
		err := bus.Dispatch(ctx, getConfig)
		if err != nil {
			return validate.Error(err)
		}

		action.ID = getConfig.Result.ID
		action.Logo.BlobKey = getConfig.Result.LogoBlobKey
		if action.ClientSecret == "" {
			action.ClientSecret = getConfig.Result.ClientSecret
		}
	} else {
		action.Provider = "_" + strings.ToLower(rand.String(10))
	}

	messages, err := validate.ImageUpload(ctx, action.Logo, validate.ImageUploadOpts{
		IsRequired:   false,
		MinHeight:    24,
		MinWidth:     24,
		ExactRatio:   true,
		MaxKilobytes: 50,
	})
	if err != nil {
		return validate.Error(err)
	}
	result.AddFieldFailure("logo", messages...)

	if action.Status != enum.OAuthConfigEnabled &&
		action.Status != enum.OAuthConfigDisabled {
		result.AddFieldFailure("status", i18n.T(ctx, "validation.oauth.invalidstatus"))
	}

	if action.DisplayName == "" {
		result.AddFieldFailure("displayName", i18n.T(ctx, "validation.oauth.displaynamerequired"))
	} else if len(action.DisplayName) > 50 {
		result.AddFieldFailure("displayName", i18n.T(ctx, "validation.oauth.displaynametoolong"))
	}

	if action.ClientID == "" {
		result.AddFieldFailure("clientID", i18n.T(ctx, "validation.oauth.clientidrequired"))
	} else if len(action.ClientID) > 100 {
		result.AddFieldFailure("clientID", i18n.T(ctx, "validation.oauth.clientidtoolong"))
	}

	if action.ClientSecret == "" {
		result.AddFieldFailure("clientSecret", i18n.T(ctx, "validation.oauth.clientsecretrequired"))
	} else if len(action.ClientSecret) > 500 {
		result.AddFieldFailure("clientSecret", i18n.T(ctx, "validation.oauth.clientsecrettoolong"))
	}

	if action.Scope == "" {
		result.AddFieldFailure("scope", i18n.T(ctx, "validation.oauth.scoperequired"))
	} else if len(action.Scope) > 100 {
		result.AddFieldFailure("scope", i18n.T(ctx, "validation.oauth.scopetoolong"))
	}

	if action.AuthorizeURL == "" {
		result.AddFieldFailure("authorizeURL", i18n.T(ctx, "validation.oauth.authorizeurlrequired"))
	} else if messages := validate.URL(ctx, action.AuthorizeURL); len(messages) > 0 {
		result.AddFieldFailure("authorizeURL", messages...)
	}

	if action.TokenURL == "" {
		result.AddFieldFailure("tokenURL", i18n.T(ctx, "validation.oauth.tokenurlrequired"))
	} else if messages := validate.URL(ctx, action.TokenURL); len(messages) > 0 {
		result.AddFieldFailure("tokenURL", messages...)
	}

	if action.ProfileURL != "" {
		if messages := validate.URL(ctx, action.ProfileURL); len(messages) > 0 {
			result.AddFieldFailure("profileURL", messages...)
		}
	}

	if action.JSONUserIDPath == "" {
		result.AddFieldFailure("jsonUserIDPath", i18n.T(ctx, "validation.oauth.useridpathrequired"))
	} else if len(action.JSONUserIDPath) > 100 {
		result.AddFieldFailure("jsonUserIDPath", i18n.T(ctx, "validation.oauth.useridpathtoolong"))
	}

	if len(action.JSONUserNamePath) > 100 {
		result.AddFieldFailure("jsonUserNamePath", i18n.T(ctx, "validation.oauth.usernamepathtoolong"))
	}

	if len(action.JSONUserEmailPath) > 100 {
		result.AddFieldFailure("jsonUserEmailPath", i18n.T(ctx, "validation.oauth.useremailpathtoolong"))
	}

	if len(action.JSONUserRolesPath) > 100 {
		result.AddFieldFailure("jsonUserRolesPath", i18n.T(ctx, "validation.oauth.userrolespathtoolong"))
	}

	if len(action.AllowedRoles) > 500 {
		result.AddFieldFailure("allowedRoles", i18n.T(ctx, "validation.oauth.allowedrolestoolong"))
	}

	return result
}
