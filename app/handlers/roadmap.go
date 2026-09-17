package handlers

import (
	"net/http"

	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/web"
)

// RoadmapPage renders one paginated progress status. Pro tenants and self-hosted
// installations get the full data; other tenants render the page with no data
// so the client shows the upgrade call-to-action.
func RoadmapPage() web.HandlerFunc {
	return func(c *web.Context) error {
		props := web.Props{
			Page:  "Roadmap/Roadmap.page",
			Title: i18n.T(c, "page.progress.title"),
		}

		if env.IsSingleHostMode() || c.Tenant().IsPro {
			view := c.QueryParam("view")
			switch view {
			case "planned", "started", "completed":
			default:
				view = "planned"
			}
			searchPosts := &query.SearchPosts{
				View:     view,
				Query:    c.QueryParam("query"),
				Page:     c.QueryParam("page"),
				Limit:    c.QueryParam("limit"),
				Paginate: true,
			}
			getAllTags := &query.GetAllTags{}

			if err := bus.Dispatch(c, searchPosts, getAllTags); err != nil {
				return c.Failure(err)
			}

			props.Data = web.Map{
				"posts": searchPosts.Result,
				"pagination": web.Map{
					"total": searchPosts.TotalCount, "page": searchPosts.PageNumber, "pageSize": searchPosts.PageSize,
				},
				"tags": getAllTags.Result,
				"view": view,
			}
		}

		return c.Page(http.StatusOK, props)
	}
}
