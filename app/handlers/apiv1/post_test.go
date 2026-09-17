package apiv1_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/middlewares"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"

	"github.com/getfider/fider/app/models/cmd"

	"github.com/getfider/fider/app/handlers/apiv1"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/mock"
)

func TestCreatePostHandler(t *testing.T) {
	RegisterT(t)

	var newPost *cmd.AddNewPost
	bus.AddHandler(func(ctx context.Context, c *cmd.AddNewPost) error {
		newPost = c
		c.Result = &entity.Post{
			ID:          1,
			Title:       c.Title,
			Description: c.Description,
		}
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
		return app.ErrNotFound
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		ExecutePost(apiv1.CreatePost(), `{ "title": "My newest post :)" }`)

	Expect(code).Equals(http.StatusOK)
	Expect(newPost.Title).Equals("My newest post :)")
	Expect(newPost.Description).Equals("")
}

func TestCreatePostHandler_AppendsUnreferencedAttachments(t *testing.T) {
	RegisterT(t)

	var newPost *cmd.AddNewPost
	bus.AddHandler(func(ctx context.Context, c *cmd.AddNewPost) error {
		newPost = c
		c.Result = &entity.Post{ID: 1, Title: c.Title, Description: c.Description}
		return nil
	})
	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error { return app.ErrNotFound })
	var attachments *cmd.SetAttachments
	bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { attachments = c; return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		ExecutePost(apiv1.CreatePost(), `{
			"title": "Post with attachments",
			"description": "Already referenced: ![](fider-image:attachments/referenced.png)",
			"attachments": [
				{ "bkey": "attachments/referenced.png" },
				{ "bkey": "attachments/standalone.png" }
			]
		}`)

	Expect(code).Equals(http.StatusOK)
	// The already-referenced attachment is left as-is (not duplicated), and the
	// unreferenced one is appended at the end as a fider-image markdown reference.
	Expect(newPost.Description).Equals("Already referenced: ![](fider-image:attachments/referenced.png)\n\n![](fider-image:attachments/standalone.png)")
	Expect(attachments.Post).Equals(newPost.Result)
	Expect(attachments.Attachments).HasLen(2)
	Expect(attachments.Attachments[0].BlobKey).Equals("attachments/referenced.png")
	Expect(attachments.Attachments[1].BlobKey).Equals("attachments/standalone.png")
}

func TestCreatePostHandler_WithoutTitle(t *testing.T) {
	RegisterT(t)

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		ExecutePost(apiv1.CreatePost(), `{ "title": "" }`)

	Expect(code).Equals(http.StatusBadRequest)
}

func TestCreatePostHandler_WithNonExistentTag(t *testing.T) {
	if env.Config.PostCreationWithTagsEnabled {
		RegisterT(t)

		bus.AddHandler(func(ctx context.Context, q *query.GetTagBySlug) error {
			return app.ErrNotFound
		})
		bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
			return app.ErrNotFound
		})

		code, _ := mock.NewServer().
			OnTenant(mock.DemoTenant).
			AsUser(mock.JonSnow).
			ExecutePost(apiv1.CreatePost(), `{ "title": "My newest post :)", "tags": ["inexistent_tag"]}`)

		Expect(code).Equals(http.StatusBadRequest)
	}
}

func TestCreatePostHandler_WithPrivateTagAsVisitor(t *testing.T) {
	if env.Config.PostCreationWithTagsEnabled {
		RegisterT(t)

		privateTag := &entity.Tag{
			ID:       1,
			Name:     "private_tag",
			Slug:     "private_tag",
			Color:    "blue",
			IsPublic: false,
		}
		bus.AddHandler(func(ctx context.Context, q *query.GetTagBySlug) error {
			if q.Slug == "private_tag" {
				q.Result = privateTag
				return nil
			}
			return app.ErrNotFound
		})

		bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
			return app.ErrNotFound
		})

		code, _ := mock.NewServer().
			OnTenant(mock.DemoTenant).
			AsUser(mock.AryaStark).
			ExecutePost(apiv1.CreatePost(), `{ "title": "My newest post :)", "tags": ["private_tag"]}`)

		Expect(code).Equals(http.StatusForbidden)
	}
}

