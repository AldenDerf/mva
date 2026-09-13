<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Guidelines & Git Commit Rules

## Automatic Commits on Features / Updates
- **Automatic Commits**: Every time a feature, update, bug fix, or task is completed and verified, commit the changes to Git immediately.
- **Commit Messages**: Use clear, concise conventional commit messages (e.g. `feat: ...`, `fix: ...`, `chore: ...`).
- **Push to GitHub**: If a remote origin is configured, push changes to GitHub (`git push`). If not yet linked to GitHub, inform the user with the command to link it.
- **Security**: Never commit secrets, credentials, or environment files (`.env*`).
