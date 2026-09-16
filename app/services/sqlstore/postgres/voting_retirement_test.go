package postgres_test

import (
	"testing"
	"time"

	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/models/entity"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/models/query"
	. "github.com/getfider/fider/app/pkg/assert"
	"github.com/getfider/fider/app/pkg/bus"
)

// Historical votes are fixtures only; the application no longer exposes voting commands.
func seedHistoricalVote(post *entity.Post, user *entity.User) {
	_, err := trx.Execute("INSERT INTO post_votes (tenant_id, user_id, post_id, created_at) VALUES ($1, $2, $3, $4)", user.Tenant.ID, user.ID, post.ID, time.Now().Add(-time.Hour))
	Expect(err).IsNil()
}

func historicalVoteCount(post *entity.Post) int {
	var count int
	Expect(trx.Scalar(&count, "SELECT COUNT(*) FROM post_votes WHERE post_id = $1", post.ID)).IsNil()
	return count
}

func TestPostStorage_RetiredVotingDoesNotAffectOrdering(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	oldPost := &cmd.AddNewPost{Title: "An older popular idea"}
	newPost := &cmd.AddNewPost{Title: "A new idea without votes"}
	bus.MustDispatch(jonSnowCtx, oldPost, newPost)
	seedHistoricalVote(oldPost.Result, jonSnow)
	seedHistoricalVote(oldPost.Result, aryaStark)
	seedHistoricalVote(oldPost.Result, sansaStark)
	for _, view := range []string{"", "recent", "trending", "most-wanted", "my-votes", "unknown", "all"} {
		search := &query.SearchPosts{View: view}
		Expect(bus.Dispatch(aryaStarkCtx, search)).IsNil()
		Expect(search.Result).HasLen(2)
		Expect(search.Result[0].ID).Equals(newPost.Result.ID)
		Expect(search.Result[1].ID).Equals(oldPost.Result.ID)
	}
	bus.MustDispatch(jonSnowCtx, &cmd.AddNewComment{Post: oldPost.Result, Content: "Still worth discussing"})
	discussed := &query.SearchPosts{View: "most-discussed"}
	Expect(bus.Dispatch(aryaStarkCtx, discussed)).IsNil()
	Expect(discussed.Result[0].ID).Equals(oldPost.Result.ID)
	Expect(discussed.Result[0].CommentsCount).Equals(1)
	Expect(historicalVoteCount(oldPost.Result)).Equals(3)
	Expect(historicalVoteCount(newPost.Result)).Equals(0)
	subscribed := &query.UserSubscribedTo{PostID: newPost.Result.ID}
	Expect(bus.Dispatch(jonSnowCtx, subscribed)).IsNil()
	Expect(subscribed.Result).IsTrue()
}

func TestPostStorage_NewPostFollowsAuthorWithoutVoting(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	post := &cmd.AddNewPost{Title: "A record to follow"}
	Expect(bus.Dispatch(aryaStarkCtx, post)).IsNil()
	Expect(historicalVoteCount(post.Result)).Equals(0)
	subscribed := &query.UserSubscribedTo{PostID: post.Result.ID}
	Expect(bus.Dispatch(aryaStarkCtx, subscribed)).IsNil()
	Expect(subscribed.Result).IsTrue()
}

func TestPostStorage_AllViewKeepsClosedStatuses(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	open := &cmd.AddNewPost{Title: "Open record"}
	completed := &cmd.AddNewPost{Title: "Completed record"}
	declined := &cmd.AddNewPost{Title: "Declined record"}
	bus.MustDispatch(jonSnowCtx, open, completed, declined)
	bus.MustDispatch(jonSnowCtx,
		&cmd.SetPostResponse{Post: completed.Result, Status: enum.PostCompleted},
		&cmd.SetPostResponse{Post: declined.Result, Status: enum.PostDeclined},
	)
	all := &query.SearchPosts{View: "all"}
	recent := &query.SearchPosts{View: "recent"}
	Expect(bus.Dispatch(jonSnowCtx, all, recent)).IsNil()
	Expect(all.Result).HasLen(3)
	Expect(all.Result[0].ID).Equals(declined.Result.ID)
	Expect(all.Result[1].ID).Equals(completed.Result.ID)
	Expect(recent.Result).HasLen(1)
	Expect(recent.Result[0].ID).Equals(open.Result.ID)
}

func TestUserStorage_DeletionCleansHistoricalVotesOnlyForThatUser(t *testing.T) {
	SetupDatabaseTest(t)
	defer TeardownDatabaseTest()
	post := &cmd.AddNewPost{Title: "Historical record"}
	Expect(bus.Dispatch(jonSnowCtx, post)).IsNil()
	seedHistoricalVote(post.Result, jonSnow)
	seedHistoricalVote(post.Result, aryaStark)
	Expect(bus.Dispatch(aryaStarkCtx, &cmd.DeleteCurrentUser{})).IsNil()
	Expect(historicalVoteCount(post.Result)).Equals(1)
	var remainingUserID int
	Expect(trx.Scalar(&remainingUserID, "SELECT user_id FROM post_votes WHERE post_id = $1", post.Result.ID)).IsNil()
	Expect(remainingUserID).Equals(jonSnow.ID)
}
