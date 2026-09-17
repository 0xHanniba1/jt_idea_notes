package tasks_test

import (
	"context"
	"testing"

	"github.com/getfider/fider/app/pkg/webhook"

	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"

	"github.com/getfider/fider/app/models/cmd"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/tasks"
)

func TestNotifyAboutNewPostTask(t *testing.T) {
	RegisterT(t)
	bus.Reset()

	var addNewNotification *cmd.AddNewNotification
	bus.AddHandler(func(ctx context.Context, c *cmd.AddNewNotification) error {
		addNewNotification = c
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetActiveSubscribers) error {
		Expect(q.Channel).Equals(enum.NotificationChannelWeb)
		q.Result = []*entity.User{
			mock.AryaStark,
		}
		return nil
	})

	var triggerWebhooks *cmd.TriggerWebhooks
	bus.AddHandler(func(ctx context.Context, c *cmd.TriggerWebhooks) error {
		triggerWebhooks = c
		return nil
	})

	worker := mock.NewWorker()
	post := &entity.Post{
		ID:          1,
		Number:      1,
		Title:       "Add support for TypeScript",
		Slug:        "add-support-for-typescript",
		Description: "TypeScript is great, please add support for it",
	}
	task := tasks.NotifyAboutNewPost(post)

	err := worker.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		WithBaseURL("http://domain.com").
		Execute(task)

	Expect(err).IsNil()

	Expect(addNewNotification).IsNotNil()
	Expect(addNewNotification.PostID).Equals(post.ID)
	Expect(addNewNotification.Link).Equals("/posts/1/add-support-for-typescript")
	Expect(addNewNotification.Title).Equals("New post: **Add support for TypeScript**")
	Expect(addNewNotification.User).Equals(mock.AryaStark)

	Expect(triggerWebhooks).IsNotNil()
	Expect(triggerWebhooks.Type).Equals(enum.WebhookNewPost)
	Expect(triggerWebhooks.Props).ContainsProps(webhook.Props{
		"post_id":          post.ID,
		"post_number":      post.Number,
		"post_title":       post.Title,
		"post_slug":        post.Slug,
		"post_description": post.Description,
		"post_url":         "http://domain.com/posts/1/add-support-for-typescript",
		"author_id":        mock.JonSnow.ID,
		"author_name":      mock.JonSnow.Name,
		"author_role":      mock.JonSnow.Role.String(),
		"tenant_id":        mock.DemoTenant.ID,
		"tenant_name":      mock.DemoTenant.Name,
		"tenant_subdomain": mock.DemoTenant.Subdomain,
		"tenant_status":    mock.DemoTenant.Status.String(),
		"tenant_url":       "http://domain.com",
	})
}

func TestNotifyAboutNewPostTask_WithMention(t *testing.T) {
	RegisterT(t)
	bus.Reset()

	var addNewNotification *cmd.AddNewNotification
	bus.AddHandler(func(ctx context.Context, c *cmd.AddNewNotification) error {
		addNewNotification = c
		return nil
	})

	addNotificationLogs := make([]*cmd.AddMentionNotification, 0)
	bus.AddHandler(func(ctx context.Context, c *cmd.AddMentionNotification) error {
		addNotificationLogs = append(addNotificationLogs, c)
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetActiveSubscribers) error {
		Expect(q.Channel).Equals(enum.NotificationChannelWeb)
		if q.Event.UserSettingsKeyName == "event_notification_mention" {
			q.Result = []*entity.User{
				mock.JonSnow,
			}
		} else {
			q.Result = []*entity.User{}
		}
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetMentionNotifications) error {
		q.Result = []*entity.MentionNotification{}
		return nil
	})

	var triggerWebhooks *cmd.TriggerWebhooks
	bus.AddHandler(func(ctx context.Context, c *cmd.TriggerWebhooks) error {
		triggerWebhooks = c
		return nil
	})

	worker := mock.NewWorker()
	post := &entity.Post{
		ID:          1,
		Number:      1,
		Title:       "Add support for TypeScript",
		Slug:        "add-support-for-typescript",
		Description: "TypeScript is great, please add support for it @[Jon Snow]",
	}
	task := tasks.NotifyAboutNewPost(post)

	err := worker.
		OnTenant(mock.DemoTenant).
		AsUser(mock.AryaStark).
		WithBaseURL("http://domain.com").
		Execute(task)

	Expect(err).IsNil()

	Expect(addNewNotification).IsNotNil()
	Expect(addNewNotification.PostID).Equals(post.ID)
	Expect(addNewNotification.Title).Equals("**Arya Stark** mentioned you in **Add support for TypeScript**")
	Expect(addNewNotification.User).Equals(mock.JonSnow)

	Expect(addNotificationLogs).HasLen(1)
	Expect(addNotificationLogs[0].UserID).Equals(mock.JonSnow.ID)
	Expect(addNotificationLogs[0].PostID).Equals(post.ID)

	Expect(triggerWebhooks).IsNotNil()
	Expect(triggerWebhooks.Type).Equals(enum.WebhookNewPost)
}
