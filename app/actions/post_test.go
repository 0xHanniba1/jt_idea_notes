package actions_test

import (
	"context"
	"strings"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"

	"github.com/getfider/fider/app/actions"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/validate"
	"github.com/gosimple/slug"
)

func TestCreateNewPost_InvalidPostTitles(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
		if q.Slug == "my-great-post" {
			q.Result = &entity.Post{Slug: q.Slug}
			return nil
		}
		return app.ErrNotFound
	})

	for _, title := range []string{
		"",
		"  ",
		"My great great great great great great great great great great great great great great great great great post.",
		"my GREAT post",
	} {
		action := &actions.CreateNewPost{Title: title}
		result := action.Validate(context.Background(), nil)
		ExpectFailed(result, "title")
	}
}

func TestCreateNewPost_ValidPostTitles(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
		return app.ErrNotFound
	})

	for _, title := range []string{
		"me",
		"signup",
		"this is my new post",
		"this post is very descriptive",
	} {
		action := &actions.CreateNewPost{Title: title}
		result := action.Validate(context.Background(), nil)
		ExpectSuccess(result)
	}
}

func TestPostTitleUnicodeLengthAndNormalization(t *testing.T) {
	tests := []struct {
		name       string
		title      string
		normalized string
		valid      bool
	}{
		{name: "one Chinese character", title: "记", normalized: "记", valid: true},
		{name: "100 Chinese characters", title: strings.Repeat("记", 100), normalized: strings.Repeat("记", 100), valid: true},
		{name: "101 Chinese characters", title: strings.Repeat("记", 101), normalized: strings.Repeat("记", 101)},
		{name: "one emoji", title: "🔔", normalized: "🔔", valid: true},
		{name: "100 emoji", title: strings.Repeat("🔔", 100), normalized: strings.Repeat("🔔", 100), valid: true},
		{name: "101 emoji", title: strings.Repeat("🔔", 101), normalized: strings.Repeat("🔔", 101)},
		{name: "100 ASCII characters", title: strings.Repeat("a", 100), normalized: strings.Repeat("a", 100), valid: true},
		{name: "101 ASCII characters", title: strings.Repeat("a", 101), normalized: strings.Repeat("a", 101)},
		{name: "empty", title: "", normalized: ""},
		{name: "only Unicode whitespace", title: " \t\n\r\u0085\u00a0\u1680\u2003\u2028\u2029\u202f\u205f\u3000\uFEFF", normalized: ""},
		{name: "mixed whitespace", title: "\uFEFF  启用\t\u0085\u2003🔔\u00a0通知\n\uFEFF", normalized: "启用 🔔 通知", valid: true},
		{name: "normalized length", title: "\uFEFF  " + strings.Repeat("记", 100) + "\u3000\n", normalized: strings.Repeat("记", 100), valid: true},
	}

	for _, operation := range []string{"create", "update"} {
		for _, tt := range tests {
			t.Run(operation+"/"+tt.name, func(t *testing.T) {
				RegisterT(t)
				var queriedSlug string
				bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
					queriedSlug = q.Slug
					return app.ErrNotFound
				})

				var result *validate.Result
				var normalized string
				if operation == "create" {
					action := &actions.CreateNewPost{Title: tt.title}
					result = action.Validate(context.Background(), nil)
					normalized = action.Title
				} else {
					action := &actions.UpdatePost{Title: tt.title, Post: &entity.Post{ID: 1}}
					result = action.Validate(context.Background(), nil)
					normalized = action.Title
				}
				if normalized != tt.normalized {
					t.Fatalf("stored title = %q, want %q", normalized, tt.normalized)
				}
				if tt.valid {
					ExpectSuccess(result)
					if queriedSlug != slug.Make(tt.normalized) {
						t.Fatalf("duplicate lookup slug = %q, want %q", queriedSlug, slug.Make(tt.normalized))
					}
				} else {
					ExpectFailed(result, "title")
				}
			})
		}
	}
}

