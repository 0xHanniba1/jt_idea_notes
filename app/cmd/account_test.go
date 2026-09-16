package cmd

import (
	"bytes"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/getfider/fider/app/models/enum"
	"github.com/getfider/fider/app/pkg/env"
	"github.com/getfider/fider/app/pkg/passwordauth"
)

type accountTestBackend struct {
	previews int
	writes   int
	fail     bool
	verified bool
}

func (b *accountTestBackend) preview(opts accountOptions) (*accountTarget, error) {
	b.previews++
	return &accountTarget{tenantName: "Demo", name: "Admin", role: enum.RoleAdministrator, username: opts.username}, nil
}
func (b *accountTestBackend) apply(_ accountOptions, hash string) error {
	b.writes++
	b.verified = passwordauth.Verify(hash, "temporary password for local test")
	if b.fail {
		return errors.New("sensitive storage failure")
	}
	return nil
}

type accountTestInput struct {
	tty       bool
	lines     []string
	passwords []string
	reads     int
}

func (i *accountTestInput) interactive() bool { return i.tty }
func (i *accountTestInput) line(_ string) (string, error) {
	i.reads++
	if len(i.lines) == 0 {
		return "", errors.New("no input")
	}
	value := i.lines[0]
	i.lines = i.lines[1:]
	return value, nil
}
func (i *accountTestInput) password(_ string) ([]byte, error) {
	i.reads++
	if len(i.passwords) == 0 {
		return nil, errors.New("no password")
	}
	value := i.passwords[0]
	i.passwords = i.passwords[1:]
	return []byte(value), nil
}

func TestAccountRejectsSecretArgumentsAndImpreciseTargets(t *testing.T) {
	for _, args := range [][]string{
		{}, {"bogus"}, {"initialize", "--tenant-id", "1", "--user-id", "2"},
		{"initialize", "--tenant-id", "0", "--user-id", "2", "--username", "admin"},
		{"reset-password", "--tenant-id", "1"},
		{"reset-password", "--tenant-id", "1", "--user-id", "2", "--password", "secret-never-echo"},
		{"bootstrap", "secret-never-echo"},
	} {
		var out bytes.Buffer
		backend := &accountTestBackend{}
		if runAccount(args, &accountTestInput{}, &out, backend) == 0 {
			t.Fatalf("unexpected success for argument count %d", len(args))
		}
		if backend.previews != 0 || backend.writes != 0 {
			t.Fatal("invalid options reached database")
		}
		if strings.Contains(out.String(), "secret-never-echo") {
			t.Fatal("argument leaked into error")
		}
	}
	opts, err := parseAccountOptions([]string{"initialize", "--tenant-id", "1", "--user-id", "2", "--username", " Admin.Name "})
	if err != nil || opts.username != "admin.name" {
		t.Fatal("username was not normalized")
	}
}

func TestAccountDryRunDoesNotReadPasswordsOrWrite(t *testing.T) {
	var out bytes.Buffer
	input := &accountTestInput{}
	backend := &accountTestBackend{}
	code := runAccount([]string{"initialize", "--tenant-id", "1", "--user-id", "2", "--username", "admin", "--dry-run"}, input, &out, backend)
	if code != 0 || backend.previews != 1 || backend.writes != 0 || input.reads != 0 {
		t.Fatalf("dry-run accessed write or input: code=%d reads=%d writes=%d", code, input.reads, backend.writes)
	}
	if !strings.Contains(out.String(), "Dry run complete") {
		t.Fatal("missing dry-run result")
	}
}

func TestAccountWriteRequiresTTY(t *testing.T) {
	var out bytes.Buffer
	backend := &accountTestBackend{}
	if runAccount([]string{"reset-password", "--tenant-id", "1", "--user-id", "2"}, &accountTestInput{}, &out, backend) == 0 {
		t.Fatal("non-TTY write accepted")
	}
	if backend.previews != 0 || backend.writes != 0 {
		t.Fatal("non-TTY write accessed database")
	}
}

func TestAccountSuccessFollowsCommitAndNeverPrintsSecrets(t *testing.T) {
	for _, fail := range []bool{false, true} {
		var out bytes.Buffer
		input := &accountTestInput{tty: true, lines: []string{"YES"}, passwords: []string{"temporary password for local test", "temporary password for local test"}}
		backend := &accountTestBackend{fail: fail}
		code := runAccount([]string{"reset-password", "--tenant-id", "1", "--user-id", "2"}, input, &out, backend)
		if backend.writes != 1 || !backend.verified {
			t.Fatal("write did not receive a valid password hash")
		}
		if (code == 0) == fail || strings.Contains(out.String(), "Account update committed.") == fail {
			t.Fatal("commit outcome not reflected in output")
		}
		for _, secret := range []string{"temporary password for local test", "sensitive storage failure", "$argon2id$"} {
			if strings.Contains(out.String(), secret) {
				t.Fatal("secret leaked into CLI output")
			}
		}
	}
}

