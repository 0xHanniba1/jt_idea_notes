package postgres_test

import (
	"os"
	"strings"
	"testing"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	"github.com/getfider/fider/app/pkg/bus"
)

func TestInternalMembersPublishWithoutModeration(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	// Even a stale tenant setting must not put internal members' content in a queue.
	demoTenant.IsModerationEnabled = true
	member := *aryaStark
	member.Role = enum.RoleVisitor
	member.IsTrusted = false
	ctx := withUser(demoTenantCtx, &member)
	post := &cmd.AddNewPost{Title: "Internal member record", Description: "Visible immediately"}
	if err := bus.Dispatch(ctx, post); err != nil {
		t.Fatal(err)
	}
	if !post.Result.IsApproved {
		t.Fatal("new record still requires approval")
	}
	comment := &cmd.AddNewComment{Post: post.Result, Content: "Internal member comment"}
	if err := bus.Dispatch(ctx, comment); err != nil {
		t.Fatal(err)
	}
	if !comment.Result.IsApproved {
		t.Fatal("new comment still requires approval")
	}
	other := *jonSnow
	other.Role = enum.RoleVisitor
	getPost := &query.GetPostByID{PostID: post.Result.ID}
	getComments := &query.GetCommentsByPost{Post: post.Result}
	if err := bus.Dispatch(withUser(demoTenantCtx, &other), getPost, getComments); err != nil {
		t.Fatal(err)
	}
	if getPost.Result.ID != post.Result.ID || len(getComments.Result) != 1 {
		t.Fatal("content not visible to another member")
	}
}

func TestRetireModerationMigrationPreservesContentAndAccess(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	if _, err := trx.Execute(`UPDATE tenants SET is_moderation_enabled = true WHERE id = 1;
 UPDATE users SET is_trusted = true, status = 3 WHERE id = 2;
 INSERT INTO posts (title, slug, number, description, created_at, tenant_id, user_id, status, is_approved, language)
 VALUES ('Pending record','pending-record',1,'Retained',NOW(),1,1,0,false,'english'),
 ('Deleted record','deleted-record',2,'Retained deletion',NOW(),1,1,6,false,'english')`); err != nil {
		t.Fatal(err)
	}
	var postID int
	if err := trx.Scalar(&postID, "SELECT id FROM posts WHERE tenant_id = 1 AND number = 1"); err != nil {
		t.Fatal(err)
	}
	if _, err := trx.Execute(`INSERT INTO comments (tenant_id, post_id, content, user_id, created_at, is_approved, deleted_at)
 VALUES (1,$1,'Pending comment',1,NOW(),false,NULL), (1,$1,'Deleted comment',1,NOW(),false,NOW())`, postID); err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile("../../../../migrations/202609171800_retire_content_moderation.sql")
	if err != nil {
		t.Fatal(err)
	}
	// dbx.Execute flattens newlines at DEBUG level; omit line comments as its
	// formatter would otherwise turn the entire migration into one comment.
	statements := []string{}
	for _, line := range strings.Split(string(migration), "\n") {
		if !strings.HasPrefix(strings.TrimSpace(line), "--") {
			statements = append(statements, line)
		}
	}
	for i := 0; i < 2; i++ { // Forward migration remains safe to replay.
		if _, err = trx.Execute(strings.Join(statements, "\n")); err != nil {
			t.Fatal(err)
		}
	}
	var count int
	for _, statement := range []string{
		"SELECT count(*) FROM tenants WHERE id = 1 AND is_moderation_enabled = false",
		"SELECT count(*) FROM posts WHERE tenant_id = 1 AND status = 6 AND is_approved = true",
		"SELECT count(*) FROM comments WHERE tenant_id = 1 AND deleted_at IS NOT NULL AND is_approved = true",
		"SELECT count(*) FROM users WHERE id = 2 AND is_trusted = true AND status = 3",
	} {
		if err := trx.Scalar(&count, statement); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("migration changed unrelated access/deletion state: %s", statement)
		}
	}
	other := *aryaStark
	other.Role = enum.RoleVisitor
	visible := &query.SearchPosts{Limit: "all"}
	comments := &query.GetCommentsByPost{Post: &entity.Post{ID: postID}}
	if err := bus.Dispatch(withUser(demoTenantCtx, &other), visible, comments); err != nil {
		t.Fatal(err)
	}
	if len(visible.Result) != 1 || len(comments.Result) != 1 {
		t.Fatal("pending content hidden or deleted content restored")
	}
}