func TestCreatePostHandler_WithPublicTagAsVisitor(t *testing.T) {
	if env.Config.PostCreationWithTagsEnabled {
		RegisterT(t)

		var newPost *cmd.AddNewPost
		bus.AddHandler(func(ctx context.Context, c *cmd.AddNewPost) error {
			newPost = c
			c.Result = &entity.Post{
				ID:          1,
				Title:       c.Title,
				Description: c.Description,
			}
			return nil
		})

		publicTag := &entity.Tag{
			ID:       1,
			Name:     "public_tag",
			Slug:     "public_tag",
			Color:    "red",
			IsPublic: true,
		}
		bus.AddHandler(func(ctx context.Context, q *query.GetTagBySlug) error {
			if q.Slug == "public_tag" {
				q.Result = publicTag
				return nil
			}
			return app.ErrNotFound
		})

		var tagAssignment *cmd.AssignTag
		bus.AddHandler(func(ctx context.Context, c *cmd.AssignTag) error {
			tagAssignment = c
			return nil
		})

		bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
			return app.ErrNotFound
		})

		bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { return nil })
		bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

		code, _ := mock.NewServer().
			OnTenant(mock.DemoTenant).
			AsUser(mock.AryaStark).
			ExecutePost(apiv1.CreatePost(), `{ "title": "My newest post :)", "tags": ["public_tag"]}`)

		Expect(code).Equals(http.StatusOK)
		Expect(tagAssignment.Tag).Equals(publicTag)
		Expect(tagAssignment.Post).Equals(newPost.Result)
	}
}

func TestCreatePostHandler_WithPublicTagAndPrivateTagAsCollaborator(t *testing.T) {
	if env.Config.PostCreationWithTagsEnabled {
		RegisterT(t)

		var newPost *cmd.AddNewPost
		bus.AddHandler(func(ctx context.Context, c *cmd.AddNewPost) error {
			newPost = c
			c.Result = &entity.Post{
				ID:          1,
				Title:       c.Title,
				Description: c.Description,
			}
			return nil
		})

		publicTag := &entity.Tag{
			ID:       1,
			Name:     "public_tag",
			Slug:     "public_tag",
			Color:    "red",
			IsPublic: true,
		}
		privateTag := &entity.Tag{
			ID:       1,
			Name:     "private_tag",
			Slug:     "private_tag",
			Color:    "blue",
			IsPublic: false,
		}
		bus.AddHandler(func(ctx context.Context, q *query.GetTagBySlug) error {
			if q.Slug == "public_tag" {
				q.Result = publicTag
				return nil
			}
			if q.Slug == "private_tag" {
				q.Result = privateTag
				return nil
			}
			return app.ErrNotFound
		})

		tagAssignments := make([]*cmd.AssignTag, 2)
		bus.AddHandler(func(ctx context.Context, c *cmd.AssignTag) error {
			switch c.Tag.Slug {
			case "public_tag":
				tagAssignments[0] = c
			case "private_tag":
				tagAssignments[1] = c
			}
			return nil
		})

		bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
			return app.ErrNotFound
		})

		bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { return nil })
		bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

		code, _ := mock.NewServer().
			OnTenant(mock.DemoTenant).
			AsUser(mock.JonSnow).
			ExecutePost(apiv1.CreatePost(), `{ "title": "My newest post :)", "tags": ["public_tag", "private_tag"]}`)

		Expect(code).Equals(http.StatusOK)
		Expect(tagAssignments[0].Tag).Equals(publicTag)
		Expect(tagAssignments[1].Tag).Equals(privateTag)
		Expect(tagAssignments[0].Post).Equals(newPost.Result)
		Expect(tagAssignments[1].Post).Equals(newPost.Result)
	}
}

func TestGetPostHandler(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 5, Number: 5, Title: "My First Post", Description: "Such an amazing description"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	code, query := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecuteAsJSON(apiv1.GetPost())

	Expect(code).Equals(http.StatusOK)
	Expect(query.String("title")).Equals(post.Title)
	Expect(query.String("description")).Equals(post.Description)
}