func TestPostTitleNormalizationPreservesDuplicateChecks(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
		if q.Slug == "my-great-post" {
			q.Result = &entity.Post{ID: 2, Slug: q.Slug}
			return nil
		}
		return app.ErrNotFound
	})

	title := " \uFEFFmy\u2003GREAT\npost\u0085"
	create := &actions.CreateNewPost{Title: title}
	ExpectFailed(create.Validate(context.Background(), nil), "title")
	Expect(create.Title).Equals("my GREAT post")

	update := &actions.UpdatePost{Title: title, Post: &entity.Post{ID: 1}}
	ExpectFailed(update.Validate(context.Background(), nil), "title")
	Expect(update.Title).Equals("my GREAT post")

	ownPost := &actions.UpdatePost{Title: title, Post: &entity.Post{ID: 2}}
	ExpectSuccess(ownPost.Validate(context.Background(), nil))
	Expect(ownPost.Title).Equals("my GREAT post")
}

func TestSetResponse_InvalidStatus(t *testing.T) {
	RegisterT(t)

	action := &actions.SetResponse{
		Status: enum.PostDeleted,
		Text:   "Spam!",
	}
	result := action.Validate(context.Background(), nil)
	ExpectFailed(result, "status")
}

func TestDeletePost_WhenIsBeingReferenced(t *testing.T) {
	RegisterT(t)

	post1 := &entity.Post{ID: 1, Number: 1, Title: "Post 1"}
	post2 := &entity.Post{ID: 2, Number: 2, Title: "Post 2"}

	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post1.Number {
			q.Result = post1
			return nil
		}

		if q.Number == post2.Number {
			q.Result = post2
			return nil
		}

		return app.ErrNotFound
	})

	bus.AddHandler(func(ctx context.Context, q *query.PostIsReferenced) error {
		q.Result = q.PostID == post2.ID
		return nil
	})

	action := &actions.DeletePost{}
	action.Number = post1.Number
	ExpectSuccess(action.Validate(context.Background(), nil))

	action.Number = post2.Number
	ExpectFailed(action.Validate(context.Background(), nil))
}

func TestDeleteComment(t *testing.T) {
	RegisterT(t)

	author := &entity.User{ID: 1, Role: enum.RoleVisitor}
	notAuthor := &entity.User{ID: 2, Role: enum.RoleVisitor}
	administrator := &entity.User{ID: 3, Role: enum.RoleAdministrator}
	comment := &entity.Comment{
		ID:      1,
		User:    author,
		Content: "Comment #1",
	}

	bus.AddHandler(func(ctx context.Context, q *query.GetCommentByID) error {
		if q.CommentID == comment.ID {
			q.Result = comment
			return nil
		}
		return app.ErrNotFound
	})

	action := &actions.DeleteComment{
		CommentID: comment.ID,
	}

	authorized := action.IsAuthorized(context.Background(), notAuthor)
	Expect(authorized).IsFalse()

	authorized = action.IsAuthorized(context.Background(), author)
	Expect(authorized).IsTrue()

	authorized = action.IsAuthorized(context.Background(), administrator)
	Expect(authorized).IsTrue()
}

func TestAddNewComment_TooLongContent(t *testing.T) {
	RegisterT(t)

	action := &actions.AddNewComment{Content: strings.Repeat("a", 4001)}
	result := action.Validate(context.Background(), nil)
	ExpectFailed(result, "content")
}

func TestAddNewComment_AtMaxLength(t *testing.T) {
	RegisterT(t)

	action := &actions.AddNewComment{Content: strings.Repeat("a", 4000)}
	result := action.Validate(context.Background(), nil)
	ExpectSuccess(result)
}

func TestEditComment_TooLongContent(t *testing.T) {
	RegisterT(t)

	action := &actions.EditComment{Content: strings.Repeat("a", 4001)}
	result := action.Validate(context.Background(), nil)
	ExpectFailed(result, "content")
}

func TestEditComment_AtMaxLength(t *testing.T) {
	RegisterT(t)

	action := &actions.EditComment{Content: strings.Repeat("a", 4000)}
	result := action.Validate(context.Background(), nil)
	ExpectSuccess(result)
}
