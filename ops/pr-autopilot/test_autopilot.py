"""Acceptance tests for PR Autopilot decision logic (mocked GitHub API)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import autopilot as ap  # noqa: E402

REPO = {"full_name": "o/r", "allow_squash_merge": True, "allow_merge_commit": True,
        "allow_rebase_merge": True, "delete_branch_on_merge": True}


def pr(**kw):
    base = {"number": 1, "draft": False, "labels": [], "title": "t", "mergeable": True,
            "mergeable_state": "clean", "user": {"login": "anchit"},
            "head": {"sha": "HEAD", "ref": "feat", "repo": {"full_name": "o/r"}},
            "base": {"sha": "BASE", "ref": "main"}}
    base.update(kw)
    return base


class FakeApi:
    def __init__(self, pr_obj, runs=(), statuses=(), behind=0, tip="BASE", comments=(), merge_errors=()):
        self.pr, self.runs, self.statuses = pr_obj, list(runs), list(statuses)
        self.behind, self.tip, self.comments = behind, tip, list(comments)
        self.merge_errors = list(merge_errors)
        self.calls = []

    def __call__(self, method, path, body=None, retries=3):
        self.calls.append((method, path, body))
        if method == "GET" and path.startswith("/repos/o/r/pulls/1") and "update" not in path:
            return self.pr
        if "/check-runs" in path:
            return {"check_runs": self.runs}
        if path.endswith("/status"):
            return {"statuses": self.statuses}
        if "/compare/" in path:
            return {"behind_by": self.behind}
        if "/branches/" in path:
            return {"commit": {"sha": self.tip}}
        if "/comments" in path and method == "GET":
            return self.comments
        if path.endswith("/merge") and method == "PUT":
            if self.merge_errors:
                raise self.merge_errors.pop(0)
            return {"merged": True}
        return {}

    def did(self, method, needle):
        return [c for c in self.calls if c[0] == method and needle in c[1]]


def run(fake, stub=None):
    ap.api = fake
    ap.DRY_RUN = False
    ap.INCLUDE_DRAFTS = False
    return ap.process_pr(REPO, stub or fake.pr)


ok = {"status": "completed", "conclusion": "success", "name": "build"}


class Tests(unittest.TestCase):
    def test_draft_is_skipped(self):
        f = FakeApi(pr(draft=True))
        self.assertEqual(run(f)[0], "skipped")
        self.assertFalse(f.did("PUT", "/merge"))

    def test_skip_label(self):
        f = FakeApi(pr(labels=[{"name": "no-automerge"}]))
        self.assertEqual(run(f)[0], "skipped")

    def test_green_pr_merges_pinned_to_head_sha_with_squash(self):
        f = FakeApi(pr(), runs=[ok])
        self.assertEqual(run(f)[0], "merged")
        (_, _, body), = f.did("PUT", "/merge")
        self.assertEqual(body, {"merge_method": "squash", "sha": "HEAD"})

    def test_repo_without_any_checks_merges(self):
        f = FakeApi(pr())
        out = run(f)
        self.assertEqual(out[0], "merged")
        self.assertIn("checks: none", out[1])

    def test_failing_check_blocks_merge(self):
        f = FakeApi(pr(mergeable_state="unstable"), runs=[{"status": "completed", "conclusion": "failure", "name": "build"}])
        self.assertEqual(run(f)[0], "blocked")
        self.assertFalse(f.did("PUT", "/merge"))

    def test_cancelled_and_status_error_block(self):
        f = FakeApi(pr(), runs=[{"status": "completed", "conclusion": "cancelled", "name": "e2e"}])
        self.assertEqual(run(f)[0], "blocked")
        f = FakeApi(pr(), runs=[ok], statuses=[{"state": "failure", "context": "Vercel"}])
        self.assertEqual(run(f)[0], "blocked")

    def test_running_check_waits(self):
        f = FakeApi(pr(), runs=[ok, {"status": "in_progress", "conclusion": None, "name": "test"}])
        self.assertEqual(run(f)[0], "waiting")
        self.assertFalse(f.did("PUT", "/merge"))

    def test_failing_dependabot_pr_on_outdated_base_asks_rebase_once(self):
        stub = pr(user={"login": "dependabot[bot]"})
        f = FakeApi(stub, runs=[{"status": "completed", "conclusion": "failure", "name": "build"}], behind=3, tip="NEWBASE")
        self.assertEqual(run(f)[0], "refreshing")
        posts = f.did("POST", "/comments")
        self.assertEqual(len(posts), 1)
        self.assertTrue(posts[0][2]["body"].startswith("@dependabot rebase"))
        # second sweep: marker comment exists -> no duplicate comment
        f2 = FakeApi(stub, runs=[{"status": "completed", "conclusion": "failure", "name": "build"}], behind=3,
                     comments=[{"body": posts[0][2]["body"]}])
        run(f2)
        self.assertFalse(f2.did("POST", "/comments"))

    def test_failing_human_pr_on_outdated_base_updates_branch(self):
        f = FakeApi(pr(), runs=[{"status": "completed", "conclusion": "failure", "name": "build"}], behind=1, tip="NEW")
        self.assertEqual(run(f)[0], "refreshing")
        (_, _, body), = f.did("PUT", "/update-branch")
        self.assertEqual(body, {"expected_head_sha": "HEAD"})

    def test_conflict_never_merges(self):
        f = FakeApi(pr(mergeable=False, mergeable_state="dirty"))
        self.assertEqual(run(f)[0], "blocked")
        self.assertFalse(f.did("PUT", "/merge"))

    def test_merge_method_falls_back_when_squash_disallowed(self):
        err = ap.ApiError(405, '{"message":"Squash merges are not allowed on this repository."}')
        f = FakeApi(pr(), runs=[ok], merge_errors=[err])
        out = run(f)
        self.assertEqual(out[0], "merged")
        self.assertIn("(merge)", out[1])

    def test_stale_mergeable_conflict_on_merge_asks_dependabot_rebase(self):
        err = ap.ApiError(405, '{"message":"Pull Request has merge conflicts"}')
        f = FakeApi(pr(user={"login": "dependabot[bot]"}), runs=[ok], merge_errors=[err])
        out = run(f)
        self.assertEqual(out[0], "blocked")
        self.assertTrue(f.did("POST", "/comments"))

    def test_base_moved_during_merge_waits(self):
        err = ap.ApiError(409, '{"message":"Head branch was modified. Review and try the merge again."}')
        f = FakeApi(pr(), runs=[ok], merge_errors=[err])
        self.assertEqual(run(f)[0], "waiting")

    def test_dry_run_changes_nothing(self):
        f = FakeApi(pr(), runs=[ok])
        ap.api = f
        ap.DRY_RUN = True
        out = ap.process_pr(REPO, f.pr)
        ap.DRY_RUN = False
        self.assertEqual(out[0], "would-merge")
        self.assertFalse([c for c in f.calls if c[0] != "GET"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