func TestUpdatePostHandler_TenantStaff(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 5, Number: 5, Title: "My First Post", Description: "With a description"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error { return app.ErrNotFound })
	bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

	var updatePost *cmd.UpdatePost
	bus.AddHandler(func(ctx context.Context, c *cmd.UpdatePost) error {
		updatePost = c
		return nil
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecutePost(apiv1.UpdatePost(), `{ "title": "the new title", "description": "new description" }`)

	Expect(code).Equals(http.StatusOK)
	Expect(updatePost.Post).Equals(post)
	Expect(updatePost.Title).Equals("the new title")
	Expect(updatePost.Description).Equals("new description")
}

func TestUpdatePostHandler_AppendsUnreferencedAttachments(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 5, Number: 5, Title: "My First Post", Description: "With a description"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error { return app.ErrNotFound })
	bus.AddHandler(func(ctx context.Context, q *query.GetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

	var updatePost *cmd.UpdatePost
	bus.AddHandler(func(ctx context.Context, c *cmd.UpdatePost) error {
		updatePost = c
		return nil
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecutePost(apiv1.UpdatePost(), `{
			"title": "the new title",
			"description": "Already referenced: ![](fider-image:attachments/referenced.png)",
			"attachments": [
				{ "bkey": "attachments/referenced.png" },
				{ "bkey": "attachments/standalone.png" }
			]
		}`)

	Expect(code).Equals(http.StatusOK)
	// The already-referenced attachment is left as-is (not duplicated), and the
	// unreferenced one is appended at the end as a fider-image markdown reference.
	Expect(updatePost.Description).Equals("Already referenced: ![](fider-image:attachments/referenced.png)\n\n![](fider-image:attachments/standalone.png)")
}

func TestUpdatePostHandler_NonAuthorized(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{
		ID:          5,
		Number:      5,
		Title:       "My First Post",
		Description: "Such an amazing description",
		User:        mock.JonSnow,
	}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.AryaStark).
		AddParam("number", "5").
		ExecutePost(apiv1.UpdatePost(), `{ "title": "the new title", "description": "new description" }`)

	Expect(code).Equals(http.StatusForbidden)
}

func TestUpdatePostHandler_IsOwner_AfterGracePeriod(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{
		ID:          5,
		Number:      5,
		Title:       "My First Post",
		Description: "Such an amazing description",
		User:        mock.AryaStark,
		CreatedAt:   time.Now().UTC().Add(-2 * time.Hour),
	}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.AryaStark).
		AddParam("number", "5").
		ExecutePost(apiv1.UpdatePost(), `{ "title": "the new title", "description": "new description" }`)

	Expect(code).Equals(http.StatusForbidden)
}

func TestUpdatePostHandler_IsOwner_WithinGracePeriod(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{
		ID:          5,
		Number:      5,
		Title:       "My First Post",
		Description: "Such an amazing description",
		User:        mock.AryaStark,
		CreatedAt:   time.Now().UTC(),
	}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})
	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error { return app.ErrNotFound })
	bus.AddHandler(func(ctx context.Context, cmd *cmd.UploadImages) error { return nil })
	bus.AddHandler(func(ctx context.Context, cmd *cmd.SetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, cmd *cmd.UpdatePost) error { return nil })

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.AryaStark).
		AddParam("number", "5").
		ExecutePost(apiv1.UpdatePost(), `{ "title": "the new title", "description": "new description" }`)

	Expect(code).Equals(http.StatusOK)
}

func TestUpdatePostHandler_InvalidTitle(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 5, Number: 5, Title: "My First Post", Description: "Such an amazing description"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error { return app.ErrNotFound })

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecutePost(apiv1.UpdatePost(), `{ "title": "", "description": "" }`)

	Expect(code).Equals(http.StatusBadRequest)
}

func TestUpdatePostHandler_InvalidPost(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 5, Number: 5, Title: "My First Post", Description: "Such an amazing description"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error { return app.ErrNotFound })
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error { return app.ErrNotFound })

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", 999).
		ExecutePost(apiv1.UpdatePost(), `{ "title": "This is a good title!", "description": "And description too..." }`)

	Expect(code).Equals(http.StatusNotFound)
}

