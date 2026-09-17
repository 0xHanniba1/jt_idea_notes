package handlers

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/getfider/fider/app/models/query"

	"github.com/getfider/fider/app/models/dto"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/dbx"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/log"
	"github.com/getfider/fider/app/pkg/web"
)

// Health always returns OK
func Health() web.HandlerFunc {
	return func(c *web.Context) error {
		err := dbx.Ping()
		if err != nil {
			return c.Failure(err)
		}
		return c.Ok(web.Map{"status": "Healthy"})
	}
}

// LegalPage returns a legal page with content from a file
func LegalPage(title, file string) web.HandlerFunc {
	return func(c *web.Context) error {
		bytes, err := os.ReadFile(env.Etc(file))
		if err != nil {
			return c.NotFound()
		}

		return c.Page(http.StatusOK, web.Props{
			Page:  "Legal/Legal.page",
			Title: title,
			Data: web.Map{
				"content": string(bytes),
			},
		})
	}
}

// Sitemap returns the sitemap.xml of current site
func Sitemap() web.HandlerFunc {
	return func(c *web.Context) error {
		if c.Tenant().IsPrivate {
			return c.NotFound()
		}

		allPosts := &query.GetAllPosts{}
		if err := bus.Dispatch(c, allPosts); err != nil {
			return c.Failure(err)
		}

		baseURL := c.BaseURL()
		text := strings.Builder{}
		text.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
		text.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
		_, _ = fmt.Fprintf(&text, "<url> <loc>%s</loc> </url>", baseURL)
		for _, post := range allPosts.Result {
			_, _ = fmt.Fprintf(&text, "<url> <loc>%s/posts/%d/%s</loc> </url>", baseURL, post.Number, post.Slug)
		}
		text.WriteString(`</urlset>`)

		c.Response.Header().Del("Content-Security-Policy")
		return c.XML(http.StatusOK, text.String())
	}
}

// RobotsTXT return content of robots.txt file
func RobotsTXT() web.HandlerFunc {
	return func(c *web.Context) error {
		bytes, err := os.ReadFile(env.Path("./robots.txt"))
		if err != nil {
			return c.NotFound()
		}
		sitemapURL := c.BaseURL() + "/sitemap.xml"
		content := fmt.Sprintf("%s\nSitemap: %s", bytes, sitemapURL)
		return c.String(http.StatusOK, content)
	}
}

// Page returns a page without properties
func Page(title, description, page string) web.HandlerFunc {
	return func(c *web.Context) error {
		return c.Page(http.StatusOK, web.Props{
			Page:        page,
			Title:       title,
			Description: description,
		})
	}
}

// NewLogError is the input model for UI errors
type NewLogError struct {
	Message string `json:"message"`
	Data    any    `json:"data"`
}

// LogError logs an error coming from the UI
func LogError() web.HandlerFunc {
	return func(c *web.Context) error {
		action := new(NewLogError)
		err := c.Bind(action)
		if err != nil {
			return c.Failure(err)
		}
		log.Warnf(c, action.Message, dto.Props{
			"Data": action.Data,
		})
		return c.Ok(web.Map{})
	}
}

func between(n, min, max int) int {
	if n > max {
		return max
	} else if n < min {
		return min
	}
	return n
}
