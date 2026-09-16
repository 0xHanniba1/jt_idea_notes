package actions_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/actions"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/validate"
)

func assertTenantValidationMessage(t *testing.T, result *validate.Result, field, expected string) {
	t.Helper()
	if result.Ok || result.Err != nil || len(result.Errors) != 1 {
		t.Fatalf("expected one validation failure, got %+v", result)
	}
	if result.Errors[0].Field != field || result.Errors[0].Message != expected {
		t.Fatalf("expected %s: %q, got %+v", field, expected, result.Errors[0])
	}
}

func TestAdminTenantSettingsLocalizedValidation(t *testing.T) {
	tests := []struct {
		name   string
		field  string
		change func(*actions.UpdateTenantSettings)
		en     string
		zh     string
	}{
		{"required title", "title", func(a *actions.UpdateTenantSettings) { a.Title = "" }, "Title is required.", "请填写站点名称。"},
		{"title byte limit", "title", func(a *actions.UpdateTenantSettings) { a.Title = strings.Repeat("中", 21) }, "Title must have less than 60 characters.", "站点名称最多 60 字节。"},
		{"invitation byte limit", "invitation", func(a *actions.UpdateTenantSettings) { a.Invitation = strings.Repeat("中", 21) }, "Invitation must have less than 60 characters.", "输入提示文字最多 60 字节。"},
		{"header byte limit", "welcomeHeader", func(a *actions.UpdateTenantSettings) { a.WelcomeHeader = strings.Repeat("中", 34) }, "Welcome Header must have less than 100 characters.", "首页欢迎标题最多 100 字节。"},
		{"template byte limit", "descriptionTemplate", func(a *actions.UpdateTenantSettings) { a.DescriptionTemplate = strings.Repeat("中", 667) }, "Idea Template must have less than 2000 characters.", "新记录正文模板最多 2000 字节。"},
		{"invalid language", "locale", func(a *actions.UpdateTenantSettings) { a.Locale = "invalid" }, "Locale is invalid.", "所选语言无效。"},
	}
	for _, locale := range []string{"en", "zh-CN"} {
		for _, tt := range tests {
			t.Run(locale+"/"+tt.name, func(t *testing.T) {
				action := actions.NewUpdateTenantSettings()
				action.Title, action.Locale = "Valid", "zh-CN"
				tt.change(action)
				expected := tt.en
				if locale == "zh-CN" {
					expected = tt.zh
				}
				ctx := context.WithValue(context.Background(), app.LocaleCtxKey, locale)
				assertTenantValidationMessage(t, action.Validate(ctx, nil), tt.field, expected)
			})
		}
	}
}

func TestAdminTenantSettingsExactByteLimitsRemainValid(t *testing.T) {
	action := actions.NewUpdateTenantSettings()
	action.Title = strings.Repeat("中", 20)
	action.Invitation = strings.Repeat("中", 20)
	action.WelcomeHeader = strings.Repeat("中", 33) + "a"
	action.DescriptionTemplate = strings.Repeat("中", 666) + "ab"
	action.Locale = "zh-CN"
	ctx := context.WithValue(context.Background(), app.LocaleCtxKey, "zh-CN")
	if result := action.Validate(ctx, nil); !result.Ok || result.Err != nil {
		t.Fatalf("exact byte limits must remain valid: %+v", result)
	}
}

func TestAdminTenantPrivacyLocalizedValidation(t *testing.T) {
	for _, test := range []struct{ locale, message string }{
		{"en", "Feed can not be enabled when set to private."},
		{"zh-CN", "私有站点不能启用订阅源。"},
	} {
		t.Run(test.locale, func(t *testing.T) {
			ctx := context.WithValue(context.Background(), app.LocaleCtxKey, test.locale)
			action := actions.UpdateTenantPrivacySettings{IsPrivate: true, IsFeedEnabled: true}
			assertTenantValidationMessage(t, action.Validate(ctx, nil), "", test.message)
		})
	}
}

func TestAdminTenantEmailAuthLocalizedValidation(t *testing.T) {
	for _, test := range []struct {
		locale   string
		queryErr error
		field    string
		message  string
	}{
		{"en", nil, "isEmailAuthAllowed", "You cannot disable email authentication without any other provider enabled."},
		{"zh-CN", nil, "isEmailAuthAllowed", "请先启用其他登录方式，再关闭邮箱登录。"},
		{"en", errors.New("lookup failed"), "", "Cannot retrieve OAuth providers"},
		{"zh-CN", errors.New("lookup failed"), "", "无法获取 OAuth 登录服务。"},
	} {
		t.Run(test.locale+"/"+test.field, func(t *testing.T) {
			bus.AddHandler(func(_ context.Context, q *query.ListActiveOAuthProviders) error {
				q.Result = nil
				return test.queryErr
			})
			ctx := context.WithValue(context.Background(), app.LocaleCtxKey, test.locale)
			action := actions.UpdateTenantEmailAuthAllowed{IsEmailAuthAllowed: false}
			assertTenantValidationMessage(t, action.Validate(ctx, nil), test.field, test.message)
		})
	}
	bus.AddHandler(func(_ context.Context, q *query.ListActiveOAuthProviders) error {
		q.Result = nil
		return nil
	})
}