func TestUpdatePostHandler_DuplicateTitle(t *testing.T) {
	RegisterT(t)

	post1 := &entity.Post{ID: 1, Number: 1, Title: "My First Post", Slug: "my-first-post"}
	post2 := &entity.Post{ID: 2, Number: 2, Title: "My Second Post", Slug: "my-second-post"}
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

	bus.AddHandler(func(ctx context.Context, q *query.GetPostBySlug) error {
		if q.Slug == post1.Slug {
			q.Result = post1
			return nil
		}
		if q.Slug == post2.Slug {
			q.Result = post2
			return nil
		}
		return app.ErrNotFound
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post1.Number).
		ExecutePost(apiv1.UpdatePost(), `{ "title": "My Second Post", "description": "And description too..." }`)

	Expect(code).Equals(http.StatusBadRequest)
}

func TestSetResponseHandler(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 1, Number: 1, Title: "My First Post", Slug: "my-first-post"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	var setResponse *cmd.SetPostResponse
	bus.AddHandler(func(ctx context.Context, c *cmd.SetPostResponse) error {
		setResponse = c
		return nil
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecutePost(apiv1.SetResponse(), fmt.Sprintf(`{ "status": "%s", "text": "Done!" }`, enum.PostCompleted.Name()))

	Expect(code).Equals(http.StatusOK)
	Expect(setResponse.Post).Equals(post)
	Expect(setResponse.Status).Equals(enum.PostCompleted)
	Expect(setResponse.Text).Equals("Done!")
}

func TestSetResponseHandler_Unauthorized(t *testing.T) {
	RegisterT(t)

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.AryaStark).
		AddParam("number", 5).
		ExecutePost(apiv1.SetResponse(), fmt.Sprintf(`{ "status": "%s", "text": "Done!" }`, enum.PostCompleted.Name()))

	Expect(code).Equals(http.StatusForbidden)
}

func TestSetResponseHandler_Duplicate(t *testing.T) {
	RegisterT(t)

	var markAsDuplicate *cmd.MarkPostAsDuplicate
	bus.AddHandler(func(ctx context.Context, c *cmd.MarkPostAsDuplicate) error {
		markAsDuplicate = c
		return nil
	})

	post1 := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	post2 := &entity.Post{ID: 2, Number: 2, Title: "The Post #2", Description: "The Description #2"}
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

	body := fmt.Sprintf(`{ "status": "%s", "originalNumber": %d }`, enum.PostDuplicate.Name(), post2.Number)
	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post1.ID).
		ExecutePost(apiv1.SetResponse(), body)

	Expect(code).Equals(http.StatusOK)
	Expect(markAsDuplicate.Post).Equals(post1)
	Expect(markAsDuplicate.Original).Equals(post2)
}

func TestSetResponseHandler_Duplicate_NotFound(t *testing.T) {
	RegisterT(t)

	post1 := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post1.Number {
			q.Result = post1
			return nil
		}
		return app.ErrNotFound
	})

	body := fmt.Sprintf(`{ "status": "%s", "originalNumber": 9999 }`, enum.PostDuplicate.Name())
	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post1.ID).
		ExecutePost(apiv1.SetResponse(), body)

	Expect(code).Equals(http.StatusBadRequest)
}

func TestSetResponseHandler_Duplicate_Itself(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		if q.Number == post.Number {
			q.Result = post
			return nil
		}
		return app.ErrNotFound
	})

	body := fmt.Sprintf(`{ "status": "%s", "originalNumber": %d }`, enum.PostDuplicate.Name(), post.Number)
	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.ID).
		ExecutePost(apiv1.SetResponse(), body)

	Expect(code).Equals(http.StatusBadRequest)
}

