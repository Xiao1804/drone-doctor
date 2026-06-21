# Security

## Reporting

Do not publish vulnerabilities, credentials, access tokens, real user contacts, or production data in a public issue. Contact the repository maintainer privately.

## Sensitive data rules

- Runtime users, histories, feedback contacts, logs, uploads, databases, and environment files must not be committed.
- Public trial passes and administrator tokens are separate token types and must not be accepted interchangeably.
- Administrator credentials must be rotated if they may have appeared in source history or shared deployment files.

## Historical runtime data incident

Runtime account data was removed from the current tree in commit `d204d2a`. Removing a file from the current branch does not remove it from existing Git history or forks.

Before treating the incident as fully remediated:

1. rotate passwords for affected historical accounts;
2. create a verified repository backup;
3. coordinate a Git history rewrite with all collaborators;
4. force-push only after explicit approval;
5. ask collaborators to re-clone;
6. verify the old blob is no longer reachable from the public repository.

History rewriting is intentionally not automated by application code because it is destructive to shared Git history.
