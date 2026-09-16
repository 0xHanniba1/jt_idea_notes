package web_test

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"testing"

	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/web"

	. "github.com/getfider/fider/app/pkg/assert"
)

func StartServer(t *testing.T) (string, func()) {
	t.Helper()
	// Reserve both addresses together so the web and metrics ports are distinct.
	webListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = webListener.Close() }()
	metricsListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = metricsListener.Close() }()
	webAddress := webListener.Addr().String()
	metricsAddress := metricsListener.Addr().String()
	metricsHost, metricsPort, err := net.SplitHostPort(metricsAddress)
	if err != nil {
		t.Fatal(err)
	}
	previousMetrics := env.Config.Metrics
	env.Config.Metrics.Enabled = true
	env.Config.Metrics.Host = metricsHost
	env.Config.Metrics.Port = metricsPort
	t.Cleanup(func() { env.Config.Metrics = previousMetrics })
	baseURL := "http://" + webAddress
	e := web.New()

	group := e.Group()
	{
		group.Get("/api/ping", func(c *web.Context) error {
			if c.Value("the-name") != nil {
				panic("key: the-name should not be set")
			}
			return c.String(http.StatusOK, "pong")
		})

		group.Use(func(next web.HandlerFunc) web.HandlerFunc {
			return func(c *web.Context) error {
				c.Set("the-name", c.QueryParam("name"))
				return next(c)
			}
		})

		group.Get("/api/echo", func(c *web.Context) error {
			return c.String(http.StatusOK, c.Value("the-name").(string))
		})
	}

	e.Get("/hello", func(c *web.Context) error {
		if c.Value("name") != nil {
			panic("ERROR!")
		}
		return c.String(http.StatusOK, "")
	})

	_ = webListener.Close()
	_ = metricsListener.Close()
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		e.Start(webAddress)
	}()
	var stopOnce sync.Once
	stop := func() {
		stopOnce.Do(func() {
			Expect(e.Stop()).IsNil()
			<-stopped
		})
	}
	t.Cleanup(stop)

	// Wait for this test's web and metrics listeners, closing readiness responses.
	for _, endpoint := range []string{baseURL + "/hello", "http://" + metricsAddress + "/metrics"} {
		Expect(func() error {
			response, err := http.Get(endpoint)
			if err != nil {
				return err
			}
			defer func() { _ = response.Body.Close() }()
			if response.StatusCode != http.StatusOK {
				return fmt.Errorf("%s returned status %d", endpoint, response.StatusCode)
			}
			return nil
		}).EventuallyEquals(nil)
	}
	return baseURL, stop
}

func TestEngine_StartRequestStop(t *testing.T) {
	RegisterT(t)
	baseURL, stopServer := StartServer(t)

	resp, err := http.Get(baseURL + "/hello")
	Expect(err).IsNil()
	Expect(resp.StatusCode).Equals(http.StatusOK)
	_ = resp.Body.Close()

	resp, err = http.Get(baseURL + "/world")
	Expect(err).IsNil()
	Expect(resp.StatusCode).Equals(http.StatusNotFound)
	_ = resp.Body.Close()

	stopServer()

	resp, err = http.Get(baseURL + "/hello")
	Expect(err).IsNotNil()
	Expect(resp).IsNil()
}

func TestEngine_MiddlewareAfterHandler(t *testing.T) {
	RegisterT(t)
	baseURL, stopServer := StartServer(t)

	resp, err := http.Get(baseURL + "/api/ping")
	Expect(err).IsNil()
	Expect(resp.StatusCode).Equals(http.StatusOK)
	_ = resp.Body.Close()

	resp, err = http.Get(baseURL + "/api/echo?name=John")
	Expect(err).IsNil()
	Expect(resp.StatusCode).Equals(http.StatusOK)
	content, err := io.ReadAll(resp.Body)
	Expect(err).IsNil()
	Expect(string(content)).Equals("John")
	_ = resp.Body.Close()

	stopServer()
}
