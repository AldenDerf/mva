# Git Commit Rules

## Automatic Commits on Completion of Features or Updates
- Whenever a feature, update, bug fix, refactor, or enhancement is completed and verified, immediately stage and commit all relevant changes using Git.
- **Commit Messages**: Follow standard conventional commit formatting:
  - `feat: <description>` for new features
  - `fix: <description>` for bug fixes
  - `refactor: <description>` for code refactoring
  - `style: <description>` for UI/styling changes
  - `docs: <description>` for documentation updates
  - `chore: <description>` for maintenance or dependency tasks
- **Remote Push**:
  - If a remote origin is configured, push the committed changes to GitHub (`git push`).
  - If no remote is configured yet or push fails, prompt the user with the remote repository setup command (`git remote add origin <url>`).
- **Cleanliness & Security**:
  - Never commit `.env` or sensitive credentials/secrets.
  - Keep commits atomic and clearly documented.
