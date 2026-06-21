# Contributing

## Branches and changes

- Keep one change focused on one problem.
- Use short-lived branches such as `fix/...`, `feat/...`, or `docs/...`.
- Do not mix product features with unrelated cleanup.
- Never commit `.env` files, access tokens, runtime user data, logs, uploads, database files, or real feedback contacts.

## Database changes

- PostgreSQL schema changes must use a new file in `backend/migrations/`.
- Never edit a migration already applied to production.
- Prefer backward-compatible, forward-only changes.
- Destructive changes require a verified backup and a staged compatibility plan.

## Required verification

```bash
cd backend
npm ci
npm run check:syntax
npm test -- --runInBand

cd ../frontend
npm ci
npm run build
```

Also validate Docker Compose when deployment files change:

```bash
docker compose --env-file .env.tencent.example -f docker-compose.tencent.yml config
```

## Commits and review

- Commit messages should explain why the change exists.
- Include active constraints, rejected alternatives, remaining risk, and missing verification when relevant.
- Do not merge when tests or builds fail.
- Security and database changes require a separate review pass.
