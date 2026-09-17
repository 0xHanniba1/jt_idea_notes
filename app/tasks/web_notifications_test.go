package tasks_test

import (
	"context"
	"testing"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/pkg/worker"
	"github.com/getfider/fider/app/tasks"
)

func TestEventNotificationsKeepWebRecipients(t *testing.T) {
	post := &entity.Post{
		ID: 1, Number: 1, Title: "Local account post", Slug: "local-account-post",
		User: mock.JonSnow, Status: enum.PostPlanned,
		Response: &entity.PostResponse{Text: "Planned", User: mock.JonSnow},
	}
	cases := []struct {
		name    string
		task    worker.Task
		event   enum.NotificationEvent
		webhook enum.WebhookType
	}{
		{"new post", tasks.NotifyAboutNewPost(post), enum.NotificationEventNewPost, enum.WebhookNewPost},
		{"new comment", tasks.NotifyAboutNewComment(&entity.Comment{ID: 1, Content: "Please check"}, post), enum.NotificationEventNewComment, enum.WebhookNewComment},
		{"status change", tasks.NotifyAboutStatusChange(post, enum.PostOpen), enum.NotificationEventChangeStatus, enum.WebhookChangeStatus},
		{"deleted post", tasks.NotifyAboutDeletedPost(post, true), enum.NotificationEventChangeStatus, enum.WebhookDeletePost},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			bus.Reset()
			t.Cleanup(bus.Reset)
			// Locally managed accounts only need an ID and a display name.
			member := &entity.User{ID: mock.AryaStark.ID, Name: mock.AryaStark.Name}
			var subscriptions int
			var notifications []*cmd.AddNewNotification
			var webhooks []*cmd.TriggerWebhooks
			bus.AddHandler(func(_ context.Context, q *query.GetActiveSubscribers) error {
				if q.Channel != enum.NotificationChannelWeb || q.Number != post.Number {
					t.Fatalf("unexpected subscriber query: %+v", q)
				}
				if q.Event.UserSettingsKeyName == enum.NotificationEventMention.UserSettingsKeyName {
					q.Result = []*entity.User{}
					return nil
				}
				if q.Event.UserSettingsKeyName != tc.event.UserSettingsKeyName {
					t.Fatalf("unexpected notification event: %+v", q.Event)
				}
				subscriptions++
				q.Result = []*entity.User{member, mock.JonSnow}
				return nil
			})
			bus.AddHandler(func(_ context.Context, q *query.GetMentionNotifications) error { return nil })
			bus.AddHandler(func(_ context.Context, c *cmd.AddNewNotification) error {
				notifications = append(notifications, c)
				return nil
			})
			bus.AddHandler(func(_ context.Context, c *cmd.TriggerWebhooks) error { webhooks = append(webhooks, c); return nil })
			if err := mock.NewWorker().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).WithBaseURL("http://local.test").Execute(tc.task); err != nil {
				t.Fatal(err)
			}
			if subscriptions != 1 || len(notifications) != 1 || notifications[0].User.ID != member.ID || notifications[0].PostID != post.ID {
				t.Fatalf("expected one notification for the subscriber, excluding the author: queries=%d notifications=%+v", subscriptions, notifications)
			}
			if len(webhooks) != 1 || webhooks[0].Type != tc.webhook {
				t.Fatalf("expected the original webhook: %+v", webhooks)
			}
		})
	}
}

func TestUpdatedPostMentionKeepsWebNotificationAndDeduplication(t *testing.T) {
	for _, alreadyMentioned := range []bool{false, true} {
		name := "new mention"
		if alreadyMentioned {
			name = "already notified"
		}
		t.Run(name, func(t *testing.T) {
			bus.Reset()
			t.Cleanup(bus.Reset)
			member := &entity.User{ID: mock.AryaStark.ID, Name: mock.AryaStark.Name}
			post := &entity.Post{ID: 1, Number: 1, Title: "Mention", Slug: "mention", Description: "Please check @[Arya Stark]", User: mock.JonSnow}
			var notifications []*cmd.AddNewNotification
			var logs []*cmd.AddMentionNotification
			bus.AddHandler(func(_ context.Context, q *query.GetActiveSubscribers) error {
				if q.Channel != enum.NotificationChannelWeb || q.Event.UserSettingsKeyName != enum.NotificationEventMention.UserSettingsKeyName {
					t.Fatalf("unexpected mention subscription query: %+v", q)
				}
				q.Result = []*entity.User{member}
				return nil
			})
			bus.AddHandler(func(_ context.Context, q *query.GetMentionNotifications) error {
				if q.PostID != post.ID {
					t.Fatalf("wrong mention scope: %+v", q)
				}
				if alreadyMentioned {
					q.Result = []*entity.MentionNotification{{UserID: member.ID, PostID: post.ID}}
				}
				return nil
			})
			bus.AddHandler(func(_ context.Context, c *cmd.AddNewNotification) error {
				notifications = append(notifications, c)
				return nil
			})
			bus.AddHandler(func(_ context.Context, c *cmd.AddMentionNotification) error { logs = append(logs, c); return nil })
			if err := mock.NewWorker().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).WithBaseURL("http://local.test").Execute(tasks.NotifyAboutUpdatedPost(post)); err != nil {
				t.Fatal(err)
			}
			expected := 1
			if alreadyMentioned {
				expected = 0
			}
			if len(notifications) != expected || len(logs) != expected {
				t.Fatalf("expected %d mention notification and log, got %d and %d", expected, len(notifications), len(logs))
			}
			if expected == 1 && (notifications[0].User.ID != member.ID || notifications[0].Link != "/posts/1/mention" || logs[0].UserID != member.ID || logs[0].PostID != post.ID) {
				t.Fatal("mention recipient or scope changed")
			}
		})
	}
}
