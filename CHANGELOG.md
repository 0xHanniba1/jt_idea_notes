# Changelog

## 2026-09-16 — Retire voting

### Changed

- Remove post voting, voter lists, vote counts, automatic author votes and vote merging for duplicate records. Home defaults to newest submissions; legacy voting views fall back to `recent` and `myvotes` is ignored.
- Retain comments, reactions, status updates, following and existing notification preferences. Add the missing authenticated subscription-read endpoint used by detail overlays, and correct the Chinese follow labels.
- Remove `hasVoted` and `votesCount` from post API responses and `votes_count` from CSV exports. Retire GET/POST/DELETE `/api/v1/posts/:number/votes` and POST `/api/v1/posts/:number/votes/toggle` (404).
- Remove vote counts from feeds. Existing full-post Webhook events retain integer `post_votes = 0` for legacy templates; the variable is no longer offered in template help. New-post events retain their previous field scope.
- Keep historical vote rows, backup exports and user/tenant deletion cleanup. No database migration is required. API requests without `view` retain the original `all` status range.

### Validation

- See [the local implementation verification](docs/remove-voting-verification.md) for completed checks, isolated runtime details and pre-existing toolchain findings. The associated PR records main delivery and the local 4180 upgrade.
