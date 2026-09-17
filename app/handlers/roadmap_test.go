package handlers_test

import (
	"context"
	"net/http"
	"reflect"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/handlers"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/mock"
)

func TestRoadmapPage_StatusPagination(t *testing.T) {
	previousMode := env.Config.HostMode
	t.Cleanup(func() { env.Config.HostMode = previousMode })
	for _, tc := range []struct{ requested, expected string }{
		{"", "planned"}, {"planned", "planned"}, {"started", "started"}, {"completed", "completed"},
		{"all", "planned"}, {"recent", "planned"}, {"unknown", "planned"},
	} {
		t.Run(tc.requested, func(t *testing.T) {
			searches, tagQueries := 0, 0
			bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error {
				searches++
				if q.View != tc.expected || q.Query != "progress" || q.Page != "2" || q.Limit != "10" || !q.Paginate {
					t.Fatalf("unexpected progress query: %+v", q)
				}
				if len(q.Statuses) != 0 || q.ModerationFilter != "" || q.MyPostsOnly {
					t.Fatalf("unrelated URL filters changed progress visibility: %+v", q)
				}
				q.Result = []*entity.Post{{ID: 17, Title: "Progress result"}}
				q.TotalCount, q.PageNumber, q.PageSize = 31, 2, 10
				return nil
			})
			bus.AddHandler(func(ctx context.Context, q *query.GetAllTags) error {
				tagQueries++
				q.Result = []*entity.Tag{}
				return nil
			})
			code, props := mock.NewSingleTenantServer().OnTenant(mock.DemoTenant).AsUser(mock.AryaStark).
				WithURL("/roadmap?view=" + tc.requested + "&query=progress&page=2&limit=10&statuses=open&moderation=pending&myposts=true").
				ExecuteAsPage(handlers.RoadmapPage())
			if code != http.StatusOK || searches != 1 || tagQueries != 1 {
				t.Fatalf("expected one search and tag query: status=%d searches=%d tags=%d", code, searches, tagQueries)
			}
			if props.Page != "Roadmap/Roadmap.page" || props.Data["view"] != tc.expected {
				t.Fatalf("unexpected page props: %+v", props)
			}
			expectedPagination := map[string]interface{}{"total": float64(31), "page": float64(2), "pageSize": float64(10)}
			if !reflect.DeepEqual(props.Data["pagination"], expectedPagination) {
				t.Fatalf("unexpected pagination: %#v", props.Data["pagination"])
			}
			posts := props.Data["posts"].([]interface{})
			if len(posts) != 1 || posts[0].(map[string]interface{})["id"] != float64(17) {
				t.Fatalf("unexpected results: %#v", posts)
			}
			if _, legacy := props.Data["plannedPosts"]; legacy {
				t.Fatal("legacy status columns must not be included")
			}
		})
	}
}

func TestRoadmapPage_ProAccess(t *testing.T) {
	previousMode := env.Config.HostMode
	t.Cleanup(func() { env.Config.HostMode = previousMode })
	for _, isPro := range []bool{false, true} {
		server := mock.NewServer()
		tenant := *mock.DemoTenant
		tenant.IsPro = isPro
		searches := 0
		bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error {
			searches++
			q.Result = []*entity.Post{}
			q.PageNumber, q.PageSize = 1, 25
			return nil
		})
		bus.AddHandler(func(ctx context.Context, q *query.GetAllTags) error { return nil })
		code, props := server.OnTenant(&tenant).AsUser(mock.JonSnow).ExecuteAsPage(handlers.RoadmapPage())
		if code != http.StatusOK {
			t.Fatalf("unexpected status: %d", code)
		}
		if isPro {
			if searches != 1 || props.Data["view"] != "planned" {
				t.Fatalf("pro tenant did not receive progress data: %#v", props.Data)
			}
		} else if searches != 0 || len(props.Data) != 0 {
			t.Fatalf("non-pro tenant received progress data: %#v", props.Data)
		}
	}
}

func TestRoadmapPage_QueryFailure(t *testing.T) {
	previousMode := env.Config.HostMode
	t.Cleanup(func() { env.Config.HostMode = previousMode })
	bus.AddHandler(func(ctx context.Context, q *query.SearchPosts) error { return app.ErrNotFound })
	code, _ := mock.NewSingleTenantServer().OnTenant(mock.DemoTenant).AsUser(mock.JonSnow).Execute(handlers.RoadmapPage())
	if code != http.StatusNotFound {
		t.Fatalf("query failure was not returned: %d", code)
	}
}
