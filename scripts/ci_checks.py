#!/usr/bin/env python3
"""Classify CI changes and check documentation using only Git and Python stdlib."""

import argparse
import html
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit


ROOT_DOCS = frozenset({
    "AGENTS.md", "CHANGELOG.md", "CLAUDE.md", "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md", "GUIDELINES.md", "MODERATION.md", "README.md", "SECURITY.md",
})
FULL_JOBS = frozenset({
    "lint-workflows", "test-ui", "test-server", "build", "test-e2e-ui", "test-e2e-server",
})
SHA = re.compile(r"[0-9a-f]{40}")
# Common Markdown destinations: <paths with spaces>, escaped characters, or
# unquoted paths (including balanced parentheses). Titles are not destinations.
DESTINATION = r"(<[^>\n]+>|(?:\\.|[^\s()<>\\]|\((?:\\.|[^()\\])*\))+)"
INLINE_LINK = re.compile(r"\]\(\s*" + DESTINATION)
REFERENCE_LINK = re.compile(r"^ {0,3}\[[^]\n]+\]:\s*" + DESTINATION, re.MULTILINE)
HTML_LINK = re.compile(r"\b(?:href|src)\s*=\s*([\"'])(.*?)\1", re.IGNORECASE)


def git(*args):
    return subprocess.check_output(["git", *args], stderr=subprocess.PIPE).decode("utf-8")


def is_doc(path):
    parts = PurePosixPath(path).parts
    return path in ROOT_DOCS or (
        len(parts) > 1 and parts[0] == "docs" and path.endswith(".md")
    )


def commit(sha):
    if not isinstance(sha, str) or not SHA.fullmatch(sha) or sha == "0" * 40:
        raise ValueError("missing or invalid comparison commit")
    git("cat-file", "-e", sha + "^{commit}")
    return sha


def event_base(event_name, event, head):
    """Unknown/missing event ranges deliberately fall back to complete CI."""
    if event_name == "pull_request":
        base = commit(event["pull_request"]["base"]["sha"])
        return git("merge-base", base, head).strip()
    if event_name == "push":
        if commit(event["after"]) != head:
            raise ValueError("checkout does not match push target")
        return commit(event["before"])
    return None  # Releases (and any future triggers) always run complete CI.


def changes(base, head):
    # Disable rename detection so both the old and new path are classified.
    fields = git("diff", "--no-ext-diff", "--no-renames", "--raw", "-z", base, head, "--").split("\0")
    changed = []
    for index in range(0, len(fields) - 1, 2):
        metadata = fields[index].split()
        changed.append((fields[index + 1], metadata[0][1:], metadata[1]))
    return changed


def docs_only(changed):
    return bool(changed) and all(
        is_doc(path) and old_mode in {"000000", "100644"} and new_mode in {"000000", "100644"}
        for path, old_mode, new_mode in changed
    )


def prose(markdown):
    """Ignore examples in fenced/indented code, inline code and HTML comments."""
    lines = []
    fence = None
    for line in markdown.splitlines():
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if fence:
            if re.match(r"^ {0,3}" + re.escape(fence[0]) + "{" + str(len(fence)) + r",}\s*$", line):
                fence = None
            lines.append("")
        elif marker:
            fence = marker[1]
            lines.append("")
        else:
            lines.append("" if line.startswith(("    ", "\t")) else line)
    text = "\n".join(lines)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    return re.sub(r"(`+).*?\1", "", text, flags=re.DOTALL)


def link_errors(paths, removed=None):
    root = Path.cwd().resolve()
    errors = []
    for name in sorted(paths):
        source = root / name
        if not source.is_file() or source.is_symlink():
            continue
        text = prose(source.read_text(encoding="utf-8"))
        destinations = [match[1] for pattern in (INLINE_LINK, REFERENCE_LINK) for match in pattern.finditer(text)]
        destinations.extend(match[2] for match in HTML_LINK.finditer(text))
        for destination in destinations:
            destination = html.unescape(re.sub(r"\\(.)", r"\1", destination.strip("<>")))
            url = urlsplit(destination)
            if url.scheme or url.netloc or not url.path:
                continue
            local = unquote(url.path)
            target = (root / local.lstrip("/") if local.startswith("/") else source.parent / local).resolve()
            if removed is not None and not any(
                (root / path).is_relative_to(target) for path in removed
            ):
                continue  # An unchanged document is checked only for newly removed targets.
            if not target.is_relative_to(root) or not target.exists():
                errors.append(f"{name}: missing repository link: {destination}")
    return errors


def check_links(paths, removed=None):
    errors = link_errors(paths, removed)
    if errors:
        raise ValueError("\n".join(errors))
    print(f"Local links checked in {len(paths)} Markdown file(s).")


def check_changes(args):
    head = git("rev-parse", args.head).strip()
    if head != git("rev-parse", "HEAD").strip():
        raise ValueError("--head must match the checked-out commit for documentation checks")
    base = None
    if args.base:
        base = commit(git("rev-parse", args.base).strip())
    else:
        try:
            expected = os.environ.get("GITHUB_SHA")
            if expected and expected != head:
                raise ValueError("checkout does not match workflow commit")
            event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
            base = event_base(os.environ["GITHUB_EVENT_NAME"], event, head)
        except (KeyError, ValueError, OSError, subprocess.CalledProcessError) as error:
            print(f"Cannot confirm changed-file range; using complete CI ({error}).")

    changed = changes(base, head) if base else []
    scope = "docs" if docs_only(changed) else "full"
    if base:
        subprocess.run(["git", "diff", "--check", base, head, "--"], check=True)
        docs = {path for path, _, new_mode in changed if is_doc(path) and new_mode == "100644"}
        check_links(docs)
        # A removed/renamed target can break a link in an unchanged document.
        removed = {path for path, _, new_mode in changed if is_doc(path) and new_mode == "000000"}
        if removed:
            remaining = {path for path in git("ls-files", "-z").split("\0") if is_doc(path)} - docs
            check_links(remaining, removed)
    else:
        print("No reliable diff range; documentation diff/link checks unavailable.")

    print(f"CI scope: {scope} ({len(changed)} changed paths).")
    if output := os.environ.get("GITHUB_OUTPUT"):
        with open(output, "a", encoding="utf-8") as stream:
            stream.write(f"scope={scope}\n")
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(f"CI scope: **{scope}**. " + (
                "Documentation links and whitespace checked; application jobs skipped.\n"
                if scope == "docs" else "Complete application checks required.\n"
            ))


def check_summary(needs):
    change_job = needs.get("changes", {})
    scope = change_job.get("outputs", {}).get("scope")
    if change_job.get("result") != "success" or scope not in {"docs", "full"}:
        raise ValueError("Change classification or lightweight checks did not succeed")
    expected = "skipped" if scope == "docs" else "success"
    for job in sorted(FULL_JOBS):
        result = needs.get(job, {}).get("result")
        if result != expected:
            raise ValueError(f"{job}: expected {expected} for {scope} scope, got {result}")
    print(f"CI passed ({scope}).")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    diff = commands.add_parser("changes", help="Check event diff, or an explicit local commit range")
    diff.add_argument("--base")
    diff.add_argument("--head", default="HEAD")
    links = commands.add_parser("links", help="Check repository links in the supplied Markdown files")
    links.add_argument("paths", nargs="+")
    commands.add_parser("summary", help="Validate all required job results from CI_NEEDS JSON")
    args = parser.parse_args()
    try:
        if args.command == "changes":
            check_changes(args)
        elif args.command == "links":
            check_links(args.paths)
        else:
            check_summary(json.loads(os.environ["CI_NEEDS"]))
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
