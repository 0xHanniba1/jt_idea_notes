package handlers

import (
	"net/http"

	"github.com/getfider/fider/app/actions"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/web"
)

// GeneralSettingsPage is the general settings page
func GeneralSettingsPage() web.HandlerFunc {
	return func(c *web.Context) error {
		return c.Page(http.StatusOK, web.Props{
			Page:  "Administration/pages/GeneralSettings.page",
			Title: i18n.T(c, "admin.title.general"),
		})
	}
}

// AdvancedSettingsPage is the advanced settings page
func AdvancedSettingsPage() web.HandlerFunc {
	return func(c *web.Context) error {
		return c.Page(http.StatusOK, web.Props{
			Page:  "Administration/pages/AdvancedSettings.page",
			Title: i18n.T(c, "admin.title.advanced"),
			Data: web.Map{
				"customCSS":      c.Tenant().CustomCSS,
				"allowedSchemes": c.Tenant().AllowedSchemes,
			},
		})
	}
}

// UpdateSettings update current tenant' settings
func UpdateSettings() web.HandlerFunc {
	return func(c *web.Context) error {
		action := actions.NewUpdateTenantSettings()
		if result := c.BindTo(action); !result.Ok {
			return c.HandleValidation(result)
		}

		if err := bus.Dispatch(c,
			&cmd.UploadImage{
				Image:  action.Logo,
				Folder: "logos",
			},
			&cmd.UpdateTenantSettings{
				Logo:                action.Logo,
				Title:               action.Title,
				Invitation:          action.Invitation,
				WelcomeMessage:      action.WelcomeMessage,
				WelcomeHeader:       action.WelcomeHeader,
				DescriptionTemplate: action.DescriptionTemplate,
				CNAME:               action.CNAME,
				Locale:              action.Locale,
			},
		); err != nil {
			return c.Failure(err)
		}

		return c.Ok(web.Map{})
	}
}

// UpdateAdvancedSettings update current tenant' advanced settings
func UpdateAdvancedSettings() web.HandlerFunc {
	return func(c *web.Context) error {
		action := new(actions.UpdateTenantAdvancedSettings)
		if result := c.BindTo(action); !result.Ok {
			return c.HandleValidation(result)
		}

		if err := bus.Dispatch(c, &cmd.UpdateTenantAdvancedSettings{
			CustomCSS:      action.CustomCSS,
			AllowedSchemes: action.AllowedSchemes,
		}); err != nil {
			return c.Failure(err)
		}

		return c.Ok(web.Map{})
	}
}

// UpdatePrivacySettings update current tenant's privacy settings
func UpdatePrivacySettings() web.HandlerFunc {
	return func(c *web.Context) error {
		action := new(actions.UpdateTenantPrivacySettings)
		if result := c.BindTo(action); !result.Ok {
			return c.HandleValidation(result)
		}

		if !action.IsPrivate {
			return passwordError(c, 400, "isPrivate", "auth.internalonly")
		}

		updateSettings := &cmd.UpdateTenantPrivacySettings{
			IsPrivate:     action.IsPrivate,
			IsFeedEnabled: action.IsFeedEnabled,
		}
		if err := bus.Dispatch(c, updateSettings); err != nil {
			return c.Failure(err)
		}

		return c.Ok(web.Map{})
	}
}

// ManageMembers is the page used by administrators to change member's role
func ManageMembers() web.HandlerFunc {
	return func(c *web.Context) error {
		status := c.QueryParam("status")
		if status != "" && status != "all" && status != "active" && status != "inactive" {
			return c.BadRequest(web.Map{})
		}
		// Only load first page for initial page load - subsequent pagination handled by API
		page, _ := c.QueryParamAsInt("page")
		if page <= 0 {
			page = 1
		}

		searchUsers := &query.SearchUsers{
			Status: status,
			Query:  c.QueryParam("query"),
			Roles:  c.QueryParamAsArray("roles"),
			Page:   page,
			Limit:  10,
		}

		if err := bus.Dispatch(c, searchUsers); err != nil {
			return c.Failure(err)
		}

		// Create an array of UserWithAccount structs from the searchUsers.Result
		accounts := make([]entity.UserWithAccount, len(searchUsers.Result))
		for i, user := range searchUsers.Result {
			accounts[i] = entity.UserWithAccount{
				User: user,
			}
		}

		return c.Page(http.StatusOK, web.Props{
			Page:  "Administration/pages/ManageMembers.page",
			Title: i18n.T(c, "admin.title.users"),
			Data: web.Map{
				"users":      accounts,
				"totalCount": searchUsers.TotalCount,
				"totalPages": (searchUsers.TotalCount + 10 - 1) / 10,
			},
		})
	}
}

// GetOAuthConfig returns OAuth config based on given provider

// SaveOAuthConfig is used to create/edit OAuth configurations

// SetSystemProviderStatus is used to enable/disable built-in OAuth providers for a tenant

// AdminPage renders a settings page using the current site's language.
func AdminPage(titleKey, page string) web.HandlerFunc {
	return func(c *web.Context) error {
		return c.Page(http.StatusOK, web.Props{Page: page, Title: i18n.T(c, titleKey)})
	}
}