func TestDeletePostHandler_Authorized(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.PostIsReferenced) error {
		q.Result = false
		return nil
	})

	var deletePost *cmd.SetPostResponse
	bus.AddHandler(func(ctx context.Context, c *cmd.SetPostResponse) error {
		deletePost = c
		return nil
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecutePost(apiv1.DeletePost(), `{ }`)

	Expect(code).Equals(http.StatusOK)
	Expect(deletePost.Post).Equals(post)
	Expect(deletePost.Status).Equals(enum.PostDeleted)
	Expect(deletePost.Text).Equals("")
}

func TestPostCommentHandler(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	var newComment *cmd.AddNewComment
	bus.AddHandler(func(ctx context.Context, c *cmd.AddNewComment) error {
		newComment = c
		c.Result = &entity.Comment{ID: 1, Content: c.Content}
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecutePost(apiv1.PostComment(), `{ "content": "This is a comment!" }`)

	Expect(code).Equals(http.StatusOK)
	Expect(newComment.Post).Equals(post)
	Expect(newComment.Content).Equals("This is a comment!")
}

func TestPostCommentHandlerMentions(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	var newComment *cmd.AddNewComment
	bus.AddHandler(func(ctx context.Context, c *cmd.AddNewComment) error {
		newComment = c
		c.Result = &entity.Comment{ID: 1, Content: c.Content}
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecutePost(apiv1.PostComment(), `{ "content": "Hello @[Jon Snow]!" }`)

	Expect(code).Equals(http.StatusOK)
	Expect(newComment.Post).Equals(post)
	Expect(newComment.Content).Equals("Hello @[Jon Snow]!")
}

func TestPostCommentHandler_WithoutContent(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecutePost(apiv1.PostComment(), `{ "content": "" }`)

	Expect(code).Equals(http.StatusBadRequest)
}

func TestUpdateCommentHandler_Authorized(t *testing.T) {
	RegisterT(t)

	server := mock.NewServer()

	post := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	comment := &entity.Comment{ID: 5, Content: "Old comment text", User: mock.AryaStark}
	bus.AddHandler(func(ctx context.Context, q *query.GetCommentByID) error {
		q.Result = comment
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetPostByID) error {
		q.Result = post
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.SetAttachments) error { return nil })
	bus.AddHandler(func(ctx context.Context, c *cmd.UploadImages) error { return nil })

	var updateComment *cmd.UpdateComment
	bus.AddHandler(func(ctx context.Context, c *cmd.UpdateComment) error {
		updateComment = c
		return nil
	})

	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.AryaStark).
		AddParam("number", post.Number).
		AddParam("id", comment.ID).
		ExecutePost(apiv1.UpdateComment(), `{ "content": "My first comment has been edited" }`)

	Expect(code).Equals(http.StatusOK)
	Expect(updateComment.Content).Equals("My first comment has been edited")
}

func TestUpdateCommentHandler_Unauthorized(t *testing.T) {
	RegisterT(t)

	server := mock.NewServer()

	post := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	comment := &entity.Comment{ID: 5, Content: "Old comment text", User: mock.JonSnow}
	bus.AddHandler(func(ctx context.Context, q *query.GetCommentByID) error {
		q.Result = comment
		return nil
	})

	code, _ := server.
		OnTenant(mock.DemoTenant).
		AsUser(mock.AryaStark).
		AddParam("number", post.Number).
		AddParam("id", comment.ID).
		ExecutePost(apiv1.UpdateComment(), `{ "content": "My first comment has been edited" }`)

	Expect(code).Equals(http.StatusForbidden)
}

func TestListCommentHandler(t *testing.T) {
	RegisterT(t)

	post := &entity.Post{ID: 1, Number: 1, Title: "The Post #1", Description: "The Description #1"}
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = post
		return nil
	})

	bus.AddHandler(func(ctx context.Context, q *query.GetCommentsByPost) error {
		q.Result = []*entity.Comment{
			{ID: 1, Content: "First Comment"},
			{ID: 2, Content: "First Comment"},
		}
		return nil
	})

	code, query := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", post.Number).
		ExecuteAsJSON(apiv1.ListComments())

	Expect(code).Equals(http.StatusOK)
	Expect(query.IsArray()).IsTrue()
	Expect(query.ArrayLength()).Equals(2)
}

func TestCommentReactionToggleHandler(t *testing.T) {
	RegisterT(t)

	comment := &entity.Comment{ID: 5, Content: "Old comment text", User: mock.AryaStark}

	bus.AddHandler(func(ctx context.Context, q *query.GetCommentByID) error {
		q.Result = comment
		return nil
	})

	testCases := []struct {
		name     string
		user     *entity.User
		reaction string
	}{
		{"JonSnow reacts with like", mock.JonSnow, "👍"},
		{"AryaStark reacts with smile", mock.AryaStark, "👍"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var toggleReaction *cmd.ToggleCommentReaction
			bus.AddHandler(func(ctx context.Context, c *cmd.ToggleCommentReaction) error {
				toggleReaction = c
				return nil
			})

			code, _ := mock.NewServer().
				OnTenant(mock.DemoTenant).
				AsUser(tc.user).
				AddParam("number", 1).
				AddParam("id", comment.ID).
				AddParam("reaction", tc.reaction).
				ExecutePost(apiv1.ToggleReaction(), ``)

			Expect(code).Equals(http.StatusOK)
			Expect(toggleReaction.Emoji).Equals(tc.reaction)
			Expect(toggleReaction.Comment).Equals(comment)
			Expect(toggleReaction.User).Equals(tc.user)
		})
	}
}

func TestCommentReactionToggleHandler_InvalidEmoji(t *testing.T) {
	RegisterT(t)

	comment := &entity.Comment{ID: 5, Content: "Old comment text", User: mock.AryaStark}
	bus.AddHandler(func(ctx context.Context, q *query.GetCommentByID) error {
		q.Result = comment
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.ToggleCommentReaction) error {
		return nil
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.AryaStark).
		AddParam("number", 1).
		AddParam("id", comment.ID).
		AddParam("reaction", "like").
		ExecutePost(apiv1.ToggleReaction(), ``)

	Expect(code).Equals(http.StatusBadRequest)
}

func TestCommentReactionToggleHandler_UnAuthorised(t *testing.T) {
	RegisterT(t)

	comment := &entity.Comment{ID: 5, Content: "Old comment text", User: mock.AryaStark}
	bus.AddHandler(func(ctx context.Context, q *query.GetCommentByID) error {
		q.Result = comment
		return nil
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.ToggleCommentReaction) error {
		return nil
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AddParam("number", 1).
		AddParam("id", comment.ID).
		AddParam("reaction", "👍").
		ExecutePost(apiv1.ToggleReaction(), ``)

	Expect(code).Equals(http.StatusForbidden)
}

func TestCommentReactionToggleHandler_MismatchingTenantAndComment(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.GetCommentByID) error {
		return app.ErrNotFound
	})

	bus.AddHandler(func(ctx context.Context, c *cmd.ToggleCommentReaction) error {
		return nil
	})

	code, _ := mock.NewServer().
		OnTenant(mock.DemoTenant).
		AsUser(mock.JonSnow).
		AddParam("number", 1).
		AddParam("id", 1).
		AddParam("reaction", "👍").
		ExecutePost(apiv1.ToggleReaction(), ``)

	Expect(code).Equals(http.StatusNotFound)
}

func TestSearchPostsHandler_ViewCompatibility(t *testing.T) {
	for _, tc := range []struct{ queryString, view string }{
		{"", "all"},
		{"?view=all", "all"},
		{"?view=recent", "recent"},
		{"?view=trending", "recent"},
		{"?view=most-wanted", "recent"},
		{"?view=my-votes", "recent"},
		{"?view=unknown", "recent"},
		{"?view=most-discussed&myvotes=true", "most-discussed"},
		{"?view=planned", "planned"},
		{"?view=completed", "completed"},
	} {
		t.Run(tc.queryString, func(t *testing.T) {
			RegisterT(t)
			var search *query.SearchPosts
			bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error { search = q; return nil })
			code, _ := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).
				WithURL("/api/v1/posts" + tc.queryString).Execute(apiv1.SearchPosts())
			Expect(code).Equals(http.StatusOK)
			Expect(search.View).Equals(tc.view)
		})
	}
}

