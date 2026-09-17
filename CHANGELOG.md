# Changelog

## 2026-09-17 — Account management and fixed usernames

- Adapt the CRM account layout with a persistent creation form, account cards, search, role/status filters, and visible role, password and activation controls. Preserve existing roles and permissions.
- Clearly separate immutable login usernames from editable nicknames; reject username changes and consistently validate nicknames up to 100 Unicode characters.
- Allow optional temporary passwords, securely generate 12-character values, and show credentials only after a successful commit. Apply the requested 8–12-character rule to new passwords while keeping existing longer passwords valid.
- Validate Go race/short tests, 225 frontend tests, lint, production builds, real HTTP account flows and desktop/narrow browser checks. See [implementation and verification](docs/account-management-plan.md) and [Issue #9](https://github.com/0xHanniba1/jt_idea_notes/issues/9).

## 2026-09-16 — Administrator-provisioned password accounts

- Replace email codes, magic links, OAuth, public registration and API-key identities with administrator-provisioned usernames and passwords. Preserve existing user IDs and business history.
- Add Argon2id credentials, mandatory temporary-password changes, self-service password changes and administrator reset/deactivate/restore controls. Revoke previous sessions on credential or account changes.
- Require a complete session for business pages, APIs, images and exports; add origin validation, bounded request bodies and login/hash concurrency limits. Keep password hashes out of normal exports and logs.
- Add hidden-input local initialization/recovery commands, Chinese/English account forms and no-email notification handling.
- Validate server race tests, 214 frontend tests, builds, lint, real browser workflows, uploaded images, PostgreSQL concurrency and isolated backup/recovery. See [verification](docs/admin-password-login-verification.md) and [operations](docs/admin-password-login-operations.md).

## 2026-09-16 — Chinese administration settings

- Localize all settings pages, navigation, nested forms and dialogs through the existing catalogs. Administrative pages and APIs now use the site language, including server-rendered titles and validation errors.
- Correct wording for input prompts, access permissions, trusted members, OAuth restrictions, exports, deletion timing and UTF-8 byte limits. Preserve template variables, protocol values and original technical diagnostics.
- Correct the reversed loading/failure labels in Webhook template help. No schema, permission or data changes.
- Validation: 182 frontend tests, related Go race tests, ESLint, production builds and isolated Chrome checks pass. See [verification details](docs/admin-chinese-verification.md) and [Issue #5](https://github.com/0xHanniba1/jt_idea_notes/issues/5).

## 2026-09-16 — Remove branding footer

- Remove the Powered by Fider link and version line from Home and record details, including the shared drawer. Remove the unused component, export and footer spacing.
- Validation: affected ESLint, production SSR/UI builds and Go web tests pass; Chrome checks Home, drawer, standalone detail and narrow layout without the footer or page errors.

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
