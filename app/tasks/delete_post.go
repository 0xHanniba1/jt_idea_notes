package tasks

import (
	"fmt"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/web"
	"github.com/getfider/fider/app/pkg/webhook"
	"github.com/getfider/fider/app/pkg/worker"
)

// NotifyAboutDeletedPost sends an in-app notification to subscribers of the post that has been deleted
func NotifyAboutDeletedPost(post *entity.Post, deleteCommentAdded bool) worker.Task {
	return describe("Notify about deleted post", func(c *worker.Context) error {

		tenant := c.Tenant()
		baseURL, logoURL := web.BaseURL(c), web.LogoURL(c)
		author := c.User()
		title := fmt.Sprintf("**%s** deleted **%s**", author.Name, post.Title)

		// Webhook
		webhookProps := webhook.Props{}
		webhookProps.SetPost(post, "post", baseURL, true, true)
		webhookProps.SetUser(author, "author")
		webhookProps.SetTenant(tenant, "tenant", baseURL, logoURL)

		err := bus.Dispatch(c, &cmd.TriggerWebhooks{
			Type:  enum.WebhookDeletePost,
			Props: webhookProps,
		})
		if err != nil {
			return c.Failure(err)
		}

		// If no comment was added, we can stop here
		// (I'm not sure about the rational of this business rule, but this is how it currently works)
		if !deleteCommentAdded {
			return nil
		}

		// Web notification
		users, err := getActiveSubscribers(c, post, enum.NotificationEventChangeStatus)
		if err != nil {
			return c.Failure(err)
		}

		for _, user := range users {
			if user.ID != author.ID {
				err = bus.Dispatch(c, &cmd.AddNewNotification{
					User:   user,
					Title:  title,
					PostID: post.ID,
				})
				if err != nil {
					return c.Failure(err)
				}
			}
		}

		return nil
	})
}
