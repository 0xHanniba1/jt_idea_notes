package cmd

import (
	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
)

type BlockUser struct {
	UserID int
}

type UnblockUser struct {
	UserID int
}

type RegenerateAPIKey struct {
	Result string
}

type ChangeUserRole struct {
	UserID int
	Role   enum.Role
}

type UpdateCurrentUserSettings struct {
	Settings map[string]string
}

type RegisterUser struct {
	User *entity.User
}

type RegisterUserProvider struct {
	UserID       int
	ProviderName string
	ProviderUID  string
}

type UpdateCurrentUser struct {
	Name       string
	AvatarType enum.AvatarType
	Avatar     *dto.ImageUpload
}

type RotateAllUserSecurityStamps struct{}

// UpdateCurrentUserProfile writes only the display name.
type UpdateCurrentUserProfile struct{ Name string }

// UpdateCurrentUserAvatar writes only avatar fields.
type UpdateCurrentUserAvatar struct {
	AvatarType enum.AvatarType
	Avatar     *dto.ImageUpload
}