func TestAccountMismatchAndCancellationNeverWrite(t *testing.T) {
	for _, input := range []*accountTestInput{
		{tty: true, lines: []string{"NO"}},
		{tty: true, lines: []string{"YES"}, passwords: []string{"temporary password for local test", "different temporary password"}},
	} {
		var out bytes.Buffer
		backend := &accountTestBackend{}
		if runAccount([]string{"reset-password", "--tenant-id", "1", "--user-id", "2"}, input, &out, backend) == 0 || backend.writes != 0 {
			t.Fatal("cancelled or mismatched password was written")
		}
	}
}

func TestAccountBootstrapRequiresSingleSiteAndExplicitConfirmation(t *testing.T) {
	previous := env.Config.HostMode
	defer func() { env.Config.HostMode = previous }()
	env.Config.HostMode = "multi"
	var out bytes.Buffer
	backend := &accountTestBackend{}
	if runAccount([]string{"bootstrap", "--dry-run"}, &accountTestInput{}, &out, backend) == 0 || backend.previews != 0 {
		t.Fatal("bootstrap accepted multi-site mode")
	}
	env.Config.HostMode = "single"
	out.Reset()
	input := &accountTestInput{tty: true, lines: []string{"Site", "Administrator", "admin", "NO"}}
	if runAccount([]string{"bootstrap"}, input, &out, backend) == 0 || backend.writes != 0 {
		t.Fatal("bootstrap without confirmation wrote data")
	}
}

func TestAccountDatabaseLabelDoesNotExposeCredentials(t *testing.T) {
	label := accountDatabaseLabel("postgres://secret-user:secret-password@localhost:15566/jt_idea_test?secret=hidden")
	if !strings.Contains(label, "jt_idea_test") || !strings.Contains(label, "15566") {
		t.Fatal("database target is not visible")
	}
	for _, secret := range []string{"secret-user", "secret-password", "hidden"} {
		if strings.Contains(label, secret) {
			t.Fatal("connection secret leaked")
		}
	}
}

type accountFailingOutput struct {
	calls  int
	failAt int
}

func (w *accountFailingOutput) Write(p []byte) (int, error) {
	w.calls++
	if w.calls >= w.failAt {
		return 0, io.ErrClosedPipe
	}
	return len(p), nil
}

func TestAccountOutputFailureStopsBeforeConfirmationOrWrite(t *testing.T) {
	previous := env.Config.HostMode
	defer func() { env.Config.HostMode = previous }()
	env.Config.HostMode = "single"
	for _, tc := range []struct {
		name      string
		args      []string
		lines     []string
		failAt    int
		wantReads int
	}{
		{name: "database target", args: []string{"reset-password", "--tenant-id", "1", "--user-id", "2"}, failAt: 1},
		{name: "account target", args: []string{"reset-password", "--tenant-id", "1", "--user-id", "2"}, failAt: 2},
		{name: "bootstrap target", args: []string{"bootstrap"}, failAt: 2},
		{name: "bootstrap details", args: []string{"bootstrap"}, lines: []string{"Site", "Administrator", "admin", "YES"}, failAt: 3, wantReads: 3},
		{name: "dry-run result", args: []string{"reset-password", "--tenant-id", "1", "--user-id", "2", "--dry-run"}, failAt: 3},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := &accountTestInput{tty: true, lines: tc.lines, passwords: []string{"temporary password for local test", "temporary password for local test"}}
			backend := &accountTestBackend{}
			code := runAccount(tc.args, input, &accountFailingOutput{failAt: tc.failAt}, backend)
			if code == 0 || backend.writes != 0 || input.reads != tc.wantReads {
				t.Fatalf("failed output proceeded: code=%d writes=%d reads=%d", code, backend.writes, input.reads)
			}
		})
	}
}

func TestAccountCommittedOutputFailureReturnsFailureWithoutRetry(t *testing.T) {
	input := &accountTestInput{tty: true, lines: []string{"YES"}, passwords: []string{"temporary password for local test", "temporary password for local test"}}
	backend := &accountTestBackend{}
	code := runAccount([]string{"reset-password", "--tenant-id", "1", "--user-id", "2"}, input, &accountFailingOutput{failAt: 3}, backend)
	if code == 0 || backend.writes != 1 || !backend.verified {
		t.Fatalf("commit output failure was hidden or retried: code=%d writes=%d", code, backend.writes)
	}
}

func TestAccountTTYDoesNotReadAfterPromptFailure(t *testing.T) {
	// No input file is supplied: a failed prompt must return before touching it.
	tty := &accountTTY{out: &accountFailingOutput{failAt: 1}}
	if _, err := tty.line("Confirm target: "); !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("line prompt failure was ignored: %v", err)
	}
	if _, err := tty.password("Password: "); !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("password prompt failure was ignored: %v", err)
	}
}