func TestSearchPostsHandler_IgnoresRetiredVoteFilter(t *testing.T) {
	for _, value := range []string{"true", "false", "invalid"} {
		t.Run(value, func(t *testing.T) {
			RegisterT(t)
			searches := []*query.SearchPosts{}
			bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error { searches = append(searches, q); return nil })
			url := "/api/v1/posts?view=most-discussed&query=kanban&tags=bug&statuses=completed&myposts=true&notags=true&moderation=pending&limit=20"
			for _, suffix := range []string{"", "&myvotes=" + value} {
				code, _ := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).WithURL(url + suffix).Execute(apiv1.SearchPosts())
				Expect(code).Equals(http.StatusOK)
			}
			if !reflect.DeepEqual(searches[0], searches[1]) {
				t.Fatalf("retired myvotes changed active filters: %#v vs %#v", searches[0], searches[1])
			}
			Expect(searches[1].View).Equals("most-discussed")
			Expect(searches[1].Query).Equals("kanban")
			Expect(searches[1].Tags).Equals([]string{"bug"})
			Expect(searches[1].Statuses).Equals([]enum.PostStatus{enum.PostCompleted})
			Expect(searches[1].MyPostsOnly).IsTrue()
			Expect(searches[1].NoTagsOnly).IsTrue()
			Expect(searches[1].Limit).Equals("20")
		})
	}
}

