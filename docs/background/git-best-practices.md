# Git Best Practices - Curated Links

Quick reference for Git workflows, commits, and pull requests.

---

## Commit Messages

- **[How to Write a Git Commit Message](https://cbea.ms/git-commit/)** - Chris Beams' canonical guide. The 7 rules every developer should know.

- **[Conventional Commits](https://www.conventionalcommits.org/)** - Structured commit format (`feat:`, `fix:`, `docs:`) that enables automated changelogs and semantic versioning.

---

## Branching & Workflow

- **[GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)** - Simple branch-based workflow. Create branch, make changes, open PR, merge.

- **[Git Feature Branch Workflow](https://www.atlassian.com/git/tutorials/comparing-workflows/feature-branch-workflow)** - Atlassian's guide to feature branches with examples.

---

## Pull Requests

- **[How to Make a Perfect Pull Request](https://github.blog/developer-skills/github/how-to-write-the-perfect-pull-request/)** - GitHub's official guide to PR descriptions, reviews, and etiquette.

- **[The Art of the PR](https://www.youtube.com/watch?v=pN1E-aBNLcc)** - Talk on keeping PRs small, reviewable, and mergeable.

---

## Code Review

- **[Google's Code Review Guidelines](https://google.github.io/eng-practices/review/)** - How to be a good reviewer and how to handle reviews of your code.

- **[Conventional Comments](https://conventionalcomments.org/)** - Label your review comments (`suggestion:`, `question:`, `nitpick:`) to clarify intent.

---

## Quick Reference

```bash
# Good commit messages
git commit -m "feat: add HbA1c analysis to diabetes pipeline"
git commit -m "fix: handle missing race values in disparity analysis"
git commit -m "docs: add data dictionary for medication columns"

# Check what you're about to commit
git diff --staged

# Interactive staging (pick specific changes)
git add -p

# Amend last commit (before pushing)
git commit --amend
```
