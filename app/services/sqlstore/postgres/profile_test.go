package postgres_test

import (
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"testing"
)

func TestScopedProfilePersistencePreservesOtherModules(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	ctx := passwordAccountForTest(t, jonSnow, "jon.snow")
	before := passwordCredentialForTest(t, ctx, jonSnow.ID)
	key := "event_notification_new_post"
	if err := bus.Dispatch(ctx, &cmd.UpdateCurrentUserSettings{Settings: map[string]string{key: "0"}}, &cmd.UpdateCurrentUserAvatar{AvatarType: enum.AvatarTypeCustom, Avatar: &dto.ImageUpload{BlobKey: "avatars/synthetic.png"}}, &cmd.UpdateCurrentUserProfile{Name: "新昵称"}); err != nil {
		t.Fatal(err)
	}
	after := passwordCredentialForTest(t, ctx, jonSnow.ID)
	if after.User.Name != "新昵称" || after.User.AvatarBlobKey != "avatars/synthetic.png" || after.User.AvatarType != enum.AvatarTypeCustom {
		t.Fatal("scoped changes did not compose")
	}
	if after.Username != before.Username || after.PasswordHash != before.PasswordHash || after.User.SecurityStamp != before.User.SecurityStamp {
		t.Fatal("profile changes modified credentials")
	}
	prefs := &query.GetCurrentUserSettings{}
	if err := bus.Dispatch(ctx, prefs); err != nil || prefs.Result[key] != "0" {
		t.Fatal("profile/avatar changed notification setting", err)
	}
	if err := bus.Dispatch(ctx, &cmd.UpdateCurrentUserAvatar{AvatarType: enum.AvatarTypeLetter, Avatar: &dto.ImageUpload{Remove: true}}); err != nil {
		t.Fatal(err)
	}
	after = passwordCredentialForTest(t, ctx, jonSnow.ID)
	if after.User.Name != "新昵称" || after.User.AvatarBlobKey != "" || after.User.AvatarType != enum.AvatarTypeLetter {
		t.Fatal("avatar removal changed name or failed to restore default")
	}
}
