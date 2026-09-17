package actions

import (
	"context"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/errors"
	"github.com/getfider/fider/app/pkg/validate"
)

// ChangeUserRole is the input model change role of an user
type ChangeUserRole struct {
	Role   enum.Role `route:"role"`
	UserID int       `json:"userID"`
}

// IsAuthorized returns true if current user is authorized to perform this action
func (action *ChangeUserRole) IsAuthorized(ctx context.Context, user *entity.User) bool {
	if user == nil {
		return false
	}
	return user.IsAdministrator() && user.ID != action.UserID
}

// Validate if current model is valid
func (action *ChangeUserRole) Validate(ctx context.Context, user *entity.User) *validate.Result {
	result := validate.Success()
	if action.Role < enum.RoleVisitor || action.Role > enum.RoleAdministrator {
		return validate.Error(app.ErrNotFound)
	}

	if user.ID == action.UserID {
		result.AddFieldFailure("userID", "It is not allowed to change your own Role.")
	}

	userByID := &query.GetUserByID{UserID: action.UserID, TenantID: user.Tenant.ID}
	err := bus.Dispatch(ctx, userByID)
	if err != nil {
		if errors.Cause(err) == app.ErrNotFound {
			result.AddFieldFailure("userID", "User not found.")
		} else {
			return validate.Error(err)
		}
	} else if userByID.Result.Tenant.ID != user.Tenant.ID {
		result.AddFieldFailure("userID", "User not found.")
	}
	return result
}
