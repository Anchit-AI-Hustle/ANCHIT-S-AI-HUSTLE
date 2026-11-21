# PR Autopilot

Merges every open PR across all repos owned by **Anchit-AI-Hustle** and **anchit-tandon**, automatically, every 15 minutes. New repos are picked up on the next sweep, with no per-repo setup.

Live status of every open PR: [`STATUS.md`](./STATUS.md) (updated whenever something changes).

## What gets merged

A PR merges as soon as all of these are true:

- it is not a draft and has no `no-automerge` label
- it has no merge conflicts
- none of its checks failed and none are still running (repos with no CI merge straight away)

A Vercel status that only reports a platform quota ("Deployment rate limited", or the Hobby plan's private-org-repo block) is ignored, because no build ran. A real failed Vercel build still blocks, and so does every CI check.

It merges with squash (or merge/rebase if squash is off in that repo), pinned to the exact commit that passed. The merged branch is then deleted.

The merge runs **as you** (your token), so every repo's own deploys on push to `main` (Vercel, Cloudflare, Supabase, TestFlight, Pages) fire exactly as they do for a manual merge.

## What it does instead of merging

| Situation | Action |
|---|---|
| Checks failed, branch is behind `main` | Refreshes the branch (`@dependabot rebase` for bot PRs, "update branch" for yours) so CI reruns against the latest `main`. This also clears PRs that only failed because `main` itself was broken. |
| Checks failed on the latest `main` | Leaves it open (genuinely broken). Shown as `blocked` in STATUS.md. |
| Merge conflict | Asks Dependabot to rebase (bot PRs) or leaves one comment (your PRs). |
| Checks still running | Waits for the next sweep. |

## One-time setup (required)

1. Create a **classic** token at https://github.com/settings/tokens/new?scopes=repo,workflow&description=PR%20Autopilot with the `repo` and `workflow` scopes. Expiry: *No expiration*, or set a calendar reminder.
2. In this repo, go to **Settings → Secrets and variables → Actions → New repository secret**. Name: `PR_AUTOPILOT_TOKEN`, value: the token.
3. **Actions → PR Autopilot → Run workflow** once to confirm (tick *dry run* for a no-change test).

A classic token is used because fine-grained tokens are limited to one owner, and this has to cover both accounts.

## Controls

- **Skip one PR:** add the label `no-automerge`.
- **Skip whole repos:** Actions variable `PR_AUTOPILOT_EXCLUDE` = `owner/repo,owner/repo2`.
- **Also merge drafts:** Actions variable `PR_AUTOPILOT_INCLUDE_DRAFTS` = `1`.
- **Pause everything:** Actions → PR Autopilot → ⋯ → Disable workflow.

## Files

- `autopilot.py`: the sweeper (Python standard library only)
- `test_autopilot.py`: acceptance tests (`python3 -m unittest ops/pr-autopilot/test_autopilot.py`)
- `../../.github/workflows/pr-autopilot.yml`: the 15-minute schedule
