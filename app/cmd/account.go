package cmd

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/charmbracelet/x/term"
	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/passwordauth"
)

type accountOptions struct {
	operation string
	tenantID  int
	userID    int
	username  string
	name      string
	siteName  string
	dryRun    bool
}

type accountTarget struct {
	tenantName string
	name       string
	username   string
	role       enum.Role
}

type accountBackend interface {
	preview(accountOptions) (*accountTarget, error)
	apply(accountOptions, string) error
}

type accountInput interface {
	interactive() bool
	line(string) (string, error)
	password(string) ([]byte, error)
}

// RunAccount handles local account recovery only. It never starts the web server.
func RunAccount(args []string) int {
	return runAccount(args, &accountTTY{in: os.Stdin, out: os.Stderr}, os.Stdout, accountDatabase{})
}

func parseAccountOptions(args []string) (accountOptions, error) {
	opts := accountOptions{}
	if len(args) == 0 {
		return opts, errors.New("use account initialize, reset-password, or bootstrap; add --dry-run for a read-only preview")
	}
	opts.operation = args[0]
	fs := flag.NewFlagSet("account", flag.ContinueOnError)
	// flag errors may contain raw arguments. Never echo unknown arguments, which
	// may be an operator accidentally supplying a password on the command line.
	fs.SetOutput(io.Discard)
	fs.BoolVar(&opts.dryRun, "dry-run", false, "preview without writing")
	switch opts.operation {
	case "initialize":
		fs.IntVar(&opts.tenantID, "tenant-id", 0, "exact tenant ID")
		fs.IntVar(&opts.userID, "user-id", 0, "exact existing user ID")
		fs.StringVar(&opts.username, "username", "", "login name")
	case "reset-password":
		fs.IntVar(&opts.tenantID, "tenant-id", 0, "exact tenant ID")
		fs.IntVar(&opts.userID, "user-id", 0, "exact existing administrator ID")
	case "bootstrap":
	default:
		return opts, errors.New("unknown account operation")
	}
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 {
		return opts, errors.New("invalid account options; passwords must only be entered at the hidden terminal prompt")
	}
	if opts.operation != "bootstrap" && (opts.tenantID <= 0 || opts.userID <= 0) {
		return opts, errors.New("positive --tenant-id and --user-id are required")
	}
	if opts.operation == "initialize" {
		opts.username = passwordauth.NormalizeUsername(opts.username)
		if err := passwordauth.ValidateUsername(opts.username); err != nil {
			return opts, err
		}
	}
	return opts, nil
}

