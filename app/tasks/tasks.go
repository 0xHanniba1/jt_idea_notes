package tasks

import (
	"context"
	"fmt"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/services/email"
	"strings"

	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/worker"
)

func describe(name string, job worker.Job) worker.Task {
	return worker.Task{Name: name, Job: job}
}

func link(baseURL, path string, args ...any) string {
	return fmt.Sprintf("<a href='%[1]s%[2]s'>%[1]s%[2]s</a>", baseURL, fmt.Sprintf(path, args...))
}

func linkWithText(text, baseURL, path string, args ...any) string {
	return fmt.Sprintf("<a href='%s%s'>%s</a>", baseURL, fmt.Sprintf(path, args...), text)
}

func getActiveSubscribers(ctx context.Context, post *entity.Post, channel enum.NotificationChannel, event enum.NotificationEvent) ([]*entity.User, error) {
	q := &query.GetActiveSubscribers{
		Number:  post.Number,
		Channel: channel,
		Event:   event,
	}
	err := bus.Dispatch(ctx, q)
	if err != nil || channel != enum.NotificationChannelEmail {
		return q.Result, err
	}
	users := make([]*entity.User, 0, len(q.Result))
	for _, user := range q.Result {
		if user != nil && strings.TrimSpace(user.Email) != "" {
			users = append(users, user)
		}
	}
	return users, nil
}

// publishMail is the task delivery boundary, including direct mention and
// account notifications which do not necessarily use a subscriber query.
func publishMail(ctx context.Context, message *cmd.SendMail) {
	message.To = email.NonEmptyRecipients(message.To)
	if len(message.To) == 0 {
		return
	}
	bus.Publish(ctx, message)
}