func TestGetSubscriptionHandler(t *testing.T) {
	for _, subscribed := range []bool{true, false} {
		for _, user := range []*entity.User{mock.JonSnow, mock.AryaStark} {
			t.Run(fmt.Sprintf("role=%d/subscribed=%t", user.Role, subscribed), func(t *testing.T) {
				RegisterT(t)
				post := &entity.Post{ID: 5, Number: 3}
				bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
					Expect(q.Number).Equals(post.Number)
					Expect(ctx.Value(app.TenantCtxKey)).Equals(mock.DemoTenant)
					q.Result = post
					return nil
				})
				bus.AddHandler(func(ctx context.Context, q *query.UserSubscribedTo) error {
					Expect(q.PostID).Equals(post.ID)
					Expect(ctx.Value(app.UserCtxKey)).Equals(user)
					q.Result = subscribed
					return nil
				})
				code, response := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(user).
					Use(middlewares.IsAuthenticated()).AddParam("number", post.Number).
					ExecuteAsJSON(apiv1.GetSubscription())
				Expect(code).Equals(http.StatusOK)
				Expect(string(response.Raw("subscribed"))).Equals(fmt.Sprint(subscribed))
			})
		}
	}
}

func TestGetSubscriptionHandler_InaccessiblePost(t *testing.T) {
	for _, number := range []string{"invalid", "999"} {
		t.Run(number, func(t *testing.T) {
			RegisterT(t)
			bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
				// The same not-found result protects records outside the tenant or moderation scope.
				return app.ErrNotFound
			})
			code, _ := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.AryaStark).
				Use(middlewares.IsAuthenticated()).AddParam("number", number).
				Execute(apiv1.GetSubscription())
			Expect(code).Equals(http.StatusNotFound)
			Expect(bus.GetCallCount(&query.UserSubscribedTo{})).Equals(0)
		})
	}
}

func TestGetSubscriptionHandler_Unauthenticated(t *testing.T) {
	RegisterT(t)
	code, _ := mock.NewServer().OnTenant(mock.DemoTenant).
		Use(middlewares.IsAuthenticated()).AddParam("number", 1).
		Execute(apiv1.GetSubscription())
	Expect(code).Equals(http.StatusUnauthorized)
	Expect(bus.GetCallCount(&query.GetPostByNumber{})).Equals(0)
	Expect(bus.GetCallCount(&query.UserSubscribedTo{})).Equals(0)
}

func TestGetSubscriptionHandler_QueryFailure(t *testing.T) {
	RegisterT(t)
	bus.AddHandler(func(ctx context.Context, q *query.GetPostByNumber) error {
		q.Result = &entity.Post{ID: 5, Number: 3}
		return nil
	})
	bus.AddHandler(func(ctx context.Context, q *query.UserSubscribedTo) error {
		return fmt.Errorf("subscription lookup failed")
	})
	code, _ := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.AryaStark).
		Use(middlewares.IsAuthenticated()).AddParam("number", 3).
		Execute(apiv1.GetSubscription())
	Expect(code).Equals(http.StatusInternalServerError)
}

func TestSearchPostsHandler_PaginationResponseCompatibility(t *testing.T) {
	for _, tc := range []struct {
		url      string
		paginate bool
	}{
		{"/api/v1/posts?limit=10", false}, {"/api/v1/posts?page=2&limit=10", true}, {"/api/v1/posts?page=&limit=10", true},
	} {
		t.Run(tc.url, func(t *testing.T) {
			RegisterT(t)
			bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error {
				if q.Paginate != tc.paginate || q.Limit != "10" {
					t.Fatalf("incorrect pagination opt-in: %+v", q)
				}
				q.TotalCount = 31
				q.PageNumber = 2
				q.PageSize = 10
				q.Result = []*entity.Post{}
				return nil
			})
			code, response := mock.NewServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).WithURL(tc.url).Execute(apiv1.SearchPosts())
			Expect(code).Equals(http.StatusOK)
			if tc.paginate {
				var result struct {
					Posts    []entity.Post `json:"posts"`
					Total    int           `json:"total"`
					Page     int           `json:"page"`
					PageSize int           `json:"pageSize"`
				}
				if err := json.Unmarshal(response.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if result.Posts == nil || result.Total != 31 || result.Page != 2 || result.PageSize != 10 {
					t.Fatalf("invalid pagination response: %+v", result)
				}
			} else {
				if strings.TrimSpace(response.Body.String()) != "[]" {
					t.Fatalf("legacy array response changed: %s", response.Body.String())
				}
			}
		})
	}
}
