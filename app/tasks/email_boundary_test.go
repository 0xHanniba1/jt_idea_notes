package tasks_test

import (
	"context"
	"testing"
	"time"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
	"github.com/getfider/fider/app/services/email/emailmock"
	"github.com/getfider/fider/app/tasks"
)

func TestNoEmailMembersKeepWebNotificationsWithoutEmailDelivery(t *testing.T) {
	for _, withEmail := range []bool{false, true} {
		bus.Reset()
		bus.Init(emailmock.Service{})
		noEmail := *mock.AryaStark
		noEmail.Email = " \t "
		withContact := *mock.AryaStark
		withContact.ID = 99
		withContact.Email = "member@local.test"
		subscribers := []*entity.User{&noEmail}
		if withEmail {
			subscribers = append(subscribers, &withContact)
		}
		webUsers := map[int]bool{}
		bus.AddHandler(func(_ context.Context, q *query.GetActiveSubscribers) error { q.Result = subscribers; return nil })
		bus.AddHandler(func(_ context.Context, c *cmd.AddNewNotification) error { webUsers[c.User.ID] = true; return nil })
		bus.AddHandler(func(_ context.Context, _ *cmd.TriggerWebhooks) error { return nil })
		post := &entity.Post{ID: 1, Number: 1, Title: "Local account post", Slug: "local-account-post", User: mock.JonSnow}
		err := mock.NewWorker().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).WithBaseURL("http://local.test").Execute(tasks.NotifyAboutNewPost(post))
		if err != nil {
			t.Fatal(err)
		}
		if !webUsers[noEmail.ID] {
			t.Fatal("no-email member lost web notification")
		}
		if !withEmail && len(emailmock.MessageHistory) != 0 {
			t.Fatal("empty mail was published")
		}
		if withEmail && (len(emailmock.MessageHistory) != 1 || len(emailmock.MessageHistory[0].To) != 1 || emailmock.MessageHistory[0].To[0].Address != withContact.Email) {
			t.Fatal("valid recipient was lost or empty recipient was sent")
		}
	}
}

func TestDirectAccountMailSkipsNoEmailOwner(t *testing.T) {
	bus.Reset()
	bus.Init(emailmock.Service{})
	owner := *mock.JonSnow
	owner.Email = ""
	task := tasks.SendDeleteAccountScheduledEmail(&owner, "Local site", time.Now(), "http://local.test", "local-cancel-key")
	if err := mock.NewWorker().OnTenant(mock.DemoTenant).AsUser(&owner).WithBaseURL("http://local.test").Execute(task); err != nil {
		t.Fatal(err)
	}
	if len(emailmock.MessageHistory) != 0 {
		t.Fatal("direct owner notification published an empty email")
	}
}

func TestNoEmailMentionStillCreatesWebNotification(t *testing.T) {
	bus.Reset()
	bus.Init(emailmock.Service{})
	member := *mock.AryaStark
	member.Email = ""
	webNotifications := 0
	bus.AddHandler(func(_ context.Context, q *query.GetActiveSubscribers) error {
		q.Result = []*entity.User{&member}
		return nil
	})
	bus.AddHandler(func(_ context.Context, q *query.GetMentionNotifications) error {
		q.Result = []*entity.MentionNotification{}
		return nil
	})
	bus.AddHandler(func(_ context.Context, _ *cmd.AddMentionNotification) error { return nil })
	bus.AddHandler(func(_ context.Context, _ *cmd.AddNewNotification) error { webNotifications++; return nil })
	bus.AddHandler(func(_ context.Context, _ *cmd.TriggerWebhooks) error { return nil })
	post := &entity.Post{ID: 1, Number: 1, Title: "Mention", Slug: "mention", User: mock.JonSnow}
	task := tasks.NotifyAboutNewComment(&entity.Comment{ID: 1, Content: "Please check @[Arya Stark]"}, post)
	if err := mock.NewWorker().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).WithBaseURL("http://local.test").Execute(task); err != nil {
		t.Fatal(err)
	}
	if webNotifications == 0 {
		t.Fatal("mention lost its web notification")
	}
	if len(emailmock.MessageHistory) != 0 {
		t.Fatal("mention sent email to an empty address")
	}
}
