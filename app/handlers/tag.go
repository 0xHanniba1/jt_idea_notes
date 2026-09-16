package handlers

import (
	"net/http"

	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/i18n"
	"github.com/getfider/fider/app/pkg/web"
)

// ManageTags is the home page for managing tags
func ManageTags() web.HandlerFunc {
	return func(c *web.Context) error {
		getAllTags := &query.GetAllTags{}
		if err := bus.Dispatch(c, getAllTags); err != nil {
			return c.Failure(err)
		}

		return c.Page(http.StatusOK, web.Props{
			Page:  "Administration/pages/ManageTags.page",
			Title: i18n.T(c, "admin.title.tags"),
			Data: web.Map{
				"tags": getAllTags.Result,
			},
		})
	}
}
