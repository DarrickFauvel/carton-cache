---
name: ship
description: Verify, commit, push, and open a GitHub PR for the current changes. Use when the user says to ship, open a PR, or send changes for review.
disable-model-invocation: true
---

Ship the working-tree changes as a pull request, following this repo's workflow: a feature branch, one PR per change, squash-merged on GitHub.

Arguments (optional): $ARGUMENTS. Treat any text here as a hint for the branch name or PR title.

1. **Inspect.** Run `git status` and `git diff` (plus `git diff --staged`). If there's nothing to ship, say so and stop. Never stage `.env` or other secrets; if one shows up as untracked, leave it out and mention it.
2. **Verify.** Run `npm run typecheck`. If it fails, fix errors in the code being shipped. If the errors are in unrelated code, stop and report them. There's no test suite or linter.
3. **Build components if needed.** If anything under `src/components/` changed, run `npm run build` to make sure the bundle compiles. `public/js/components/` is gitignored, so the build output is not committed.
4. **Branch.** Every new feature gets its own new branch: a short kebab-case name after the change (like the existing `carton-suggest-and-labels` and `add-org-name-header`), created with `git switch -c <branch>`. Uncommitted changes move to the new branch with it.
   - On `main`: create the new branch.
   - On a feature branch: keep it only if the changes continue that branch's own work and its PR is still open (`gh pr view --json state`). If the PR is merged or closed, or the changes are a different feature, create a new branch from `main` instead (`git switch -c <branch> main`; uncommitted changes carry over). If that switch fails because of conflicts, stop and ask the user.
   - Never reuse a branch whose PR has already been merged.
5. **Commit.** Stage the relevant files by name rather than `git add -A`. Write an imperative, sentence-case subject in the style of `git log --oneline` (e.g. "Let orgs choose their name and show it in the header"), add a short body if the change needs explaining, and end with the attribution lines from the current system reminder.
6. **Push.** Run `git push -u origin <branch>`.
7. **Open the PR.** Run `gh pr create --base main` with the commit subject as the title and a body with a short **Summary** (bullets), a **Migrations** note if `src/db/migrations/` changed (production runs them on `npm start`), and a **Testing** note listing what you actually ran. End the body with the PR attribution line from the current system reminder.
8. Report the PR URL.

Don't merge the PR, force-push, or push to `main` unless the user explicitly asks in this conversation.
