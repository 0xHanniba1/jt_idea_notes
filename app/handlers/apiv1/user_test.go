package apiv1_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/getfider/fider/app/handlers/apiv1"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/query"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/mock"
)

func TestListUsersHandler(t *testing.T) {
	RegisterT(t)

	bus.AddHandler(func(ctx context.Context, q *query.SearchUsers) error {
		q.Result = []*entity.User{
			{ID: 1, Name: "User 1"},
			{ID: 2, Name: "User 2"},
		}
		q.TotalCount = 2
		return nil
	})

	server := mock.NewServer()

	status, query := server.
		AsUser(mock.JonSnow).
		ExecuteAsJSON(apiv1.ListUsers())

	Expect(status).Equals(http.StatusOK)
	Expect(query.IsArray()).IsFalse() // Should be an object, not an array
	Expect(query.Int32("totalCount")).Equals(2)
	Expect(query.Contains("users")).IsTrue()
}
