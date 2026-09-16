package handlers_test

import (
	"context"
	"net/http"
	"reflect"
	"testing"

	"github.com/getfider/fider/app"

	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"

	"github.com/getfider/fider/app/handlers"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/mock"
)

func TestIndexHandler(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.CountPostPerStatus) error {
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetAllTags) error {
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error {
		return nil
	})

	server := mock.NewServer()
	code, _ := server.OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		Execute(handlers.Index())

	Expect(code).Equals(http.StatusOK)
}

func TestDetailsHandler(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{Number: 1, Title: "My Post Title", Slug: "my-post-title"}

	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetCommentsByPost) error {
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetAttachments) error {
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetAllTags) error {
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.UserSubscribedTo) error {
		return nil
	})

	server := mock.NewServer()

	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		AddParam("slug", post.Slug).
		Execute(handlers.PostDetails())

	Expect(code).Equals(http.StatusOK)
}

func TestDetailsHandler_RedirectOnDifferentSlu(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{Number: 1, Title: "My Post Title", Slug: "my-post-title"}

	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	server := mock.NewServer()

	code, response := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		AddParam("slug", "some-other-slug").
		Execute(handlers.PostDetails())

	Expect(code).Equals(http.StatusTemporaryRedirect)
	Expect(response.Header().Get("Location")).Equals("/posts/1/my-post-title")
}

func TestDetailsHandler_NotFound(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		return app.ErrNotFound
	})

	server := mock.NewServer()
	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", "99").
		Execute(handlers.PostDetails())

	Expect(code).Equals(http.StatusNotFound)
}

func TestIndexHandler_ViewCompatibility(t *testing.T) {
	for _, tc := range []struct{ queryString, view string }{
		{"", "recent"}, {"?view=trending", "recent"}, {"?view=most-wanted", "recent"},
		{"?view=my-votes", "recent"}, {"?view=unknown", "recent"},
		{"?view=most-discussed&myvotes=true", "most-discussed"},
		{"?view=all", "all"}, {"?view=completed", "completed"},
	} {
		t.Run(tc.queryString, func(t *testing.T) {
			RegisterT(t)
			bus.AddHandler(func(ctx context.Context, q *query.CountPostPerStatus) error { return nil })
			bus.AddHandler(func(ctx context.Context, q *query.GetAllTags) error { return nil })
			var search *query.SearchPosts
			bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error { search = q; return nil })
			code, _ := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).
				WithURL("/" + tc.queryString).Execute(handlers.Index())
			Expect(code).Equals(http.StatusOK)
			Expect(search.View).Equals(tc.view)
		})
	}
}

func TestIndexHandler_IgnoresRetiredVoteFilter(t *testing.T) {
	RegisterT(t)
	bus.AddHandler(func(ctx context.Context, q *query.CountPostPerStatus) error { return nil })
	bus.AddHandler(func(ctx context.Context, q *query.GetAllTags) error { return nil })
	searches := []*query.SearchPosts{}
	bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error { searches = append(searches, q); return nil })
	url := "/?view=most-discussed&query=kanban&tags=bug&statuses=completed,pending&myposts=true&moderation=approved&limit=20"
	for _, suffix := range []string{"", "&myvotes=true", "&myvotes=false", "&myvotes=invalid"} {
		code, _ := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).WithURL(url + suffix).Execute(handlers.Index())
		Expect(code).Equals(http.StatusOK)
	}
	for _, search := range searches[1:] {
		if !reflect.DeepEqual(searches[0], search) {
			t.Fatalf("retired myvotes changed active filters: %#v vs %#v", searches[0], search)
		}
	}
	Expect(searches[0].ModerationFilter).Equals("pending")
}

func TestIndexHandler_PreservesModerationFilter(t *testing.T) {
	RegisterT(t)
	bus.AddHandler(func(ctx context.Context, q *query.CountPostPerStatus) error { return nil })
	bus.AddHandler(func(ctx context.Context, q *query.GetAllTags) error { return nil })
	var search *query.SearchPosts
	bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error { search = q; return nil })
	code, _ := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).
		WithURL("/?view=most-wanted&moderation=approved&myvotes=true&statuses=completed").Execute(handlers.Index())
	Expect(code).Equals(http.StatusOK)
	Expect(search.View).Equals("recent")
	Expect(search.ModerationFilter).Equals("approved")
}
