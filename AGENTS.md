# DroneDoctor Agent Notes

## Project Facts

- DroneDoctor is a C-end drone AI diagnosis and repair knowledge platform.
- Current stack: React 19 + Vite + Tailwind CSS frontend, Node.js 20 + Express backend, PostgreSQL 16 + pgvector, Kimi API, local bge-small-zh-v1.5 embeddings.
- Long-term project memory is in `.workbuddy/memory/MEMORY.md`.

## Content Safety

- Do not present AI-generated CAAC-style questions as official CAAC questions.
- For CAAC/question-bank work, keep source provenance explicit. Use official public materials first; if no reliable basis exists, leave the explanation as pending instead of inventing one.
- Question dedupe should use normalized stem plus normalized correct answer text. Do not treat different answer letters as conflicts when the correct answer text is the same.

## Local Question Bank Handoff

- 2026-06-01 integrated local Word/PDF question banks into `C:\Users\xmh\Desktop\题库_整合输出\`.
- Current outputs: oral/comprehensive 182 questions; non-oral chapter and summary versions 1231 questions each.
- Handoff doc: `docs/caac-question-bank-integration-handoff.md`.
