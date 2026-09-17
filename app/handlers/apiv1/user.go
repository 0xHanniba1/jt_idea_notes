package apiv1

import (
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/web"
)

// ListUsers returns paginated registered users
func ListUsers() web.HandlerFunc {
	return func(c *web.Context) error {
		status := c.QueryParam("status")
		if status != "" && status != "all" && status != "active" && status != "inactive" {
			return c.BadRequest(web.Map{})
		}
		page, _ := c.QueryParamAsInt("page")
		if page <= 0 {
			page = 1
		}

		limit, _ := c.QueryParamAsInt("limit")
		if limit <= 0 {
			limit = 10
		}

		searchUsers := &query.SearchUsers{
			Status: status,
			Query:  c.QueryParam("query"),
			Roles:  c.QueryParamAsArray("roles"),
			Page:   page,
			Limit:  limit,
		}

		if err := bus.Dispatch(c, searchUsers); err != nil {
			return c.Failure(err)
		}

		// Create an array of UserWithAccount structs to include account details in JSON response
		accounts := make([]entity.UserWithAccount, len(searchUsers.Result))
		for i, user := range searchUsers.Result {
			accounts[i] = entity.UserWithAccount{
				User: user,
			}
		}

		totalPages := (searchUsers.TotalCount + limit - 1) / limit

		return c.Ok(web.Map{
			"users":      accounts,
			"totalCount": searchUsers.TotalCount,
			"totalPages": totalPages,
			"page":       page,
			"limit":      limit,
		})
	}
}

func ListTaggableUsers() web.HandlerFunc {
	return func(c *web.Context) error {
		allUsers := &query.GetAllUsersNames{}
		if err := bus.Dispatch(c, allUsers); err != nil {
			return c.Failure(err)
		}
		return c.Ok(allUsers.Result)
	}
}
