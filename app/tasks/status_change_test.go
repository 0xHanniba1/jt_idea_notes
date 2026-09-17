package tasks_test

import (
	"context"
	"testing"
	"time"

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

func TestNotifyAboutStatusChangeTask(t *testing.T) {
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
		User:        mock.AryaStark,
		Status:      enum.PostPlanned,
		Response: &entity.PostResponse{
			RespondedAt: time.Now(),
			Text:        "Planned for next release.",
			User:        mock.JonSnow,
		},
	}

	task := tasks.NotifyAboutStatusChange(post, enum.PostOpen)

	err := worker.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		WithBaseURL("http://domain.com").
		Execute(task)

	Expect(err).IsNil()

	Expect(addNewNotification).IsNotNil()
	Expect(addNewNotification.PostID).Equals(post.ID)
	Expect(addNewNotification.Link).Equals("/posts/1/add-support-for-typescript")
	Expect(addNewNotification.Title).Equals("**Jon Snow** changed status of **Add support for TypeScript** to **planned**")
	Expect(addNewNotification.User).Equals(mock.AryaStark)

	Expect(triggerWebhooks).IsNotNil()
	Expect(triggerWebhooks.Type).Equals(enum.WebhookChangeStatus)
	Expect(triggerWebhooks.Props).ContainsProps(webhook.Props{
		"post_old_status":            enum.PostOpen.Name(),
		"post_id":                    post.ID,
		"post_number":                post.Number,
		"post_title":                 post.Title,
		"post_slug":                  post.Slug,
		"post_description":           post.Description,
		"post_status":                post.Status.Name(),
		"post_url":                   "http://domain.com/posts/1/add-support-for-typescript",
		"post_author_id":             mock.AryaStark.ID,
		"post_author_name":           mock.AryaStark.Name,
		"post_author_role":           mock.AryaStark.Role.String(),
		"post_response":              true,
		"post_response_text":         post.Response.Text,
		"post_response_responded_at": post.Response.RespondedAt,
		"post_response_author_id":    mock.JonSnow.ID,
		"post_response_author_name":  mock.JonSnow.Name,
		"post_response_author_role":  mock.JonSnow.Role.String(),
		"author_id":                  mock.JonSnow.ID,
		"author_name":                mock.JonSnow.Name,
		"author_role":                mock.JonSnow.Role.String(),
		"tenant_id":                  mock.DemoTenant.ID,
		"tenant_name":                mock.DemoTenant.Name,
		"tenant_subdomain":           mock.DemoTenant.Subdomain,
		"tenant_status":              mock.DemoTenant.Status.String(),
		"tenant_url":                 "http://domain.com",
	})
}

func TestNotifyAboutStatusChangeTask_Duplicate(t *testing.T) {
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
		ID:     2,
		Number: 2,
		Title:  "I need TypeScript",
		Slug:   "i-need-typescript",
		User:   mock.AryaStark,
		Status: enum.PostDuplicate,
		Response: &entity.PostResponse{
			RespondedAt: time.Now(),
			User:        mock.JonSnow,
			Original: &entity.OriginalPost{
				Number: 1,
				Title:  "Add support for TypeScript",
				Slug:   "add-support-for-typescript",
				Status: enum.PostOpen,
			},
		},
	}

	task := tasks.NotifyAboutStatusChange(post, enum.PostOpen)

	err := worker.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		WithBaseURL("http://domain.com").
		Execute(task)

	Expect(err).IsNil()

	Expect(addNewNotification).IsNotNil()
	Expect(addNewNotification.PostID).Equals(post.ID)
	Expect(addNewNotification.Link).Equals("/posts/2/i-need-typescript")
	Expect(addNewNotification.Title).Equals("**Jon Snow** changed status of **I need TypeScript** to **duplicate**")
	Expect(addNewNotification.User).Equals(mock.AryaStark)

	Expect(triggerWebhooks).IsNotNil()
	Expect(triggerWebhooks.Type).Equals(enum.WebhookChangeStatus)
	Expect(triggerWebhooks.Props).ContainsProps(webhook.Props{
		"post_old_status":               enum.PostOpen.Name(),
		"post_id":                       post.ID,
		"post_number":                   post.Number,
		"post_title":                    post.Title,
		"post_slug":                     post.Slug,
		"post_description":              post.Description,
		"post_status":                   post.Status.Name(),
		"post_url":                      "http://domain.com/posts/2/i-need-typescript",
		"post_author_id":                mock.AryaStark.ID,
		"post_author_name":              mock.AryaStark.Name,
		"post_author_role":              mock.AryaStark.Role.String(),
		"post_response":                 true,
		"post_response_text":            post.Response.Text,
		"post_response_responded_at":    post.Response.RespondedAt,
		"post_response_author_id":       mock.JonSnow.ID,
		"post_response_author_name":     mock.JonSnow.Name,
		"post_response_author_role":     mock.JonSnow.Role.String(),
		"post_response_original_number": post.Response.Original.Number,
		"post_response_original_title":  post.Response.Original.Title,
		"post_response_original_slug":   post.Response.Original.Slug,
		"post_response_original_status": post.Response.Original.Status.Name(),
		"post_response_original_url":    "http://domain.com/posts/1/add-support-for-typescript",
		"author_id":                     mock.JonSnow.ID,
		"author_name":                   mock.JonSnow.Name,
		"author_role":                   mock.JonSnow.Role.String(),
		"tenant_id":                     mock.DemoTenant.ID,
		"tenant_name":                   mock.DemoTenant.Name,
		"tenant_subdomain":              mock.DemoTenant.Subdomain,
		"tenant_status":                 mock.DemoTenant.Status.String(),
		"tenant_url":                    "http://domain.com",
	})
}
