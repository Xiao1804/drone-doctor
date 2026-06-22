# Security

## Reporting

Do not publish vulnerabilities, credentials, access tokens, real user contacts, or production data in a public issue. Contact the repository maintainer privately.

## Sensitive data rules

- Runtime users, histories, feedback contacts, logs, uploads, databases, and environment files must not be committed.
- Public trial passes and administrator tokens are separate token types and must not be accepted interchangeably.
- Administrator credentials must be rotated if they may have appeared in source history or shared deployment files.

## Historical runtime data incident

Runtime account data was removed from the current tree and the affected Git history was rewritten on 2026-06-22.

Completed:

- created and SHA-256 verified an offline bundle before rewriting;
- removed `data/users.json` and `data/history.json` from rewritten history;
- force-updated every GitHub branch and the `v1.2.0` tag using explicit leases;
- verified with a fresh mirror clone that branch and tag history has zero references to either sensitive path.

Still required before the incident is fully closed:

1. ask collaborators to re-clone or hard-reset to rewritten branches;
2. wait for GitHub Support ticket `#4501736` confirmation and repeat the fresh-clone reachability check.

Completed on 2026-06-22:

- the affected production administrator password was rotated after a verified PostgreSQL backup;
- the new administrator credential was verified through the public login endpoint;
- GitHub Support ticket `#4501736` was submitted to purge cached views, pull-request refs 1 through 9, and retained sensitive objects.

GitHub pull-request refs are read-only to repository owners. Rewriting ordinary branches and tags cannot remove objects retained exclusively by those refs.
