"""Exercise CI decisions against disposable Git histories, without app services."""

import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import ci_checks


SCRIPT = str(Path(ci_checks.__file__).resolve())


class ChangesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.name", "CI Fixture")
        self.git("config", "user.email", "ci-fixture@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.write("README.md", "# Fixture\n")
        self.write("app/main.go", "package main\n")
        self.write("docs/guide.md", "# Guide\n")
        self.base = self.commit()

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, stderr=subprocess.PIPE).decode().strip()

    def write(self, path, content):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def commit(self):
        self.git("add", "--all")
        self.git("commit", "-qm", "Test fixture")
        return self.git("rev-parse", "HEAD")

    def run_check(self, event=None, event_name="push", base=None):
        # Do not inherit a hosting workflow's outputs or metadata into fixtures.
        env = {key: value for key, value in os.environ.items() if not key.startswith("GITHUB_")}
        with tempfile.TemporaryDirectory() as metadata:
            event_file = Path(metadata) / "event.json"
            output_file = Path(metadata) / "output"
            event_file.write_text(json.dumps(event or {}))
            env.update(GITHUB_EVENT_NAME=event_name, GITHUB_EVENT_PATH=str(event_file),
                       GITHUB_OUTPUT=str(output_file), GITHUB_SHA=self.git("rev-parse", "HEAD"))
            args = ["python3", "-B", SCRIPT, "changes"]
            if base:
                args.extend(["--base", base])
            process = subprocess.run(args, cwd=self.root, env=env, capture_output=True, text=True)
            output = output_file.read_text() if output_file.exists() else ""
        return process, output

    def assert_scope(self, scope, **kwargs):
        process, output = self.run_check(**kwargs)
        self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
        self.assertEqual(output, f"scope={scope}\n")

    def test_document_add_modify_delete(self):
        self.write("docs/new.md", "[Guide](guide.md)\n")
        self.write("README.md", "[Guide](docs/guide.md)\n")
        self.commit()
        self.assert_scope("docs", base=self.base)
        base = self.git("rev-parse", "HEAD")
        (self.root / "docs/new.md").unlink()
        self.commit()
        self.assert_scope("docs", base=base)

    def test_non_allowlisted_changes_require_full_ci(self):
        for path in ["app/new.go", "public/new.tsx", "package-lock.json", "go.mod",
                     "migrations/new.sql", "Dockerfile", ".github/workflows/build.yml",
                     "scripts/ci_checks.py", "etc/privacy.md", "etc/terms.md", "WARP.md",
                     "locale/README.md", "unknown.md"]:
            with self.subTest(path=path):
                base = self.git("rev-parse", "HEAD")
                self.write(path, "fixture\n")
                self.commit()
                self.assert_scope("full", base=base)

    def test_mixed_docs_and_code(self):
        self.write("README.md", "Updated documentation\n")
        self.write("app/new.go", "package main\n")
        self.commit()
        self.assert_scope("full", base=self.base)

    def test_rename_checks_both_paths(self):
        self.git("mv", "app/main.go", "docs/code.md")
        self.commit()
        self.assert_scope("full", base=self.base)
        base = self.git("rev-parse", "HEAD")
        self.git("mv", "docs/code.md", "app/main.go")
        self.commit()
        self.assert_scope("full", base=base)

    def test_symlink_and_executable_docs_require_full_ci(self):
        (self.root / "docs/link.md").symlink_to("../README.md")
        self.commit()
        self.assert_scope("full", base=self.base)
        base = self.git("rev-parse", "HEAD")
        self.git("update-index", "--chmod=+x", "README.md")
        self.git("commit", "-qm", "Executable document")
        self.assert_scope("full", base=base)

    def test_more_than_300_files_are_classified(self):
        for number in range(305):
            self.write(f"docs/{number}.md", "Fixture\n")
        self.write("z-runtime.go", "package main\n")
        self.commit()
        self.assert_scope("full", base=self.base)

    def test_push_checks_all_commits(self):
        self.write("app/new.go", "package main\n")
        self.commit()
        self.write("README.md", "Documentation in second commit\n")
        head = self.commit()
        self.assert_scope("full", event={"before": self.base, "after": head})

    def test_docs_push(self):
        self.write("docs/guide.md", "Updated guide\n")
        head = self.commit()
        self.assert_scope("docs", event={"before": self.base, "after": head})

    def test_pr_uses_merge_checkout_and_base(self):
        self.git("checkout", "-qb", "feature")
        self.write("README.md", "Feature documentation\n")
        self.commit()
        self.git("checkout", "-q", "main")
        self.write("app/new.go", "package main\n")
        base = self.commit()
        self.git("merge", "--no-ff", "-qm", "PR merge", "feature")
        self.assert_scope("docs", event_name="pull_request", event={"pull_request": {"base": {"sha": base}}})

    def test_unknown_empty_or_invalid_ranges_require_full_ci(self):
        self.write("README.md", "Updated documentation\n")
        head = self.commit()
        for event in [{}, {"before": "0" * 40, "after": head},
                      {"before": "a" * 40, "after": head},
                      {"before": self.base, "after": self.base},
                      {"before": head, "after": head}]:
            with self.subTest(event=event):
                self.assert_scope("full", event=event)
        self.assert_scope("full", event_name="release")
        self.assert_scope("full", event_name="future-event")

    def test_deleted_or_renamed_target_checks_unchanged_docs(self):
        self.write("README.md", "[Guide](docs/guide.md)\n[Old missing image](old-image.png)\n")
        base = self.commit()
        self.git("mv", "docs/guide.md", "docs/renamed.md")
        self.commit()
        process, output = self.run_check(base=base)
        self.assertNotEqual(process.returncode, 0)
        self.assertIn("README.md: missing repository link: docs/guide.md", process.stderr)
        self.assertNotIn("old-image.png", process.stderr)
        self.assertEqual(output, "")

    def test_unrelated_existing_broken_links_do_not_block_deletion(self):
        self.write("README.md", "[Old missing image](old-image.png)\n")
        base = self.commit()
        (self.root / "docs/guide.md").unlink()
        self.commit()
        self.assert_scope("docs", base=base)

    def test_broken_link_and_whitespace_fail_without_scope_output(self):
        self.write("README.md", "[Missing](docs/missing.md)\n")
        self.commit()
        process, output = self.run_check(base=self.base)
        self.assertNotEqual(process.returncode, 0)
        self.assertIn("missing repository link", process.stderr)
        self.assertEqual(output, "")
        self.write("README.md", "Trailing whitespace  \n")
        self.commit()
        process, output = self.run_check(base=self.base)
        self.assertNotEqual(process.returncode, 0)
        self.assertIn("trailing whitespace", process.stdout)
        self.assertEqual(output, "")

    def test_link_formats(self):
        self.write("docs/a (b).md", "# Target\n")
        self.write("README.md", r"""[Relative](docs/guide.md#section)
[Root](/docs/guide.md)
[Encoded](docs/a%20%28b%29.md)
[Spaces](<docs/a (b).md> "title")
[Parentheses](docs/a%20(b).md)
[Escaped](docs/a%20\(b\).md)
[Reference][guide]
[guide]: docs/guide.md "title"
<img src="docs/guide.md"><a href='docs/guide.md'>HTML</a>
[External](https://example.invalid/missing) [Mail](mailto:nobody@example.invalid)
[Network](//example.invalid/missing) [Anchor](#section)
`[Inline code](missing.md)`
```md
[Fenced code](missing.md)
```
~~~md
[Other fence](missing.md)
~~~
    [Indented code](missing.md)
<!-- [Comment](missing.md) -->
""")
        self.commit()
        self.assert_scope("docs", base=self.base)
        self.write("README.md", '<img src="docs/missing.png">\n')
        self.commit()
        process, _ = self.run_check(base=self.base)
        self.assertNotEqual(process.returncode, 0)
        self.assertIn("docs/missing.png", process.stderr)


