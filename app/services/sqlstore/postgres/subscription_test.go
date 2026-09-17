package postgres_test

import (
	"strconv"
	"testing"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"

	. "github.com/getfider/fider/app/pkg/assert"
)

func TestSubscription_NoSettings(t *testing.T) {
	ctx := SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost := &cmd.AddNewPost{Title: "My new post", Description: "with this description"}
	err := bus.Dispatch(aryaStarkCtx, newPost)
	Expect(err).IsNil()

	newPostSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewPost}
	newCommentSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewComment}
	changeStatusSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventChangeStatus}
	err = bus.Dispatch(aryaStarkCtx, newPostSubscribers, newCommentSubscribers, changeStatusSubscribers)
	Expect(err).IsNil()

	Expect(newPostSubscribers.Result).HasLen(1)
	Expect(newPostSubscribers.Result[0].ID).Equals(jonSnow.ID)

	Expect(newCommentSubscribers.Result).HasLen(1)
	Expect(newCommentSubscribers.Result[0].ID).Equals(jonSnow.ID)

	Expect(changeStatusSubscribers.Result).HasLen(2)
	Expect(changeStatusSubscribers.Result[0].ID).Equals(jonSnow.ID)
	Expect(changeStatusSubscribers.Result[1].ID).Equals(aryaStark.ID)

	subscribed := &query.UserSubscribedTo{PostID: newPost.Result.ID}

	err = bus.Dispatch(ctx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()

	err = bus.Dispatch(jonSnowCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsTrue()

	err = bus.Dispatch(aryaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsTrue()

	err = bus.Dispatch(sansaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()
}

func TestSubscription_RemoveSubscriber(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost := &cmd.AddNewPost{Title: "Post #1", Description: "Description #1"}
	err := bus.Dispatch(aryaStarkCtx, newPost)
	Expect(err).IsNil()

	err = bus.Dispatch(aryaStarkCtx, &cmd.RemoveSubscriber{Post: newPost.Result, User: aryaStark})
	Expect(err).IsNil()

	newPostSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewPost}
	newCommentSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewComment}
	changeStatusSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventChangeStatus}
	err = bus.Dispatch(aryaStarkCtx, newPostSubscribers, newCommentSubscribers, changeStatusSubscribers)
	Expect(err).IsNil()

	Expect(newPostSubscribers.Result).HasLen(1)
	Expect(newPostSubscribers.Result[0].ID).Equals(jonSnow.ID)

	Expect(newCommentSubscribers.Result).HasLen(1)
	Expect(newCommentSubscribers.Result[0].ID).Equals(jonSnow.ID)

	Expect(changeStatusSubscribers.Result).HasLen(1)
	Expect(changeStatusSubscribers.Result[0].ID).Equals(jonSnow.ID)

	subscribed := &query.UserSubscribedTo{PostID: newPost.Result.ID}

	err = bus.Dispatch(jonSnowCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsTrue()

	err = bus.Dispatch(aryaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()

	err = bus.Dispatch(sansaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()
}

func TestSubscription_AdminSubmitted(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost := &cmd.AddNewPost{Title: "Post #1", Description: "Description #1"}
	err := bus.Dispatch(jonSnowCtx, newPost)
	Expect(err).IsNil()

	newPostSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewPost}
	newCommentSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewComment}
	changeStatusSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventChangeStatus}
	err = bus.Dispatch(jonSnowCtx, newPostSubscribers, newCommentSubscribers, changeStatusSubscribers)
	Expect(err).IsNil()

	Expect(newPostSubscribers.Result).HasLen(1)
	Expect(newPostSubscribers.Result[0].ID).Equals(jonSnow.ID)

	Expect(newCommentSubscribers.Result).HasLen(1)
	Expect(newCommentSubscribers.Result[0].ID).Equals(jonSnow.ID)

	Expect(changeStatusSubscribers.Result).HasLen(1)
	Expect(changeStatusSubscribers.Result[0].ID).Equals(jonSnow.ID)

	subscribed := &query.UserSubscribedTo{PostID: newPost.Result.ID}

	err = bus.Dispatch(jonSnowCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsTrue()

	err = bus.Dispatch(aryaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()

	err = bus.Dispatch(sansaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()
}

func TestSubscription_AdminUnsubscribed(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost := &cmd.AddNewPost{Title: "Post #1", Description: "Description #1"}
	err := bus.Dispatch(aryaStarkCtx, newPost)
	Expect(err).IsNil()

	bus.MustDispatch(aryaStarkCtx, &cmd.RemoveSubscriber{Post: newPost.Result, User: aryaStark})
	bus.MustDispatch(aryaStarkCtx, &cmd.RemoveSubscriber{Post: newPost.Result, User: jonSnow})

	newCommentSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewComment}
	err = bus.Dispatch(aryaStarkCtx, newCommentSubscribers)
	Expect(err).IsNil()
	Expect(newCommentSubscribers.Result).HasLen(0)

	subscribed := &query.UserSubscribedTo{PostID: newPost.Result.ID}

	err = bus.Dispatch(jonSnowCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()

	err = bus.Dispatch(aryaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()

	err = bus.Dispatch(sansaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()
}

func TestSubscription_EnabledCommentNotifications(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost := &cmd.AddNewPost{Title: "Post #1", Description: "Description #1"}
	err := bus.Dispatch(aryaStarkCtx, newPost)
	Expect(err).IsNil()

	err = bus.Dispatch(aryaStarkCtx, &cmd.UpdateCurrentUserSettings{
		Settings: map[string]string{
			enum.NotificationEventNewComment.UserSettingsKeyName: strconv.Itoa(int(enum.NotificationChannelWeb)),
		},
	})
	Expect(err).IsNil()

	newCommentWebSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewComment}
	changeStatusSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventChangeStatus}
	err = bus.Dispatch(aryaStarkCtx, newCommentWebSubscribers, changeStatusSubscribers)
	Expect(err).IsNil()

	Expect(newCommentWebSubscribers.Result).HasLen(2)
	Expect(newCommentWebSubscribers.Result[0].ID).Equals(jonSnow.ID)
	Expect(newCommentWebSubscribers.Result[1].ID).Equals(aryaStark.ID)

	Expect(changeStatusSubscribers.Result).HasLen(2)
	Expect(changeStatusSubscribers.Result[0].ID).Equals(jonSnow.ID)
	Expect(changeStatusSubscribers.Result[1].ID).Equals(aryaStark.ID)

	subscribed := &query.UserSubscribedTo{PostID: newPost.Result.ID}

	err = bus.Dispatch(jonSnowCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsTrue()

	err = bus.Dispatch(aryaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsTrue()

	err = bus.Dispatch(sansaStarkCtx, subscribed)
	Expect(err).IsNil()
	Expect(subscribed.Result).IsFalse()
}

func TestSubscription_VisitorEnabledNewPost(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost := &cmd.AddNewPost{Title: "Post #1", Description: "Description #1"}
	err := bus.Dispatch(jonSnowCtx, newPost)
	Expect(err).IsNil()

	err = bus.Dispatch(aryaStarkCtx, &cmd.UpdateCurrentUserSettings{
		Settings: map[string]string{
			enum.NotificationEventNewPost.UserSettingsKeyName: strconv.Itoa(int(enum.NotificationChannelWeb)),
		},
	})
	Expect(err).IsNil()

	newPostWebSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewPost}
	err = bus.Dispatch(aryaStarkCtx, newPostWebSubscribers)
	Expect(err).IsNil()

	Expect(newPostWebSubscribers.Result).HasLen(2)
	Expect(newPostWebSubscribers.Result[0].ID).Equals(jonSnow.ID)
	Expect(newPostWebSubscribers.Result[1].ID).Equals(aryaStark.ID)

}

func TestSubscription_DisabledEverything(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost := &cmd.AddNewPost{Title: "Post #1", Description: "Description #1"}
	err := bus.Dispatch(jonSnowCtx, newPost)
	Expect(err).IsNil()

	disableAll := map[string]string{
		enum.NotificationEventNewPost.UserSettingsKeyName:      "0",
		enum.NotificationEventNewComment.UserSettingsKeyName:   "0",
		enum.NotificationEventChangeStatus.UserSettingsKeyName: "0",
	}

	err = bus.Dispatch(aryaStarkCtx, &cmd.UpdateCurrentUserSettings{Settings: disableAll})
	Expect(err).IsNil()

	err = bus.Dispatch(jonSnowCtx, &cmd.UpdateCurrentUserSettings{Settings: disableAll})
	Expect(err).IsNil()

	newPostWebSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewPost}
	newCommentWebSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewComment}
	changeStatusWebSubscribers := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventChangeStatus}
	err = bus.Dispatch(aryaStarkCtx, newPostWebSubscribers, newCommentWebSubscribers, changeStatusWebSubscribers)
	Expect(err).IsNil()

	Expect(newPostWebSubscribers.Result).HasLen(0)
	Expect(newCommentWebSubscribers.Result).HasLen(0)
	Expect(changeStatusWebSubscribers.Result).HasLen(0)
}

func TestSubscription_DeletedPost(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost := &cmd.AddNewPost{Title: "Post #1", Description: "Description #1"}
	err := bus.Dispatch(aryaStarkCtx, newPost)
	Expect(err).IsNil()

	err = bus.Dispatch(aryaStarkCtx, &cmd.SetPostResponse{Post: newPost.Result, Text: "Invalid Post!", Status: enum.PostDeleted})
	Expect(err).IsNil()

	q := &query.GetActiveSubscribers{Number: newPost.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventChangeStatus}
	err = bus.Dispatch(aryaStarkCtx, q)
	Expect(err).IsNil()
	Expect(q.Result).HasLen(2)
	Expect(q.Result[0].ID).Equals(jonSnow.ID)
	Expect(q.Result[1].ID).Equals(aryaStark.ID)
}

func TestSubscription_SubscribedToDifferentPost(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()

	newPost1 := &cmd.AddNewPost{Title: "Post #1", Description: "Description #1"}
	newPost2 := &cmd.AddNewPost{Title: "Post #2", Description: "Description #2"}
	err := bus.Dispatch(jonSnowCtx, newPost1, newPost2)
	Expect(err).IsNil()

	err = bus.Dispatch(jonSnowCtx, &cmd.AddSubscriber{Post: newPost2.Result, User: aryaStark})
	Expect(err).IsNil()

	q := &query.GetActiveSubscribers{Number: newPost1.Result.Number, Channel: enum.NotificationChannelWeb, Event: enum.NotificationEventNewComment}
	err = bus.Dispatch(jonSnowCtx, q)
	Expect(err).IsNil()
	Expect(q.Result).HasLen(1)
	Expect(q.Result[0].ID).Equals(jonSnow.ID)
}

func TestSubscription_LegacyPreferencesKeepOnlyWebBit(t *testing.T) {
	for _, tc := range []struct {
		stored  string
		current string
		enabled bool
	}{
		{stored: "3", current: "1", enabled: true},
		{stored: "2", current: "0", enabled: false},
	} {
		t.Run(tc.stored, func(t *testing.T) {
			SetupDatabaseTest(t)
			defer TeardownDatabaseTest()
			post := &cmd.AddNewPost{Title: "Legacy notification preference", Description: "Preserve the site notification bit"}
			if err := bus.Dispatch(aryaStarkCtx, post); err != nil {
				t.Fatal(err)
			}
			// Seed persisted legacy values directly; new settings only accept 0 or 1.
			for _, event := range enum.AllNotificationEvents {
				if _, err := trx.Execute(`INSERT INTO user_settings (tenant_id, user_id, key, value)
                    VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, key) DO UPDATE SET value = $4`,
					demoTenant.ID, aryaStark.ID, event.UserSettingsKeyName, tc.stored); err != nil {
					t.Fatal(err)
				}
			}
			settings := &query.GetCurrentUserSettings{}
			if err := bus.Dispatch(aryaStarkCtx, settings); err != nil {
				t.Fatal(err)
			}
			for _, event := range enum.AllNotificationEvents {
				if got := settings.Result[event.UserSettingsKeyName]; got != tc.current {
					t.Fatalf("legacy %s should read as %s for %s, got %s", tc.stored, tc.current, event.UserSettingsKeyName, got)
				}
				subscribers := &query.GetActiveSubscribers{Number: post.Result.Number, Channel: enum.NotificationChannelWeb, Event: event}
				if err := bus.Dispatch(jonSnowCtx, subscribers); err != nil {
					t.Fatal(err)
				}
				found := false
				for _, user := range subscribers.Result {
					if user.ID == aryaStark.ID {
						found = true
					}
				}
				if found != tc.enabled {
					t.Fatalf("legacy %s unexpectedly changed web delivery for %s: enabled=%v", tc.stored, event.UserSettingsKeyName, found)
				}
			}
		})
	}
}

func TestSubscription_OnlyWebChannelIsSupported(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	for _, channel := range []enum.NotificationChannel{0, 2, 3} {
		q := &query.GetActiveSubscribers{Number: 1, Channel: channel, Event: enum.NotificationEventNewPost}
		if err := bus.Dispatch(jonSnowCtx, q); err == nil {
			t.Fatalf("unsupported notification channel %d was accepted", channel)
		}
	}
}

func TestSubscription_DefaultSettingsUseWebChannel(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	q := &query.GetCurrentUserSettings{}
	if err := bus.Dispatch(jonSnowCtx, q); err != nil {
		t.Fatal(err)
	}
	for _, event := range enum.AllNotificationEvents {
		if event.DefaultSettingValue != "1" || q.Result[event.UserSettingsKeyName] != "1" {
			t.Fatalf("default preference is not site-only for %s: %s", event.UserSettingsKeyName, q.Result[event.UserSettingsKeyName])
		}
	}
}
