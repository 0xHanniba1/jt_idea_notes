package entity_test

import (
	"encoding/json"
	"testing"

	"github.com/getfider/fider/app/models/entity"
)

func TestPostJSON_ExcludesVotingFields(t *testing.T) {
	encoded, err := json.Marshal(&entity.Post{ID: 1, Title: "A recorded idea", CommentsCount: 2})
	if err != nil {
		t.Fatal(err)
	}
	var post map[string]any
	if err := json.Unmarshal(encoded, &post); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"hasVoted", "votesCount"} {
		if _, exists := post[field]; exists {
			t.Errorf("retired field %q remains in post JSON", field)
		}
	}
	if post["commentsCount"] != float64(2) {
		t.Errorf("comment count missing from post JSON: %s", encoded)
	}
}
