package webhook

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/actions"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/pkg/webhook"
	"github.com/getfider/fider/app/services/httpclient"
)

// Legacy templates must render valid JSON after the public voting fields retire.
func TestLegacyVoteTemplate(t *testing.T) {
	ctx := context.WithValue(context.Background(), app.UserCtxKey, mock.JonSnow)
	ctx = context.WithValue(ctx, app.TenantCtxKey, mock.DemoTenant)
	oldPrivateTargets := env.Config.AllowPrivateNetworkTargets
	env.Config.AllowPrivateNetworkTargets = true
	t.Cleanup(func() { env.Config.AllowPrivateNetworkTargets = oldPrivateTargets })
	bus.Reset()
	t.Cleanup(bus.Reset)
	Service{}.Init()
	httpclient.Service{}.Init()
	const template = `{"votes":{{ .post_votes }},"comments":{{ .post_comments }}}`
	received := make(chan string, 8)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Error(err)
		}
		received <- string(body)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer server.Close()

	for _, event := range []enum.WebhookType{enum.WebhookNewComment, enum.WebhookChangeStatus, enum.WebhookDeletePost} {
		t.Run(event.Name(), func(t *testing.T) {
			preview := &cmd.PreviewWebhook{Type: event, Url: server.URL, Content: template}
			if err := previewWebhook(ctx, preview); err != nil || preview.Result.Content.Error != "" {
				t.Fatalf("preview failed: %v, %+v", err, preview.Result)
			}
			assertRetiredVotes(t, preview.Result.Content.Value)
			action := &actions.CreateEditWebhook{Name: "Legacy template", Type: event, Status: enum.WebhookEnabled, Url: server.URL, Content: template, HttpMethod: "POST"}
			if result := action.Validate(ctx, mock.JonSnow); !result.Ok {
				t.Fatalf("legacy template validation failed: %+v", result)
			}
			config := &entity.Webhook{ID: 1, Name: action.Name, Type: event, Url: server.URL, Content: template, HttpMethod: "POST"}
			bus.AddHandler(func(_ context.Context, q *query.GetWebhook) error { q.Result = config; return nil })
			test := &cmd.TestWebhook{ID: 1}
			if err := testWebhook(ctx, test); err != nil || !test.Result.Success {
				t.Fatalf("test send failed: %v, %+v", err, test.Result)
			}
			assertReceivedVotes(t, received)

			props := webhook.Props{}.SetPost(&entity.Post{CommentsCount: 3}, "post", server.URL, true, false)
			bus.AddHandler(func(_ context.Context, q *query.ListActiveWebhooksByType) error {
				q.Result = []*entity.Webhook{config}
				return nil
			})
			if err := triggerWebhooks(ctx, &cmd.TriggerWebhooks{Type: event, Props: props}); err != nil {
				t.Fatal(err)
			}
			assertReceivedVotes(t, received)
			help := &cmd.GetWebhookProps{Type: event}
			if err := getWebhookProps(ctx, help); err != nil {
				t.Fatal(err)
			}
			if _, exists := help.Result["post_votes"]; exists {
				t.Fatal("retired voting variable must not be advertised")
			}
		})
	}
	if _, exists := dummyTriggerProps(ctx, enum.WebhookNewPost)["post_votes"]; exists {
		t.Fatal("new-post event must not gain a legacy voting field")
	}
}

func assertRetiredVotes(t *testing.T, content string) {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal([]byte(content), &body); err != nil {
		t.Fatalf("invalid rendered JSON %q: %v", content, err)
	}
	if body["votes"] != float64(0) || body["comments"] != float64(3) {
		t.Fatalf("expected compatibility zero and preserved comments: %s", content)
	}
}

func assertReceivedVotes(t *testing.T, received <-chan string) {
	t.Helper()
	select {
	case content := <-received:
		assertRetiredVotes(t, content)
	case <-time.After(2 * time.Second):
		t.Fatal("local webhook receiver did not receive a request")
	}
}
