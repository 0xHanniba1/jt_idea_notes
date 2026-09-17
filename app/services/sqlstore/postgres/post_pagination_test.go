package postgres_test

import (
	"context"
	"strconv"
	"testing"

	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
)

func TestSearchPostsPagination(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	_, err := trx.Execute(`INSERT INTO posts (title, slug, number, description, created_at, tenant_id, user_id, status, is_approved, language)
 SELECT 'pagination record ' || n, 'pagination-record-' || n, n, 'pagination description', NOW(), 1, 1, 0, true, 'english' FROM generate_series(1,33) n`)
	if err != nil {
		t.Fatal(err)
	}
	for _, view := range []string{"recent", "most-discussed"} {
		seen := map[int]bool{}
		previousID := 0
		for page := 1; page <= 4; page++ {
			q := &query.SearchPosts{View: view, Paginate: true, Page: strconv.Itoa(page), Limit: "10"}
			if err := bus.Dispatch(demoTenantCtx, q); err != nil {
				t.Fatal(err)
			}
			want := 10
			if page == 4 {
				want = 3
			}
			if q.TotalCount != 33 || q.PageNumber != page || q.PageSize != 10 || len(q.Result) != want {
				t.Fatalf("incorrect page: %+v", q)
			}
			for _, post := range q.Result {
				if seen[post.ID] || (previousID != 0 && post.ID >= previousID) {
					t.Fatal("pages overlap or ties are unstable")
				}
				seen[post.ID] = true
				previousID = post.ID
			}
		}
		if len(seen) != 33 {
			t.Fatal("pagination omitted a post")
		}
	}
	for _, tc := range []struct {
		page, limit        string
		number, size, rows int
	}{
		{"999", "10", 4, 10, 3}, {"-1", "25", 1, 25, 25}, {"invalid", "50", 1, 50, 33},
		{"1", "100", 1, 100, 33}, {"1", "all", 1, 25, 25}, {"1", "0", 1, 25, 25},
		{"1", "11", 1, 25, 25}, {"1", "invalid", 1, 25, 25},
	} {
		q := &query.SearchPosts{Paginate: true, Page: tc.page, Limit: tc.limit}
		if err := bus.Dispatch(demoTenantCtx, q); err != nil {
			t.Fatal(err)
		}
		if q.TotalCount != 33 || q.PageNumber != tc.number || q.PageSize != tc.size || len(q.Result) != tc.rows {
			t.Fatalf("normalization failed: %+v", q)
		}
	}
	for _, term := range []string{"nonexistent", "!!!"} {
		q := &query.SearchPosts{Paginate: true, Page: "99", Limit: "10", Query: term}
		if err := bus.Dispatch(demoTenantCtx, q); err != nil {
			t.Fatal(err)
		}
		if q.TotalCount != 0 || q.PageNumber != 1 || q.PageSize != 10 || len(q.Result) != 0 {
			t.Fatalf("invalid empty page: %+v", q)
		}
	}
	legacy := &query.SearchPosts{Limit: "all"}
	if err := bus.Dispatch(demoTenantCtx, legacy); err != nil || len(legacy.Result) != 33 {
		t.Fatalf("legacy all query changed: %v", err)
	}
}

func TestSearchPostsPaginationVisibility(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	_, err := trx.Execute(`INSERT INTO posts (title, slug, number, description, created_at, tenant_id, user_id, status, is_approved, language) VALUES
 ('pagination approved','approved',1,'pagination',NOW(),1,1,0,true,'english'),
 ('pagination own pending','own-pending',2,'pagination',NOW(),1,1,0,false,'english'),
 ('pagination other pending','other-pending',3,'pagination',NOW(),1,2,0,false,'english'),
 ('pagination deleted','deleted',4,'pagination',NOW(),1,1,$1,true,'english'),
 ('pagination foreign','foreign',1,'pagination',NOW(),2,4,0,true,'english')`, enum.PostDeleted)
	if err != nil {
		t.Fatal(err)
	}
	visitor := *jonSnow
	visitor.Role = enum.RoleVisitor
	for _, tc := range []struct {
		ctx  context.Context
		want int
	}{
		{demoTenantCtx, 3}, {withUser(demoTenantCtx, &visitor), 3},
		{jonSnowCtx, 3}, {avengersTenantCtx, 1},
	} {
		for _, term := range []string{"", "pagination"} {
			q := &query.SearchPosts{Paginate: true, Page: "9", Limit: "10", Query: term}
			if err := bus.Dispatch(tc.ctx, q); err != nil {
				t.Fatal(err)
			}
			if q.TotalCount != tc.want || len(q.Result) != tc.want || q.PageNumber != 1 {
				t.Fatalf("count/page leaked hidden records: %+v", q)
			}
		}
	}
}
