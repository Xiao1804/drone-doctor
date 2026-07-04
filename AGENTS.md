# DroneDoctor Agent Notes

## Project Facts

- DroneDoctor is currently a free demand-validation tool for drone repair diagnosis.
- Public users do not register accounts. They add the maintainer on WeChat, receive a free coupon, and activate a time-limited browser pass.
- Account login is admin-only. Keep coupon access and administrator authentication as separate token types.
- Current stack: React 18 + Vite + Tailwind CSS frontend, Node.js 20 + Express backend, PostgreSQL 16 + pgvector, DeepSeek text API, Zhipu GLM-4.6V-Flash vision API, and local bge-small-zh-v1.5 embeddings.
- Long-term project memory is in `.workbuddy/memory/MEMORY.md`.

## Content Safety

- Do not present AI-generated CAAC-style questions as official CAAC questions.
- For CAAC/question-bank work, keep source provenance explicit. Use official public materials first; if no reliable basis exists, leave the explanation as pending instead of inventing one.
- Question dedupe should use normalized stem plus normalized correct answer text. Do not treat different answer letters as conflicts when the correct answer text is the same.

## Development Baseline

- Read the global development preflight before changing code or configuration.
- Never commit runtime account data, environment files, database files, logs, uploads, access tokens, or real user contact information.
- PostgreSQL schema changes require a new migration. Do not add runtime PostgreSQL DDL.
- Run backend syntax checks and tests plus the frontend production build before completion.
- Production releases use complete versioned source packages; do not update a server by downloading individual changed files.
- Do not claim an AI diagnosis accuracy percentage without a reproducible dataset, evaluation script, and review standard.

## Local Question Bank Handoff

- 2026-06-01 integrated local Word/PDF question banks into `C:\Users\xmh\Desktop\题库_整合输出\`.
- Current outputs: oral/comprehensive 182 questions; non-oral chapter and summary versions 1231 questions each.
- Handoff doc: `docs/caac-question-bank-integration-handoff.md`.
