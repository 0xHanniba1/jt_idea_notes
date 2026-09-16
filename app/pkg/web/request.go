package web

import (
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/errors"
)

// Request wraps the http request object
type Request struct {
	instance      *http.Request
	Method        string
	ContentLength int64
	Body          string
	BodyError     error
	IsSecure      bool
	StartTime     time.Time
	URL           *url.URL
}

// WrapRequest returns Fider wrapper of HTTP Request
func WrapRequest(request *http.Request) Request {
	protocol := "http"
	if request.TLS != nil || (trustedProxy(request.RemoteAddr) && request.Header.Get("X-Forwarded-Proto") == "https") {
		protocol = "https"
	}

	host := request.Host
	if trustedProxy(request.RemoteAddr) && request.Header.Get("X-Forwarded-Host") != "" {
		host = request.Header.Get("X-Forwarded-Host")
	}

	// A proxy may send absolute-form RequestURI. Use its path/query, just as
	// the router does, so authentication body limits cannot be bypassed.
	requestPath := request.RequestURI
	if request.URL != nil {
		requestPath = request.URL.RequestURI()
	} else if parsed, err := url.Parse(requestPath); requestPath != "" && err == nil {
		requestPath = parsed.RequestURI()
	}
	fullURL := protocol + "://" + host + requestPath
	u, err := url.Parse(fullURL)
	if err != nil {
		panic(errors.Wrap(err, "Failed to parse url '%s'", fullURL))
	}

	var bodyBytes []byte
	var bodyError error
	if request.Body != nil {
		reader := io.Reader(request.Body)
		if IsPasswordRequest(u.Path) {
			reader = io.LimitReader(reader, 8193)
		}
		bodyBytes, bodyError = io.ReadAll(reader)
		if IsPasswordRequest(u.Path) && len(bodyBytes) > 8192 {
			bodyError = &http.MaxBytesError{Limit: 8192}
			bodyBytes = nil
		}
	}

	return Request{
		instance:      request,
		Method:        request.Method,
		ContentLength: request.ContentLength,
		Body:          string(bodyBytes),
		BodyError:     bodyError,
		URL:           u,
		IsSecure:      protocol == "https",
		StartTime:     time.Now(),
	}
}

// GetHeader returns the value of HTTP header from given key
func (r *Request) GetHeader(key string) string {
	return r.instance.Header.Get(key)
}

// SetHeader updates the value of HTTP header of given key
func (r *Request) SetHeader(key, value string) {
	r.instance.Header.Set(key, value)
}

// Cookie returns the named cookie provided in the request.
func (r *Request) Cookie(name string) (*http.Cookie, error) {
	cookie, err := r.instance.Cookie(name)
	if err != nil {
		return nil, errors.Wrap(err, "failed to get '%s' cookie", name)
	}
	return cookie, nil
}

// AddCookie adds a cookie
func (r *Request) AddCookie(cookie *http.Cookie) {
	r.instance.AddCookie(cookie)
}

// IsAPI returns true if its a request for an API resource
func (r *Request) IsAPI() bool {
	return strings.HasPrefix(r.URL.Path, "/api/")
}

var crawlerRegex = regexp.MustCompile("(?i)(baidu)|(msnbot)|(bingbot)|(bingpreview)|(duckduckbot)|(googlebot)|(adsbot-google)|(mediapartners-google)|(slurp)|(yandexbot)|(yandexmetrika)|(ahrefsbot)|(twitterbot)|(slackbot)|(discordbot)|(semrushBot)|(exabot)")

// IsCrawler returns true if the request is coming from a crawler
func (r *Request) IsCrawler() bool {
	return crawlerRegex.MatchString(r.GetHeader("User-Agent"))
}

// IsCustomDomain returns true if the request was made using a custom domain (CNAME)
func (r *Request) IsCustomDomain() bool {
	return !strings.HasSuffix(r.URL.Hostname(), env.Config.HostDomain)
}

// BaseURL returns base URL
func (r *Request) BaseURL() string {
	address := r.URL.Scheme + "://" + r.URL.Hostname()

	if r.URL.Port() != "" {
		address += ":" + r.URL.Port()
	}

	return address
}

// trustedProxy never trusts forwarded headers unless the peer is explicitly configured.
func trustedProxy(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	for _, raw := range strings.Split(env.Config.TrustedProxyCIDRs, ",") {
		_, network, err := net.ParseCIDR(strings.TrimSpace(raw))
		if err == nil && network.Contains(ip) {
			return true
		}
	}
	return false
}

func (r *Request) ClientIP() string {
	host, _, err := net.SplitHostPort(r.instance.RemoteAddr)
	if err != nil {
		host = r.instance.RemoteAddr
	}
	if trustedProxy(r.instance.RemoteAddr) {
		chain := strings.Split(r.GetHeader("X-Forwarded-For"), ",")
		for i := len(chain) - 1; i >= 0; i-- {
			candidate := strings.TrimSpace(chain[i])
			if net.ParseIP(candidate) == nil {
				break
			}
			host = candidate
			if !trustedProxy(candidate) {
				break
			}
		}
	}
	if net.ParseIP(host) == nil {
		return "unknown"
	}
	return host
}
