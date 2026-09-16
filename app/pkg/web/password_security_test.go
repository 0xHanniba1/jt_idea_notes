package web

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/worker"
)

type passwordBodyCounter struct {
	reader io.Reader
	bytes  int
}

func (r *passwordBodyCounter) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	r.bytes += n
	return n, err
}

type passwordBrokenBody struct{}

func (passwordBrokenBody) Read([]byte) (int, error) { return 0, errors.New("body transport failed") }

func TestPasswordRequestBodyLimitBeforeHandler(t *testing.T) {
	for _, test := range []struct {
		name, path                         string
		size                               int
		chunked, missingRoute, absoluteURI bool
	}{
		{name: "exact limit", path: "/_api/auth/password/signin", size: 8192},
		{name: "known length overflow", path: "/_api/auth/password/signin", size: 8193},
		{name: "chunked overflow", path: "/_api/auth/password/signin", size: 16384, chunked: true},
		{name: "absolute URI overflow", path: "/_api/auth/password/signin", size: 8193, absoluteURI: true},
		{name: "absolute URI chunked overflow", path: "/_api/auth/password/signin", size: 16384, chunked: true, absoluteURI: true},
		{name: "chunked exact limit", path: "/_api/auth/password/change", size: 8192, chunked: true},
		{name: "admin create overflow", path: "/_api/admin/accounts", size: 8193},
		{name: "restore overflow", path: "/_api/admin/users/42/block", size: 8193, chunked: true},
		{name: "unknown auth route overflow", path: "/_api/auth/unknown", size: 8193, chunked: true, missingRoute: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			engine := New()
			called := false
			handler := func(c *Context) error {
				called = true
				if len(c.Request.Body) != test.size {
					t.Error("allowed body was truncated")
				}
				return c.Ok(Map{})
			}
			if test.missingRoute {
				engine.NotFound(handler)
			} else {
				engine.Post(test.path, handler)
			}
			counter := &passwordBodyCounter{reader: strings.NewReader(strings.Repeat("a", test.size))}
			target := test.path
			if test.absoluteURI {
				target = "http://password.test" + target
			}
			request := httptest.NewRequest(http.MethodPost, target, nil)
			request.Host = "password.test"
			request.Body = io.NopCloser(counter)
			request.ContentLength = int64(test.size)
			if test.chunked {
				request.ContentLength = -1
				request.TransferEncoding = []string{"chunked"}
			}
			response := httptest.NewRecorder()
			engine.mux.ServeHTTP(response, request)
			if test.size > 8192 {
				if response.Code != http.StatusRequestEntityTooLarge || called {
					t.Fatalf("oversized sensitive request reached handler or wrong status: %d", response.Code)
				}
				if counter.bytes > 8193 {
					t.Fatalf("oversized body read beyond bounded limit: %d", counter.bytes)
				}
			} else if response.Code != http.StatusOK || !called {
				t.Fatalf("body at limit was rejected: %d", response.Code)
			}
		})
	}
}

func TestPasswordRequestBodyReadFailureIsRejected(t *testing.T) {
	engine := New()
	called := false
	engine.Post("/_api/auth/password/signin", func(c *Context) error { called = true; return c.Ok(Map{}) })
	request := httptest.NewRequest(http.MethodPost, "http://password.test/_api/auth/password/signin", nil)
	request.Body = io.NopCloser(passwordBrokenBody{})
	response := httptest.NewRecorder()
	engine.mux.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || called {
		t.Fatal("body transport error reached sensitive handler")
	}
}

