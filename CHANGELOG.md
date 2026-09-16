# Changelog

## 2026-09-16 — JT UI and compact idea layout

### Changed

- Adapt jt_case_platform's light/dark tokens, controls, menus, dialogs, editor surfaces, Toast effects and Lucide icons within Fider's existing React/TypeScript/SCSS architecture.
- Replace the home layout with a compact list, collapsible welcome text, top creation button and search/filter/sort toolbar. Home and Roadmap use a right-side detail drawer that fills narrow viewports.
- Preserve list query, limit, scroll and focus across drawer close, Back/Forward and nested dialogs. Keep standalone record links, refresh and comment anchors working.
- Refresh records, comments and source lists after mutations without reloading the page. Handle stale requests, permission failures, unsaved edits and pending-submit input protection.
- Correct narrow member/tag layouts, rich-editor Escape handling and Toast focus/reduced-motion timing. No database migration or voting behavior change.

### Validation

- 20 frontend suites / 182 tests, frontend ESLint, SSR and production UI builds, and related Go handlers/apiv1/web tests pass. Raw tsc retains the same 25 third-party declaration errors as the clean baseline.
- Isolated Chrome checks cover desktop/narrow and light/dark layouts, image creation, editing, comments, status, tags, duplicate links, following, deletion and navigation restoration.
- See [verification details](docs/jt-ui-refresh-verification.md) and [Issue #3](https://github.com/0xHanniba1/jt_idea_notes/issues/3). The Issue records main delivery and the separate 4180 upgrade, preserving its data and backup.

## 2026-09-16 — Retire voting

### Changed

- Remove post voting, voter lists, vote counts, automatic author votes and vote merging for duplicate records. Home defaults to newest submissions; legacy voting views fall back to `recent` and `myvotes` is ignored.
- Retain comments, reactions, status updates, following and existing notification preferences. Add the missing authenticated subscription-read endpoint used by detail overlays, and correct the Chinese follow labels.
- Remove `hasVoted` and `votesCount` from post API responses and `votes_count` from CSV exports. Retire GET/POST/DELETE `/api/v1/posts/:number/votes` and POST `/api/v1/posts/:number/votes/toggle` (404).
- Remove vote counts from feeds. Existing full-post Webhook events retain integer `post_votes = 0` for legacy templates; the variable is no longer offered in template help. New-post events retain their previous field scope.
- Keep historical vote rows, backup exports and user/tenant deletion cleanup. No database migration is required. API requests without `view` retain the original `all` status range.

### Validation

- See [the local implementation verification](docs/remove-voting-verification.md) for completed checks, isolated runtime details and pre-existing toolchain findings. The associated PR records main delivery and the local 4180 upgrade.
