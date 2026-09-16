package entity_test

import (
	"encoding/json"
	"testing"

	"github.com/getfider/fider/app/models/entity"
	. "github.com/getfider/fider/app/pkg/assert"
)

func TestUserWithEmail_MarshalJSON(t *testing.T) {

	RegisterT(t)
	user := entity.UserWithEmail{
		User: &entity.User{
			ID:                  1,
			Name:                "John Doe",
			Email:               "johndoe@example.com",
			Role:                1,
			Status:              1,
			Username:            "john.doe",
			PasswordInitialized: true,
			MustChangePassword:  true,
			SecurityStamp:       "must-not-be-serialized",
		},
	}

	expectedJSON := `{"id":1,"name":"John Doe","role":"visitor","status":"active","isTrusted":false,"email":"johndoe@example.com","username":"john.doe","passwordInitialized":true,"mustChangePassword":true}`

	jsonData, err := json.Marshal(user)
	if err != nil {
		t.Errorf("Failed to marshal user to JSON: %v", err)
	}

	Expect(string(jsonData)).Equals(expectedJSON)

}

func TestUser_MarshalJSON(t *testing.T) {

	RegisterT(t)
	user := entity.User{
		ID:                  1,
		Name:                "John Doe",
		Email:               "johndoe@example.com",
		Role:                1,
		Status:              1,
		Username:            "john.doe",
		PasswordInitialized: true,
		MustChangePassword:  true,
		SecurityStamp:       "must-not-be-serialized",
	}

	expectedJSON := `{"id":1,"name":"John Doe","role":"visitor","status":"active","isTrusted":false}`

	jsonData, err := json.Marshal(user)
	if err != nil {
		t.Errorf("Failed to marshal user to JSON: %v", err)
	}

	Expect(string(jsonData)).Equals(expectedJSON)

}

func TestPasswordCredential_MarshalJSON(t *testing.T) {
	credential := entity.PasswordCredential{
		User:               &entity.User{ID: 1, SecurityStamp: "must-not-be-serialized"},
		Username:           "john.doe",
		PasswordHash:       "$argon2id$must-not-be-serialized",
		MustChangePassword: true,
	}
	encoded, err := json.Marshal(credential)
	if err != nil {
		t.Fatal(err)
	}
	if string(encoded) != "{}" {
		t.Fatal("internal credential JSON exposed authentication state or secrets")
	}
}
