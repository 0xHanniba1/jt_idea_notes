package actions_test

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/png"
	"math/rand"
	"strings"
	"testing"

	"github.com/getfider/fider/app/actions"
	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
)

func profileTestPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	var data bytes.Buffer
	if err := png.Encode(&data, image.NewRGBA(image.Rect(0, 0, w, h))); err != nil {
		t.Fatal(err)
	}
	return data.Bytes()
}
func TestScopedProfileValidation(t *testing.T) {
	for _, name := range []string{"", "  ", strings.Repeat("字", 101)} {
		a := &actions.UpdateUserProfile{Name: name}
		if a.Validate(context.Background(), nil).Ok {
			t.Errorf("accepted name %q", name)
		}
	}
	a := &actions.UpdateUserProfile{Name: "  昵称  "}
	if !a.Validate(context.Background(), nil).Ok || a.Name != "昵称" {
		t.Fatal("nickname validation failed")
	}
	a.Username = json.RawMessage(`null`)
	if a.Validate(context.Background(), nil).Ok {
		t.Fatal("accepted username mutation")
	}
	if a.IsAuthorized(context.Background(), nil) {
		t.Fatal("anonymous profile mutation")
	}
}
func TestScopedNotificationValidation(t *testing.T) {
	for _, settings := range []map[string]string{{"unknown": "1"}, {"event_notification_new_post": "2"}, {"event_notification_new_post": "3"}} {
		a := &actions.UpdateUserNotifications{Settings: settings}
		if a.Validate(context.Background(), nil).Ok {
			t.Fatalf("accepted invalid settings %v", settings)
		}
	}
	a := &actions.UpdateUserNotifications{Settings: map[string]string{"event_notification_new_post": "0", "event_notification_mention": "1"}}
	if !a.Validate(context.Background(), nil).Ok || a.IsAuthorized(context.Background(), nil) {
		t.Fatal("invalid notification authorization or preferences")
	}
}
func TestScopedAvatarValidation(t *testing.T) {
	good := profileTestPNG(t, 256, 256)
	noisy := image.NewRGBA(image.Rect(0, 0, 256, 256))
	random := rand.New(rand.NewSource(1))
	for i := range noisy.Pix {
		noisy.Pix[i] = byte(random.Intn(256))
	}
	var noisyData bytes.Buffer
	if err := png.Encode(&noisyData, noisy); err != nil {
		t.Fatal(err)
	}
	if noisyData.Len() <= 100*1024 || noisyData.Len() > 512*1024 {
		t.Fatal("fixture must exercise the raised avatar limit")
	}

	user := &entity.User{AvatarBlobKey: "avatars/existing"}
	tests := []struct {
		name   string
		typ    enum.AvatarType
		avatar *dto.ImageUpload
		valid  bool
	}{
		{"above legacy limit", enum.AvatarTypeCustom, &dto.ImageUpload{Upload: &dto.ImageUploadData{Content: noisyData.Bytes()}}, true},
		{"missing", enum.AvatarTypeCustom, nil, false},
		{"empty", enum.AvatarTypeCustom, &dto.ImageUpload{Upload: &dto.ImageUploadData{}}, false},
		{"foreign key", enum.AvatarTypeCustom, &dto.ImageUpload{BlobKey: "avatars/foreign"}, false},
		{"text", enum.AvatarTypeCustom, &dto.ImageUpload{Upload: &dto.ImageUploadData{Content: []byte("not an image")}}, false},
		{"truncated", enum.AvatarTypeCustom, &dto.ImageUpload{Upload: &dto.ImageUploadData{Content: good[:40]}}, false},
		{"oversized", enum.AvatarTypeCustom, &dto.ImageUpload{Upload: &dto.ImageUploadData{Content: make([]byte, 512*1024+1)}}, false},
		{"small", enum.AvatarTypeCustom, &dto.ImageUpload{Upload: &dto.ImageUploadData{Content: profileTestPNG(t, 49, 49)}}, false},
		{"rectangle", enum.AvatarTypeCustom, &dto.ImageUpload{Upload: &dto.ImageUploadData{Content: profileTestPNG(t, 80, 50)}}, false},
		{"remove custom", enum.AvatarTypeCustom, &dto.ImageUpload{Remove: true}, false},
		{"remove", enum.AvatarTypeLetter, &dto.ImageUpload{Remove: true, BlobKey: "avatars/foreign"}, true},
		{"upload", enum.AvatarTypeCustom, &dto.ImageUpload{Upload: &dto.ImageUploadData{Content: good, ContentType: "text/html"}}, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			a := &actions.UpdateUserAvatar{AvatarType: tc.typ, Avatar: tc.avatar}
			if a.Validate(context.Background(), user).Ok != tc.valid {
				t.Fatal("unexpected validation result")
			}
			if a.Avatar != nil && a.Avatar.BlobKey != "" {
				t.Fatal("untrusted blob key retained")
			}
			if tc.name == "upload" && a.Avatar.Upload.ContentType != "image/png" {
				t.Fatal("MIME type was not derived from decoded image")
			}
		})
	}
}
