package middlewares_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/getfider/fider/app/middlewares"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/web"
)

func TestPasswordCSRFSourceAndJSONRequired(t *testing.T) {
	oldMode, oldURL := env.Config.HostMode, env.Config.BaseURL
	env.Config.HostMode = "single"
	env.Config.BaseURL = "https://notes.example.test"
	defer func() { env.Config.HostMode = oldMode; env.Config.BaseURL = oldURL }()
	cases := []struct {
		label, method, origin, referer, content string
		want                                    int
	}{
		{"same origin", "POST", "https://notes.example.test", "", "application/json", 204},
		{"referer fallback", "DELETE", "", "https://notes.example.test/admin", "application/json", 204},
		{"cross origin", "POST", "https://attacker.example.test", "", "application/json", 403},
		{"other port", "PATCH", "https://notes.example.test:8443", "", "application/json", 403},
		{"null origin", "POST", "null", "https://notes.example.test/admin", "application/json", 403},
		{"missing source", "POST", "", "", "application/json", 403},
		{"json accept alone", "POST", "https://notes.example.test", "", "text/plain", 403},
		{"origin contains path", "POST", "https://notes.example.test/other", "", "application/json", 403},
	}
	for _, test := range cases {
		t.Run(test.label, func(t *testing.T) {
			request := httptest.NewRequest(test.method, "https://notes.example.test/_api/auth/password/signin", strings.NewReader("{}"))
			request.Header.Set("Origin", test.origin)
			request.Header.Set("Referer", test.referer)
			request.Header.Set("Content-Type", test.content)
			request.Header.Set("Accept", "application/json")
			response := httptest.NewRecorder()
			c := web.NewContext(web.New(), request, response, nil)
			err := middlewares.CSRF()(func(c *web.Context) error { return c.NoContent(http.StatusNoContent) })(c)
			if err != nil || response.Code != test.want {
				t.Fatalf("got %d err=%v, want %d", response.Code, err, test.want)
			}
		})
	}
}
