package dbx_test

import (
	"context"
	"strings"
	"testing"

	"github.com/getfider/fider/app"
	"github.com/getfider/fider/app/models/cmd"
	"github.com/getfider/fider/app/pkg/bus"
	"github.com/getfider/fider/app/pkg/dbx"
	"github.com/getfider/fider/app/pkg/log"
)

func TestSensitiveSQLDoesNotLogArgumentsOrErrorDetails(t *testing.T) {
	oldLevel := log.CurrentLevel
	log.CurrentLevel = log.DEBUG
	defer func() { log.CurrentLevel = oldLevel }()
	logged := 0
	bus.AddListener(func(ctx context.Context, c *cmd.LogDebug) { logged++ })
	ctx := context.Background()
	tx, err := dbx.BeginTx(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.MustRollback()
	var plain int
	if err := tx.Scalar(&plain, "SELECT 1"); err != nil {
		t.Fatal(err)
	}
	if logged == 0 {
		t.Fatal("debug capture control did not observe ordinary SQL")
	}
	logged = 0
	secret := "credential-secret-must-never-appear"
	var scalar string
	if err := tx.ScalarSensitive(&scalar, "SELECT $1::text", secret); err != nil || scalar != secret {
		t.Fatal("sensitive scalar failed")
	}
	row := struct {
		Value string `db:"value"`
	}{}
	if err := tx.GetSensitive(&row, "SELECT $1::text AS value", secret); err != nil || row.Value != secret {
		t.Fatal("sensitive row mapping failed")
	}
	if _, err := tx.ExecuteSensitive("SELECT $1::text", secret); err != nil {
		t.Fatal(err)
	}
	if err := tx.GetSensitive(&row, "SELECT 'x' AS value WHERE false"); err != app.ErrNotFound {
		t.Fatal("missing row mapping changed")
	}
	if logged != 0 {
		t.Fatal("sensitive SQL emitted debug logs")
	}
	for _, method := range []string{"execute", "scalar", "get"} {
		failing, err := dbx.BeginTx(ctx)
		if err != nil {
			t.Fatal(err)
		}
		switch method {
		case "execute":
			_, err = failing.ExecuteSensitive("SELECT $1::int", secret)
		case "scalar":
			err = failing.ScalarSensitive(&plain, "SELECT $1::int", secret)
		case "get":
			err = failing.GetSensitive(&row, "SELECT $1::int AS value", secret)
		}
		failing.MustRollback()
		if err == nil {
			t.Fatal("expected database failure")
		}
		if strings.Contains(err.Error(), secret) || strings.Contains(err.Error(), "SELECT") || !strings.Contains(err.Error(), "SQLSTATE 22P02") {
			t.Fatal("sensitive error lost SQLSTATE or exposed SQL/arguments")
		}
	}
	if logged != 0 {
		t.Fatal("failed sensitive SQL emitted debug logs")
	}
}