func TestPasswordRequestForwardedHeadersRequireTrustedPeer(t *testing.T) {
	previous := env.Config.TrustedProxyCIDRs
	defer func() { env.Config.TrustedProxyCIDRs = previous }()
	env.Config.TrustedProxyCIDRs = "10.0.0.0/8, 2001:db8:1::/48"
	for _, test := range []struct {
		name, peer, forwarded, wantIP string
		trusted                       bool
	}{
		{"untrusted peer", "198.51.100.42:8123", "203.0.113.7", "198.51.100.42", false},
		{"trusted direct proxy", "10.0.0.2:8123", "203.0.113.7", "203.0.113.7", true},
		{"trusted proxy chain", "10.0.0.2:8123", "203.0.113.7, 10.2.0.3", "203.0.113.7", true},
		{"stop at nearest untrusted hop", "10.0.0.2:8123", "203.0.113.99, 198.51.100.7, 10.2.0.3", "198.51.100.7", true},
		{"IPv6 trusted peer", "[2001:db8:1::2]:8123", "2001:db8:2::3", "2001:db8:2::3", true},
		{"invalid forwarded chain", "10.0.0.2:8123", "203.0.113.7, invalid", "10.0.0.2", true},
		{"missing forwarded chain", "10.0.0.2:8123", "", "10.0.0.2", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "http://internal.test/path?q=1", nil)
			request.RemoteAddr = test.peer
			request.Header.Set("X-Forwarded-For", test.forwarded)
			request.Header.Set("X-Forwarded-Host", "public.test")
			request.Header.Set("X-Forwarded-Proto", "https")
			wrapped := WrapRequest(request)
			if wrapped.ClientIP() != test.wantIP {
				t.Fatalf("client IP %q, expected %q", wrapped.ClientIP(), test.wantIP)
			}
			if wrapped.IsSecure != test.trusted {
				t.Fatal("forwarded protocol trust differs from peer trust")
			}
			host := "internal.test"
			if test.trusted {
				host = "public.test"
			}
			if wrapped.URL.Host != host {
				t.Fatal("forwarded host trust differs from peer trust")
			}
		})
	}
	env.Config.TrustedProxyCIDRs = ""
	request := httptest.NewRequest(http.MethodGet, "http://internal.test/", nil)
	request.RemoteAddr = "10.0.0.2:8123"
	request.Header.Set("X-Forwarded-For", "203.0.113.7")
	request.Header.Set("X-Forwarded-Proto", "https")
	wrapped := WrapRequest(request)
	if wrapped.IsSecure || wrapped.ClientIP() != "10.0.0.2" {
		t.Fatal("forwarded headers were trusted without an explicit proxy CIDR")
	}
}

func TestPasswordContextCommitQueuesTasksExactlyOnce(t *testing.T) {
	engine := New()
	request := httptest.NewRequest(http.MethodPost, "http://password.test/_api/auth/password/change", nil)
	ctx := NewContext(engine, request, httptest.NewRecorder(), nil)
	ctx.Enqueue(worker.Task{Name: "first"})
	ctx.Enqueue(worker.Task{Name: "second"})
	if engine.Worker().Length() != 0 {
		t.Fatal("tasks ran before commit")
	}
	if err := ctx.Commit(); err != nil {
		t.Fatal(err)
	}
	if !ctx.TransactionFinished() || engine.Worker().Length() != 2 {
		t.Fatal("commit did not dispatch both queued tasks")
	}
	if err := ctx.Commit(); err != nil {
		t.Fatal(err)
	}
	ctx.Rollback()
	if engine.Worker().Length() != 2 {
		t.Fatal("repeated completion dispatched duplicate tasks")
	}
}

func TestPasswordContextCommitAfterRollbackDoesNotQueueTasks(t *testing.T) {
	engine := New()
	request := httptest.NewRequest(http.MethodPost, "http://password.test/_api/auth/password/change", nil)
	ctx := NewContext(engine, request, httptest.NewRecorder(), nil)
	ctx.Enqueue(worker.Task{Name: "must-not-run"})
	ctx.Rollback()
	if err := ctx.Commit(); err == nil {
		t.Fatal("commit succeeded after rollback")
	}
	if err := ctx.Commit(); err == nil {
		t.Fatal("repeated commit succeeded after rollback")
	}
	if !ctx.TransactionFinished() || engine.Worker().Length() != 0 {
		t.Fatal("failed commit dispatched a task")
	}
}
