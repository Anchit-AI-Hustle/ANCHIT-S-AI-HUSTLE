#!/usr/bin/env python3
"""PR Autopilot - merges every open, mergeable, green PR across all of Anchit's repos.

Runs as the token owner (a personal access token), so merges trigger each repo's own
push workflows (deploys, builds) exactly as a manual merge would.

Rules per PR (in order):
  1. Skip drafts (unless INCLUDE_DRAFTS=1) and PRs labelled `no-automerge`.
  2. Merge conflict  -> ask Dependabot to rebase (bot PRs) or comment once, then skip.
  3. Any check failed -> if the branch is behind its base, refresh it so CI re-runs
                         against the latest base (fixes "main was broken" cases); else skip.
  4. Any check still running -> wait for the next sweep.
  5. Otherwise -> merge (squash > merge > rebase, whichever the repo allows),
                  pinned to the head SHA that was checked, then delete the branch.

Env:
  GH_TOKEN         token used for every API call (required)
  OWNERS           comma list of owners to sweep (default: Anchit-AI-Hustle,anchit-tandon)
  REPOS_FILE       optional file with owner/repo lines (skips discovery; used for local tests)
  EXCLUDE_REPOS    comma list of owner/repo to never touch
  INCLUDE_DRAFTS   1 to also merge draft PRs (default 0)
  DRY_RUN          1 to log decisions without changing anything (default 0)
  REPORT_FILE      where to write the markdown run report (default: pr-autopilot-report.md)
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"
TOKEN = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
OWNERS = [o.strip().lower() for o in os.environ.get("OWNERS", "Anchit-AI-Hustle,anchit-tandon").split(",") if o.strip()]
EXCLUDE = {r.strip().lower() for r in os.environ.get("EXCLUDE_REPOS", "").split(",") if r.strip()}
INCLUDE_DRAFTS = os.environ.get("INCLUDE_DRAFTS", "0") == "1"
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"
REPORT_FILE = os.environ.get("REPORT_FILE", "pr-autopilot-report.md")
SKIP_LABEL = "no-automerge"
MARKER = "<!-- pr-autopilot -->"

FAILED = {"failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"}
PASSED = {"success", "neutral", "skipped"}


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body[:300]}")
        self.status = status
        self.body = body


def api(method, path, body=None, retries=3):
    url = path if path.startswith("http") else API + path
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {TOKEN}")
        req.add_header("Accept", "application/vnd.github+json")
        req.add_header("X-GitHub-Api-Version", "2022-11-28")
        req.add_header("User-Agent", "pr-autopilot")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            text = e.read().decode(errors="replace")
            if (e.code in (502, 503, 504) and method == "GET") or (e.code in (403, 429) and "rate limit" in text.lower()):
                time.sleep(5 * (attempt + 1))
                continue
            raise ApiError(e.code, text)
        except (urllib.error.URLError, TimeoutError, OSError):
            if method != "GET":
                raise ApiError(0, f"network error on {method} {path}")
            time.sleep(3 * (attempt + 1))
    raise ApiError(0, f"gave up after {retries} attempts: {method} {path}")


def paged(path):
    sep = "&" if "?" in path else "?"
    page, out = 1, []
    while True:
        chunk = api("GET", f"{path}{sep}per_page=100&page={page}")
        items = chunk.get("check_runs", chunk) if isinstance(chunk, dict) else chunk
        out.extend(items)
        if len(items) < 100:
            return out
        page += 1


def discover_repos():
    if os.environ.get("REPOS_FILE"):
        with open(os.environ["REPOS_FILE"]) as f:
            names = [l.strip() for l in f if l.strip() and not l.startswith("#")]
        return [api("GET", f"/repos/{n}") for n in names]
    repos = paged("/user/repos?affiliation=owner,organization_member,collaborator&sort=pushed")
    return [r for r in repos if r["owner"]["login"].lower() in OWNERS]


def check_state(repo, sha):
    """Return (state, details): state in pass / fail / pending / none."""
    fails, pending, total = [], [], 0
    for run in paged(f"/repos/{repo}/commits/{sha}/check-runs?filter=latest"):
        total += 1
        if run["status"] != "completed":
            pending.append(run["name"])
        elif run["conclusion"] in FAILED:
            fails.append(f"{run['name']}={run['conclusion']}")
        elif run["conclusion"] not in PASSED:
            pending.append(f"{run['name']}={run['conclusion']}")
    statuses, page = [], 1
    while True:
        chunk = api("GET", f"/repos/{repo}/commits/{sha}/status?per_page=100&page={page}").get("statuses", [])
        statuses.extend(chunk)
        if len(chunk) < 100:
            break
        page += 1
    for st in statuses:
        total += 1
        if st["state"] in ("failure", "error"):
            fails.append(f"{st['context']}={st['state']}")
        elif st["state"] == "pending":
            pending.append(st["context"])
    if fails:
        return "fail", fails
    if pending:
        return "pending", pending
    return ("pass" if total else "none"), []


def already_commented(repo, number, tag):
    for c in paged(f"/repos/{repo}/issues/{number}/comments"):
        body = c.get("body") or ""
        if MARKER in body and tag in body:
            return True
    return False


def comment(repo, number, text, tag):
    if already_commented(repo, number, tag):
        return False
    if not DRY_RUN:
        api("POST", f"/repos/{repo}/issues/{number}/comments", {"body": f"{text}\n\n{MARKER} {tag}"})
    return True


def is_bot(pr):
    return pr["user"]["login"] in ("dependabot[bot]", "dependabot-preview[bot]")


def base_tip(repo, pr):
    return api("GET", f"/repos/{repo}/branches/{pr['base']['ref']}")["commit"]["sha"]


def refresh_branch(repo, pr, tip=None):
    """Bring the PR branch up to date with its base so CI re-runs. Once per base tip."""
    tip = tip or base_tip(repo, pr)
    if is_bot(pr):
        tag = f"rebase:{tip[:12]}"
        return "asked dependabot to rebase" if comment(repo, pr["number"], "@dependabot rebase", tag) else "rebase already requested"
    if DRY_RUN:
        return "would update branch"
    try:
        api("PUT", f"/repos/{repo}/pulls/{pr['number']}/update-branch", {"expected_head_sha": pr["head"]["sha"]})
    except ApiError as e:
        return f"could not update branch (HTTP {e.status}) - needs a manual update"
    return "updated branch from base"


def behind_by(repo, pr):
    """(commits behind the *current* base tip, that tip sha)."""
    tip = base_tip(repo, pr)
    cmp = api("GET", f"/repos/{repo}/compare/{tip}...{pr['head']['sha']}")
    return cmp.get("behind_by", 0), tip


def head_age_minutes(repo, sha):
    c = api("GET", f"/repos/{repo}/commits/{sha}")
    when = c["commit"]["committer"]["date"]
    t = time.mktime(time.strptime(when, "%Y-%m-%dT%H:%M:%SZ")) - time.timezone
    return (time.time() - t) / 60


def merge(repo_meta, pr):
    repo = repo_meta["full_name"]
    methods = [m for m, ok in (("squash", repo_meta.get("allow_squash_merge", True)),
                               ("merge", repo_meta.get("allow_merge_commit", True)),
                               ("rebase", repo_meta.get("allow_rebase_merge", True))) if ok]
    if not methods:
        return "retry"
    if DRY_RUN:
        return f"would merge ({methods[0]})"
    last = None
    for m in methods:
        try:
            api("PUT", f"/repos/{repo}/pulls/{pr['number']}/merge",
                {"merge_method": m, "sha": pr["head"]["sha"]})
            same_repo = pr["head"]["repo"] and pr["head"]["repo"]["full_name"] == repo
            if same_repo and not repo_meta.get("delete_branch_on_merge"):
                try:
                    api("DELETE", f"/repos/{repo}/git/refs/heads/{pr['head']['ref']}")
                except ApiError:
                    pass
            return f"merged ({m})"
        except ApiError as e:
            last = e
            low = e.body.lower()
            if e.status == 405 and "not allowed" in low:
                continue
            if e.status == 405:
                fresh = api("GET", f"/repos/{repo}/pulls/{pr['number']}")
                if fresh.get("mergeable") is False or fresh.get("mergeable_state") == "dirty" or "conflict" in low:
                    return "conflict"
                return "retry"
            if e.status == 409:  # base moved / head changed since we looked: next sweep retries
                return "retry"
            raise
    raise last if last else ApiError(0, "no merge method succeeded")


def process_pr(repo_meta, pr_stub):
    repo = repo_meta["full_name"]
    n = pr_stub["number"]
    labels = {l["name"] for l in pr_stub.get("labels", [])}
    if SKIP_LABEL in labels:
        return "skipped", f"label `{SKIP_LABEL}`"
    if pr_stub["draft"] and not INCLUDE_DRAFTS:
        return "skipped", "draft"
    pr = api("GET", f"/repos/{repo}/pulls/{n}")
    for _ in range(3):  # mergeability is computed lazily by GitHub
        if pr.get("mergeable") is not None:
            break
        time.sleep(3)
        pr = api("GET", f"/repos/{repo}/pulls/{n}")
    if pr.get("mergeable") is None:
        return "waiting", "GitHub still computing mergeability"
    if pr["mergeable"] is False or pr.get("mergeable_state") == "dirty":
        if is_bot(pr):
            refresh_branch(repo, pr)
            return "blocked", "merge conflict - asked Dependabot to rebase"
        comment(repo, n, "PR Autopilot: this PR has merge conflicts with its base branch, so it can't be merged automatically. Resolve them and it will merge on the next sweep once checks pass.", "conflict:" + pr["head"]["sha"][:12])
        return "blocked", "merge conflict (needs a manual resolve)"
    state, details = check_state(repo, pr["head"]["sha"])
    if state == "none" and head_age_minutes(repo, pr["head"]["sha"]) < 10:
        return "waiting", "no checks reported yet on a fresh commit; giving CI time to start"
    if state == "fail":
        behind, tip = behind_by(repo, pr)
        if behind > 0:
            return "refreshing", f"checks failed on an outdated base; {refresh_branch(repo, pr, tip)}"
        return "blocked", "failing checks: " + ", ".join(details[:6]) + (" ..." if len(details) > 6 else "")
    if state == "pending":
        return "waiting", "checks running: " + ", ".join(details[:4])
    if pr.get("mergeable_state") == "blocked":
        return "blocked", "blocked by a branch rule (required review or status)"
    if pr.get("mergeable_state") == "behind":
        return "refreshing", refresh_branch(repo, pr)
    result = merge(repo_meta, pr)
    if result == "conflict":  # stale mergeable flag: a sibling PR merged first
        if is_bot(pr):
            refresh_branch(repo, pr)
            return "blocked", "conflict after a sibling merge - asked Dependabot to rebase"
        return "blocked", "conflict after a sibling merge (needs a manual resolve)"
    if result == "retry":
        return "waiting", "base or head moved during merge; retrying next sweep"
    return ("merged" if result.startswith("merged") else "would-merge"), f"{result}; checks: {state}"


def main():
    if not TOKEN:
        print("GH_TOKEN is not set", file=sys.stderr)
        return 2
    started = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    repos = [r for r in discover_repos() if not r.get("archived") and not r.get("disabled")
             and r["full_name"].lower() not in EXCLUDE]
    rows, errors, fatal = [], [], []
    for meta in sorted(repos, key=lambda r: r["full_name"].lower()):
        repo = meta["full_name"]
        try:
            prs = paged(f"/repos/{repo}/pulls?state=open")
        except ApiError as e:
            errors.append((repo, "-", str(e)))
            if e.status == 401:
                fatal.append(str(e))
            continue
        for pr in prs:
            try:
                outcome, why = process_pr(meta, pr)
            except ApiError as e:
                outcome, why = "error", str(e)
                errors.append((repo, pr["number"], str(e)))
                if e.status == 401:
                    fatal.append(str(e))
            except Exception as e:  # never let one PR stop the sweep
                outcome, why = "error", f"{type(e).__name__}: {e}"
                errors.append((repo, pr["number"], why))
            rows.append((repo, pr["number"], pr["title"][:70], outcome, why))
            print(f"[{outcome:10}] {repo}#{pr['number']} - {why}", flush=True)

    counts = {}
    for r in rows:
        counts[r[3]] = counts.get(r[3], 0) + 1
    order = ["merged", "would-merge", "refreshing", "waiting", "blocked", "skipped", "error"]
    summary = " | ".join(f"{k}: {counts[k]}" for k in order if k in counts) or "no open PRs"
    lines = [f"# PR Autopilot report", "", f"Last sweep: {started}{' (DRY RUN)' if DRY_RUN else ''}",
             f"Repos swept: {len(repos)} | Open PRs: {len(rows)} | {summary}", ""]
    if rows:
        lines += ["| Repo | PR | Title | Outcome | Detail |", "|---|---|---|---|---|"]
        rank = {k: i for i, k in enumerate(order)}
        for repo, num, title, outcome, why in sorted(rows, key=lambda r: (rank.get(r[3], 9), r[0], -r[1])):
            t = title.replace("|", "/")
            w = why.replace("|", "/")
            lines.append(f"| {repo} | [#{num}](https://github.com/{repo}/pull/{num}) | {t} | {outcome} | {w} |")
    if errors:
        lines += ["", "## Errors", *[f"- {r}#{n}: {e[:200]}" for r, n, e in errors]]
    report = "\n".join(lines) + "\n"
    with open(REPORT_FILE, "w") as f:
        f.write(report)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(report)
    print("\n" + summary)
    # Red run only when the token itself is broken (expired/revoked); per-PR
    # problems are listed in STATUS.md instead of failing every 15 minutes.
    return 1 if fatal else 0


if __name__ == "__main__":
    sys.exit(main())
