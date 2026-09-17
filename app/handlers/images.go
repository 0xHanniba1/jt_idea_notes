package handlers

import (
	"bytes"
	"fmt"
	"image/color"
	"image/png"
	"os"
	"strings"

	"github.com/getfider/fider/app/models/query"

	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/web"
	"github.com/goenning/imagic"
	"github.com/goenning/letteravatar"
)

// LetterAvatar returns a letter avatar picture based on given name
func LetterAvatar() web.HandlerFunc {
	return func(c *web.Context) error {
		id := c.Param("id")
		name := c.Param("name")
		if name == "" {
			name = "?"
		}

		size, err := c.QueryParamAsInt("size")
		if err != nil {
			return c.BadRequest(web.Map{})
		}
		size = between(size, 50, 200)

		img, err := letteravatar.Draw(size, strings.ToUpper(letteravatar.Extract(name)), &letteravatar.Options{
			PaletteKey: fmt.Sprintf("%s:%s", id, name),
		})
		if err != nil {
			return c.Failure(err)
		}

		buf := new(bytes.Buffer)
		err = png.Encode(buf, img)
		if err != nil {
			return c.Failure(err)
		}

		return c.Image("image/png", buf.Bytes())
	}
}

// Favicon returns the workspace favicon by given size
func Favicon() web.HandlerFunc {
	return func(c *web.Context) error {
		var (
			bytes       []byte
			err         error
			contentType string
		)

		bkey := c.Param("bkey")
		if bkey != "" {
			q := &query.GetBlobByKey{Key: bkey}
			err := bus.Dispatch(c, q)
			if err != nil {
				return c.Failure(err)
			}
			bytes = q.Result.Content
			contentType = q.Result.ContentType
		} else {
			bytes, err = os.ReadFile(env.Path("favicon.png"))
			contentType = "image/png"
			if err != nil {
				return c.Failure(err)
			}
		}

		size, err := c.QueryParamAsInt("size")
		if err != nil {
			return c.BadRequest(web.Map{})
		}

		size = between(size, 50, 200)

		opts := []imagic.ImageOperation{}
		if size > 0 {
			opts = append(opts, imagic.Padding(size*10/100))
			opts = append(opts, imagic.Resize(size))
		}

		if c.QueryParam("bg") != "" {
			opts = append(opts, imagic.ChangeBackground(color.White))
		}

		bytes, err = imagic.Apply(bytes, opts...)
		if err != nil {
			return c.Failure(err)
		}

		return c.Image(contentType, bytes)
	}
}

// ViewUploadedImage returns any uploaded image by given ID and size
func ViewUploadedImage() web.HandlerFunc {
	return func(c *web.Context) error {
		bkey := c.Param("bkey")

		size, err := c.QueryParamAsInt("size")
		if err != nil {
			return c.BadRequest(web.Map{})
		}

		size = between(size, 0, 2000)

		q := &query.GetBlobByKey{Key: bkey}
		err = bus.Dispatch(c, q)
		if err != nil {
			return c.Failure(err)
		}

		bytes := q.Result.Content
		if size > 0 {
			bytes, err = imagic.Apply(bytes, imagic.Resize(size))
			if err != nil {
				return c.Failure(err)
			}
		}

		return c.Image(q.Result.ContentType, bytes)
	}
}
