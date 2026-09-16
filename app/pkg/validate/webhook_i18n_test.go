package validate_test

import (
	"context"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/validate"
)

func TestWebhookURLLocalizedPreservesValidation(t *testing.T) {
	ctx := context.WithValue(context.Background(), app.LocaleCtxKey, "zh-CN")
	original := env.Config.AllowPrivateNetworkTargets
	t.Cleanup(func() { env.Config.AllowPrivateNetworkTargets = original })
	for _, allowPrivate := range []bool{false, true} {
		env.Config.AllowPrivateNetworkTargets = allowPrivate
		for _, test := range []struct{ url, message string }{
			{"not a url", "地址格式无效。"},
			{"ftp://example.com/hook", "地址仅支持 http 和 https 协议。"},
			{"http://127.0.0.1/hook", "该地址指向私有或内部网络，不允许使用。"},
			{"http://[::1]/hook", "该地址指向私有或内部网络，不允许使用。"},
			{"https://203.0.113.1/hook", ""},
		} {
			raw := validate.WebhookURL(test.url)
			localized := validate.WebhookURLLocalized(ctx, test.url)
			if len(raw) != len(localized) {
				t.Fatalf("validation changed for %q: raw=%v localized=%v", test.url, raw, localized)
			}
			if len(localized) > 0 && localized[0] != test.message {
				t.Fatalf("unexpected Chinese error for %q: %v", test.url, localized)
			}
		}
	}
}