class SummaryTest(unittest.TestCase):
    def results(self, scope):
        result = "skipped" if scope == "docs" else "success"
        return {"changes": {"result": "success", "outputs": {"scope": scope}},
                **{job: {"result": result} for job in ci_checks.FULL_JOBS}}

    def test_docs_skips_and_full_success_pass(self):
        for scope in ["docs", "full"]:
            with contextlib.redirect_stdout(io.StringIO()):
                ci_checks.check_summary(self.results(scope))

    def test_failure_cancelled_missing_or_unexpected_skip_cannot_pass(self):
        for scope in ["docs", "full"]:
            for job in ["changes", *ci_checks.FULL_JOBS]:
                for result in ["failure", "cancelled", None, "skipped" if scope == "full" else "success"]:
                    with self.subTest(scope=scope, job=job, result=result):
                        needs = self.results(scope)
                        if result is None:
                            del needs[job]
                        else:
                            needs[job]["result"] = result
                        # A successful classifier is expected in either scope.
                        if job == "changes" and result == "success":
                            continue
                        with self.assertRaises(ValueError):
                            ci_checks.check_summary(needs)

    def test_unknown_scope_fails(self):
        needs = self.results("full")
        needs["changes"]["outputs"] = {}
        with self.assertRaises(ValueError):
            ci_checks.check_summary(needs)


if __name__ == "__main__":
    unittest.main()
