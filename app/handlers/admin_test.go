package handlers_test

import (
	"context"
	"encoding/base64"
	"net/http"
	"os"
	"testing"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"

	"github.com/getfider/fider/app/models/query"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/services/blob/fs"

	"github.com/getfider/fider/app/handlers"
)

func TestUpdateSettingsHandler(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, c *cmd.UpdateTenantSettings) error {
		Expect(c.Title).Equals("GoT")
		Expect(c.Invitation).Equals("Join us!")
		Expect(c.WelcomeMessage).Equals("Welcome to GoT Feedback Forum")
		Expect(c.Locale).Equals("pt-BR")
		Expect(c.Logo.BlobKey).Equals("logos/hello-world.png")
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImage) error {
		return nil
	})

	server := mock.NewServer()
	mock.DemoTenant.LogoBlobKey = "logos/hello-world.png"

	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		ExecutePost(
			handlers.UpdateSettings(),
			`{ "title": "GoT", "invitation": "Join us!", "welcomeMessage": "Welcome to GoT Feedback Forum", "locale": "pt-BR" }`,
		)

	Expect(code).Equals(http.StatusOK)
	ExpectHandler(&cmd.UpdateTenantSettings{}).CalledOnce()
	ExpectHandler(&cmd.UploadImage{}).CalledOnce()
}

func TestUpdateSettingsHandler_NewLogo(t *testing.T) {
	RegisterT(t)
	bus.Init(fs.Service{})

	bus.AddHandler(func(ctx context.Context, c *cmd.UpdateTenantSettings) error {
		Expect(c.Title).Equals("GoT")
		Expect(c.Invitation).Equals("Join us!")
		Expect(c.WelcomeMessage).Equals("Welcome to GoT Feedback Forum")
		Expect(c.Locale).Equals("pt-BR")
		Expect(c.Logo.BlobKey).Equals("logos/picture.png")
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImage) error {
		c.Image.BlobKey = c.Folder + "/" + c.Image.Upload.FileName
		return nil
	})

	logoBytes, _ := os.ReadFile(env.Etc("logo.png"))
	logoB64 := base64.StdEncoding.EncodeToString(logoBytes)

	server := mock.NewServer()
	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		ExecutePost(
			handlers.UpdateSettings(), `{
				"title": "GoT",
				"invitation": "Join us!",
				"welcomeMessage": "Welcome to GoT Feedback Forum",
				"locale": "pt-BR",
				"logo": {
					"upload": {
						"fileName": "picture.png",
						"contentType": "image/png",
						"content": "`+logoB64+`"
					}
				}
			}`)

	Expect(code).Equals(http.StatusOK)
	ExpectHandler(&cmd.UpdateTenantSettings{}).CalledOnce()
	ExpectHandler(&cmd.UploadImage{}).CalledOnce()
}

func TestUpdateSettingsHandler_RemoveLogo(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, c *cmd.UpdateTenantSettings) error {
		Expect(c.Title).Equals("GoT")
		Expect(c.Invitation).Equals("Join us!")
		Expect(c.WelcomeMessage).Equals("Welcome to GoT Feedback Forum")
		Expect(c.Logo.Remove).IsTrue()
		Expect(c.Locale).Equals("en")
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImage) error {
		return nil
	})

	server := mock.NewServer()
	mock.DemoTenant.LogoBlobKey = "logos/hello-world.png"

	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		ExecutePost(
			handlers.UpdateSettings(), `{
				"title": "GoT",
				"invitation": "Join us!",
				"locale": "en",
				"welcomeMessage": "Welcome to GoT Feedback Forum",
				"logo": {
					"remove": true
				}
			}`)

	Expect(code).Equals(http.StatusOK)
	ExpectHandler(&cmd.UpdateTenantSettings{}).CalledOnce()
	ExpectHandler(&cmd.UploadImage{}).CalledOnce()
}

func TestUpdatePrivacySettingsHandler(t *testing.T) {
	for _, test := range []struct {
		body   string
		status int
		write  bool
	}{
		{`{"isPrivate":true,"isFeedEnabled":false}`, http.StatusOK, true},
		{`{"isPrivate":false,"isFeedEnabled":false}`, http.StatusBadRequest, false},
		{`{"isPrivate":false,"isFeedEnabled":true}`, http.StatusBadRequest, false},
		{`{"isPrivate":true,"isFeedEnabled":true}`, http.StatusBadRequest, false},
	} {
		t.Run(test.body, func(t *testing.T) {
			server := mock.NewServer()
			called := false
			bus.AddHandler(func(ctx context.Context, c *cmd.UpdateTenantPrivacySettings) error {
				called = true
				if !c.IsPrivate {
					t.Fatal("public access persisted")
				}
				return nil
			})
			code, _ := server.OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).ExecutePost(handlers.UpdatePrivacySettings(), test.body)
			if code != test.status || called != test.write {
				t.Fatalf("got status=%d write=%v", code, called)
			}
		})
	}
}

func TestManageMembersHandler(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.SearchUsers) error {
		q.Result = []*entity.User{}
		q.TotalCount = 0
		return nil
	})

	server := mock.NewServer()
	code, _ := server.
		OnTenant(mock.DemoTenant).
		Execute(
			handlers.ManageMembers(),
		)

	Expect(code).Equals(http.StatusOK)
}
