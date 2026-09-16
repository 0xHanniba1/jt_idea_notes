package actions_test

import (
	"context"
	"strings"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/actions"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/validate"
)

func TestAdminTagChineseValidationPreservesByteLimit(t *testing.T) {
	ctx := context.WithValue(context.Background(), app.LocaleCtxKey, "zh-CN")
	bus.Reset()
	t.Cleanup(bus.Reset)
	bus.AddHandler(func(_ context.Context, q *query.GetTagBySlug) error { return app.ErrNotFound })

	valid := (&actions.CreateEditTag{Name: strings.Repeat("中", 10), Color: "ABCDEF"}).Validate(ctx, nil)
	if !valid.Ok {
		t.Fatalf("a 30-byte name should remain valid: %+v", valid)
	}
	tooLong := (&actions.CreateEditTag{Name: strings.Repeat("中", 11), Color: "ABCDEF"}).Validate(ctx, nil)
	assertAdminValidationMessage(t, tooLong, "name", "标签名称最多 30 字节。")
	missing := (&actions.CreateEditTag{}).Validate(ctx, nil)
	assertAdminValidationMessage(t, missing, "name", "请填写标签名称。")
	assertAdminValidationMessage(t, missing, "color", "请填写颜色值。")
}

func TestAdminWebhookChineseValidationPreservesByteLimits(t *testing.T) {
	ctx := context.WithValue(context.Background(), app.LocaleCtxKey, "zh-CN")
	newAction := func() *actions.CreateEditWebhook {
		return &actions.CreateEditWebhook{Name: "示例", Type: enum.WebhookNewPost, Status: enum.WebhookDisabled, Url: "https://example.com/hook", HttpMethod: "POST"}
	}
	tests := []struct {
		name    string
		edit    func(*actions.CreateEditWebhook)
		field   string
		message string
	}{
		{"name", func(a *actions.CreateEditWebhook) { a.Name = strings.Repeat("中", 21) }, "name", "Webhook 名称最多 60 字节。"},
		{"url", func(a *actions.CreateEditWebhook) { a.Url = strings.Repeat("中", 334) }, "url", "回调地址模板最多 1,000 字节。"},
		{"content", func(a *actions.CreateEditWebhook) { a.Content = strings.Repeat("中", 3334) }, "content", "请求体最多 10,000 字节。"},
		{"method", func(a *actions.CreateEditWebhook) { a.HttpMethod = strings.Repeat("中", 17) }, "http_method", "请求方法最多 50 字节。"},
		{"header", func(a *actions.CreateEditWebhook) {
			a.HttpHeaders = map[string]string{strings.Repeat("中", 67): "value"}
		}, "header-" + strings.Repeat("中", 67), "请求头名称最多 200 字节。"},
		{"header value", func(a *actions.CreateEditWebhook) {
			a.HttpHeaders = map[string]string{"X-Test": strings.Repeat("中", 334)}
		}, "value-X-Test", "请求头值最多 1,000 字节。"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			action := newAction()
			test.edit(action)
			assertAdminValidationMessage(t, action.Validate(ctx, nil), test.field, test.message)
		})
	}
	action := newAction()
	action.Name = strings.Repeat("中", 20)
	if result := action.Validate(ctx, nil); !result.Ok {
		t.Fatalf("a 60-byte name should remain valid: %+v", result)
	}
	missing := (&actions.CreateEditWebhook{}).Validate(ctx, nil)
	assertAdminValidationMessage(t, missing, "name", "请填写 Webhook 名称。")
	assertAdminValidationMessage(t, missing, "type", "请选择触发事件。")
	assertAdminValidationMessage(t, missing, "http_method", "请填写请求方法。")
	assertAdminValidationMessage(t, (&actions.PreviewWebhook{}).Validate(ctx, nil), "type", "请选择触发事件。")

	en := context.WithValue(context.Background(), app.LocaleCtxKey, "en")
	assertAdminValidationMessage(t, (&actions.CreateEditWebhook{}).Validate(en, nil), "name", "Name is required.")
}

func assertAdminValidationMessage(t *testing.T, result *validate.Result, field, expected string) {
	t.Helper()
	if result.Err != nil || result.Ok {
		t.Fatalf("expected validation error, got %+v", result)
	}
	for _, item := range result.Errors {
		if item.Field == field && item.Message == expected {
			return
		}
	}
	t.Fatalf("expected %s: %q; got %+v", field, expected, result.Errors)
}