func runAccount(args []string, input accountInput, output io.Writer, backend accountBackend) int {
	opts, err := parseAccountOptions(args)
	if err != nil {
		_, _ = fmt.Fprintln(output, "Account command failed:", err)
		return 1
	}
	if opts.operation == "bootstrap" && !env.IsSingleHostMode() {
		_, _ = fmt.Fprintln(output, "Account command failed: bootstrap requires single-site mode")
		return 1
	}
	if !opts.dryRun && !input.interactive() {
		_, _ = fmt.Fprintln(output, "Account command failed: an interactive terminal is required; use --dry-run for a read-only preview")
		return 1
	}
	if _, err := fmt.Fprintln(output, "Database:", accountDatabaseLabel(env.Config.Database.URL)); err != nil {
		return 1
	}
	target, err := backend.preview(opts)
	if err != nil {
		_, _ = fmt.Fprintln(output, "Account command failed:", err)
		return 1
	}
	if opts.operation == "bootstrap" {
		_, err = fmt.Fprintln(output, "Target: empty single-site installation; create its first administrator")
	} else {
		_, err = fmt.Fprintf(output, "Target: tenant=%d (%q), user=%d (%q), role=%s, username=%q\n", opts.tenantID, target.tenantName, opts.userID, target.name, target.role, target.username)
	}
	if err != nil {
		return 1
	}
	if opts.dryRun {
		if _, err := fmt.Fprintln(output, "Dry run complete. No account, credential, or session was changed."); err != nil {
			return 1
		}
		return 0
	}
	if opts.operation == "bootstrap" {
		opts.siteName, err = input.line("Site name: ")
		if err == nil {
			opts.name, err = input.line("Administrator display name: ")
		}
		if err == nil {
			opts.username, err = input.line("Administrator username: ")
		}
		if err == nil {
			opts.siteName, opts.name = strings.TrimSpace(opts.siteName), strings.TrimSpace(opts.name)
			opts.username = passwordauth.NormalizeUsername(opts.username)
			if opts.siteName == "" || len(opts.siteName) > 100 || opts.name == "" || len(opts.name) > 100 {
				err = errors.New("site and display names are required and must not exceed 100 bytes")
			} else {
				err = passwordauth.ValidateUsername(opts.username)
			}
		}
		if err != nil {
			_, _ = fmt.Fprintln(output, "Account command failed: invalid administrator or site details")
			return 1
		}
		if _, err := fmt.Fprintf(output, "New site=%q, administrator=%q, username=%q\n", opts.siteName, opts.name, opts.username); err != nil {
			return 1
		}
	}
	confirmation, err := input.line("Type YES to change this account: ")
	if err != nil || confirmation != "YES" {
		_, _ = fmt.Fprintln(output, "Cancelled. No account was changed.")
		return 1
	}
	password, err := input.password("Temporary password (hidden): ")
	if err != nil {
		clear(password)
		_, _ = fmt.Fprintln(output, "Account command failed: could not read the password from the terminal")
		return 1
	}
	defer clear(password)
	confirmationPassword, err := input.password("Confirm temporary password (hidden): ")
	if err != nil {
		clear(confirmationPassword)
		_, _ = fmt.Fprintln(output, "Account command failed: could not read the confirmation from the terminal")
		return 1
	}
	defer clear(confirmationPassword)
	if !bytes.Equal(password, confirmationPassword) {
		_, _ = fmt.Fprintln(output, "Account command failed: passwords do not match")
		return 1
	}
	if err := passwordauth.ValidatePassword(string(password)); err != nil {
		_, _ = fmt.Fprintln(output, "Account command failed:", err)
		return 1
	}
	// Hash before the write transaction so no row lock is held while reading
	// secrets or performing the slow password derivation.
	hash, err := passwordauth.Hash(string(password))
	clear(password)
	clear(confirmationPassword)
	if err != nil {
		_, _ = fmt.Fprintln(output, "Account command failed: password hashing failed")
		return 1
	}
	if err := backend.apply(opts, hash); err != nil {
		// Do not print arbitrary storage errors: database details may contain
		// credential material. The transaction has already been rolled back.
		_, _ = fmt.Fprintln(output, "Account command failed: update or commit failed; no success was confirmed")
		return 1
	}
	if _, err := fmt.Fprintln(output, "Account update committed. The user must change the temporary password at next sign-in."); err != nil {
		return 1
	}
	return 0
}

func accountDatabaseLabel(connection string) string {
	u, err := url.Parse(connection)
	if err != nil || u.Hostname() == "" || u.Path == "" {
		return "configured database (connection details hidden)"
	}
	return fmt.Sprintf("host=%q port=%q database=%q", u.Hostname(), u.Port(), strings.TrimPrefix(u.Path, "/"))
}

type accountTTY struct {
	in  *os.File
	out io.Writer
}

func (t *accountTTY) interactive() bool { return term.IsTerminal(t.in.Fd()) }

func (t *accountTTY) line(prompt string) (string, error) {
	if _, err := fmt.Fprint(t.out, prompt); err != nil {
		return "", err
	}
	var line []byte
	b := make([]byte, 1)
	for len(line) <= 1024 {
		if _, err := t.in.Read(b); err != nil {
			return "", err
		}
		if b[0] == '\n' {
			return strings.TrimSuffix(string(line), "\r"), nil
		}
		line = append(line, b[0])
	}
	return "", errors.New("terminal input is too long")
}

func (t *accountTTY) password(prompt string) ([]byte, error) {
	if _, err := fmt.Fprint(t.out, prompt); err != nil {
		return nil, err
	}
	state, err := term.GetState(t.in.Fd())
	if err != nil {
		return nil, err
	}
	interrupts := make(chan os.Signal, 1)
	done := make(chan struct{})
	signal.Notify(interrupts, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(interrupts)
	defer close(done)
	go func() {
		select {
		case <-interrupts:
			_ = term.Restore(t.in.Fd(), state)
			_, _ = fmt.Fprintln(t.out, "\nCancelled. No account was changed.")
			os.Exit(1)
		case <-done:
		}
	}()
	value, err := term.ReadPassword(t.in.Fd())
	if _, outputErr := fmt.Fprintln(t.out); outputErr != nil {
		clear(value)
		return nil, outputErr
	}
	return value, err
}
