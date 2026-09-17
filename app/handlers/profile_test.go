package handlers_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/getfider/fider/app/handlers"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
)

func TestScopedProfileHandlersDoNotWriteOtherModules(t *testing.T) {
	var names, avatars, notifications, combined int
	bus.AddHandler(func(_ context.Context, c *cmd.UpdateCurrentUserProfile) error {
		names++
		if c.Name != "昵称" {
			t.Fatalf("unexpected name %q", c.Name)
		}
		return nil
	})
	bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUserAvatar) error { avatars++; return nil })
	bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUserSettings) error { notifications++; return nil })
	bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUser) error { combined++; return nil })
	server := mock.NewServer()
	code, _ := server.OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecutePost(handlers.UpdateUserProfile(), `{"name":" 昵称 ","avatarType":"letter","settings":{"event_notification_new_post":"0"}}`)
	if code != http.StatusOK || names != 1 || avatars != 0 || notifications != 0 || combined != 0 {
		t.Fatal("profile write crossed module boundary", code, names, avatars, notifications, combined)
	}
	code, _ = server.OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecutePost(handlers.UpdateUserNotifications(), `{"name":"different","settings":{"event_notification_new_post":"0"}}`)
	if code != http.StatusOK || names != 1 || notifications != 1 || avatars != 0 || combined != 0 {
		t.Fatal("notification write crossed module boundary")
	}
	bus.AddHandler(func(_ context.Context, _ *cmd.UploadImage) error { return nil })
	bus.AddHandler(func(_ context.Context, q *query.GetUserByID) error {
		q.Result = &entity.User{AvatarType: enum.AvatarTypeLetter, AvatarURL: "/static/avatars/letter/1/name"}
		return nil
	})
	code, _ = server.OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecutePost(handlers.UpdateUserAvatar(), `{"name":"different","avatarType":"letter","avatar":{"remove":true},"settings":{"event_notification_new_post":"1"}}`)
	if code != http.StatusOK || avatars != 1 || names != 1 || notifications != 1 || combined != 0 {
		t.Fatal("avatar write crossed module boundary", code)
	}
}

func TestScopedProfileHandlersRejectInvalidChangesBeforeWriting(t *testing.T) {
	writes := 0
	bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUserProfile) error { writes++; return nil })
	bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUserAvatar) error { writes++; return nil })
	bus.AddHandler(func(_ context.Context, _ *cmd.UpdateCurrentUserSettings) error { writes++; return nil })
	bus.AddHandler(func(_ context.Context, _ *cmd.UploadImage) error { writes++; return nil })
	server := mock.NewServer()
	code, _ := server.OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecutePost(handlers.UpdateUserProfile(), `{"name":"昵称","username":null}`)
	if code != http.StatusBadRequest {
		t.Fatal("username mutation accepted")
	}
	code, _ = server.OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecutePost(handlers.UpdateUserAvatar(), `{"avatarType":"custom","avatar":{"bkey":"avatars/other-user"}}`)
	if code != http.StatusBadRequest {
		t.Fatal("foreign avatar reference accepted")
	}
	code, _ = server.OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecutePost(handlers.UpdateUserNotifications(), `{"settings":{"event_notification_new_post":"3"}}`)
	if code != http.StatusBadRequest || writes != 0 {
		t.Fatal("invalid requests wrote data")
	}
}
