package actions_test

import (
	"context"
	"testing"

	"github.com/getfider/fider/app"

	"github.com/getfider/fider/app/actions"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"

	. "github.com/getfider/fider/app/pkg/assert"
)

func TestUpdateTenantSettings_Unauthorized(t *testing.T) {
	RegisterT(t)

	admin := &entity.User{ID: 1, Role: enum.RoleAdministrator}
	collaborator := &entity.User{ID: 2, Role: enum.RoleCollaborator}

	action := actions.NewUpdateTenantSettings()

	Expect(action.IsAuthorized(context.Background(), admin)).IsTrue()
	Expect(action.IsAuthorized(context.Background(), collaborator)).IsFalse()
	Expect(action.IsAuthorized(context.Background(), nil)).IsFalse()
}

func TestUpdateTenantSettings_EmptyTitle(t *testing.T) {
	RegisterT(t)

	action := actions.UpdateTenantSettings{Locale: "en"}
	result := action.Validate(context.Background(), nil)
	ExpectFailed(result, "title")
}

func TestUpdateTenantSettings_InvalidCNAME(t *testing.T) {
	RegisterT(t)

	action := actions.UpdateTenantSettings{Title: "Ok", CNAME: "bla", Locale: "en"}
	result := action.Validate(context.Background(), nil)
	ExpectFailed(result, "cname")
}

func TestUpdateTenantSettings_LargeTitle(t *testing.T) {
	RegisterT(t)

	action := actions.UpdateTenantSettings{Title: "123456789012345678901234567890123456789012345678901234567890123", Locale: "en"}
	result := action.Validate(context.Background(), nil)
	ExpectFailed(result, "title")
}

func TestUpdateTenantSettings_LargeInvitation(t *testing.T) {
	RegisterT(t)

	action := actions.UpdateTenantSettings{Title: "Ok", Invitation: "123456789012345678901234567890123456789012345678901234567890123", Locale: "en"}
	result := action.Validate(context.Background(), nil)
	ExpectFailed(result, "invitation")
}

func TestUpdateTenantSettings_InvalidLocale(t *testing.T) {
	RegisterT(t)

	action := actions.UpdateTenantSettings{Title: "Some Name", Locale: "xx"}
	result := action.Validate(context.Background(), nil)
	ExpectFailed(result, "locale")
}

func TestUpdateTenantSettings_ExistingTenant_WithLogo(t *testing.T) {
	RegisterT(t)

	ctx := context.WithValue(context.Background(), app.TenantCtxKey, &entity.Tenant{
		ID:          1,
		LogoBlobKey: "hello-world.png",
	})

	action := actions.NewUpdateTenantSettings()
	action.Title = "OK"
	action.Invitation = "Share your ideas!"
	action.Locale = "en"
	result := action.Validate(ctx, nil)
	ExpectSuccess(result)
	Expect(action.Logo.BlobKey).Equals("hello-world.png")
}
