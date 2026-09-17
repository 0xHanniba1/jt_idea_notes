package webhook

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/pkg/tpl"
)

func mailRetirementContext(t *testing.T) context.Context {
	t.Helper()
	bus.Reset()
	t.Cleanup(bus.Reset)
	privateTargets, disableOnFailure := env.Config.AllowPrivateNetworkTargets, env.Config.Webhook.DisableOnFailure
	env.Config.AllowPrivateNetworkTargets = true
	env.Config.Webhook.DisableOnFailure = false
	t.Cleanup(func() {
		env.Config.AllowPrivateNetworkTargets = privateTargets
		env.Config.Webhook.DisableOnFailure = disableOnFailure
	})
	user := *mock.JonSnow
	user.Email = "retired-contact@local.test"
	ctx := context.WithValue(context.Background(), app.UserCtxKey, &user)
	return context.WithValue(ctx, app.TenantCtxKey, mock.DemoTenant)
}

func TestWebhookPropertiesExcludeRetiredEmailData(t *testing.T) {
	ctx := mailRetirementContext(t)
	for _, event := range []enum.WebhookType{enum.WebhookNewPost, enum.WebhookNewComment, enum.WebhookChangeStatus, enum.WebhookDeletePost} {
		props := &cmd.GetWebhookProps{Type: event}
		if err := getWebhookProps(ctx, props); err != nil {
			t.Fatal(err)
		}
		for key := range props.Result {
			if strings.HasSuffix(key, "_email") {
				t.Fatalf("event %s exposed retired property %s", event.Name(), key)
			}
		}
		encoded, err := json.Marshal(props.Result)
		if err != nil {
			t.Fatal(err)
		}
		for _, address := range []string{"retired-contact@local.test", "contact@fider.io"} {
			if strings.Contains(string(encoded), address) {
				t.Fatalf("event %s exposed an email address", event.Name())
			}
		}
	}
}

func TestWebhookMissingVariablesFailBeforeHTTPDelivery(t *testing.T) {
	ctx := mailRetirementContext(t)
	requests := 0
	bus.AddHandler(func(_ context.Context, request *cmd.HTTPRequest) error {
		requests++
		return nil
	})
	for _, variable := range []string{"author_email", "post_author_email", "post_response_author_email", "unknown_variable"} {
		for _, field := range []string{"url", "content"} {
			t.Run(variable+"/"+field, func(t *testing.T) {
				url, content := "http://127.0.0.1/webhook", `{"author":"{{ .author_name }}"}`
				if field == "url" {
					url += "/{{ ." + variable + " }}"
				} else {
					content = `{"retired":"{{ .` + variable + ` }}"}`
				}
				preview := &cmd.PreviewWebhook{Type: enum.WebhookNewComment, Url: url, Content: content}
				if err := previewWebhook(ctx, preview); err != nil {
					t.Fatal(err)
				}
				previewed := preview.Result.Content
				if field == "url" {
					previewed = preview.Result.Url
				}
				if previewed.Value != "" || previewed.Message == "" || !strings.Contains(previewed.Error, variable) {
					t.Fatalf("missing variable did not produce an identifiable preview error: %+v", previewed)
				}
				config := &entity.Webhook{ID: 1, Name: "Retired property", Type: enum.WebhookNewComment, Url: url, Content: content, HttpMethod: "POST"}
				result, err := triggerWebhook(ctx, config, dummyTriggerProps(ctx, config.Type))
				if err != nil {
					t.Fatal(err)
				}
				if result.Success || result.Message == "" || !strings.Contains(result.Error, variable) {
					t.Fatalf("missing variable did not fail before delivery: %+v", result)
				}
				if requests != 0 || strings.Contains(result.Url+result.Content, "<no value>") {
					t.Fatal("invalid webhook content was sent or silently rendered")
				}
			})
		}
	}
}

func TestWebhookValidVariablesAndLegacyVotesStillDeliver(t *testing.T) {
	ctx := mailRetirementContext(t)
	const bodyTemplate = `{"author":"{{ .author_name }}","id":{{ .author_id }},"votes":{{ .post_votes }},"comments":{{ .post_comments }}}`
	config := &entity.Webhook{ID: 1, Name: "Valid properties", Type: enum.WebhookNewComment, Url: "http://127.0.0.1/webhook/{{ .post_number }}", Content: bodyTemplate, HttpMethod: "POST"}
	requests := 0
	bus.AddHandler(func(_ context.Context, request *cmd.HTTPRequest) error {
		requests++
		body, err := io.ReadAll(request.Body)
		if err != nil {
			return err
		}
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			t.Fatal(err)
		}
		if request.URL != "http://127.0.0.1/webhook/36" || request.Method != "POST" || payload["author"] != mock.JonSnow.Name || payload["id"] != float64(mock.JonSnow.ID) || payload["votes"] != float64(0) || payload["comments"] != float64(3) {
			t.Fatalf("valid webhook changed: %s %s %s", request.Method, request.URL, body)
		}
		if strings.Contains(string(body), "@") || strings.Contains(string(body), "<no value>") {
			t.Fatal("valid webhook exposed retired data or an unresolved value")
		}
		request.ResponseStatusCode = http.StatusNoContent
		return nil
	})
	preview := &cmd.PreviewWebhook{Type: config.Type, Url: config.Url, Content: config.Content}
	if err := previewWebhook(ctx, preview); err != nil || preview.Result.Url.Error != "" || preview.Result.Content.Error != "" {
		t.Fatalf("valid preview failed: %v, %+v", err, preview.Result)
	}
	result, err := triggerWebhook(ctx, config, dummyTriggerProps(ctx, config.Type))
	if err != nil || !result.Success || requests != 1 || result.Content != preview.Result.Content.Value {
		t.Fatalf("valid delivery failed: %v, %+v, requests=%d", err, result, requests)
	}

	// Webhook strictness must not alter the shared template helper's behavior.
	shared, err := tpl.GetTextTemplate("shared-missing-variable", "{{ .missing }}")
	if err != nil {
		t.Fatal(err)
	}
	if rendered, err := tpl.Execute(shared, map[string]any{}); err != nil || rendered != "<no value>" {
		t.Fatalf("shared template behavior changed: %q, %v", rendered, err)
	}
}
