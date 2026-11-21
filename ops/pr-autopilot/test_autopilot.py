"""Acceptance tests for PR Autopilot decision logic (mocked GitHub API)."""
import os
import sys
import time
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
    def __init__(self, pr_obj, runs=(), statuses=(), behind=0, tip="BASE", comments=(), merge_errors=(),
                 head_date="2020-01-01T00:00:00Z", refetch=None):
        self.pr, self.runs, self.statuses = pr_obj, list(runs), list(statuses)
        self.behind, self.tip, self.comments = behind, tip, list(comments)
        self.merge_errors = list(merge_errors)
        self.head_date, self.refetch = head_date, refetch
        self.calls = []

    def __call__(self, method, path, body=None, retries=3):
        self.calls.append((method, path, body))
        if method == "GET" and path.startswith("/repos/o/r/pulls/1") and "update" not in path:
            if self.refetch and any(c[1].endswith("/merge") for c in self.calls):
                return self.refetch
            return self.pr
        if "/check-runs" in path:
            return {"check_runs": self.runs}
        if "/status?" in path:
            return {"statuses": self.statuses}
        if "/commits/HEAD" == path[-13:] or path.endswith("/commits/HEAD"):
            return {"commit": {"committer": {"date": self.head_date}}}
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
        f2 = FakeApi(stub, runs=[{"status": "completed", "conclusion": "failure", "name": "build"}], behind=3, tip="NEWBASE",
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

    def test_no_checks_on_fresh_commit_waits(self):
        now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        f = FakeApi(pr(), head_date=now)
        self.assertEqual(run(f)[0], "waiting")
        self.assertFalse(f.did("PUT", "/merge"))

    def test_real_github_not_mergeable_405_is_treated_as_conflict(self):
        err = ap.ApiError(405, '{"message":"Pull Request is not mergeable"}')
        bot = pr(user={"login": "dependabot[bot]"})
        f = FakeApi(bot, runs=[ok], merge_errors=[err], refetch=dict(bot, mergeable=False, mergeable_state="dirty"))
        out = run(f)
        self.assertEqual(out[0], "blocked")
        self.assertTrue(f.did("POST", "/comments"))

    def test_rebase_tag_uses_live_base_tip(self):
        stub = pr(user={"login": "dependabot[bot]"})
        f = FakeApi(stub, runs=[{"status": "completed", "conclusion": "failure", "name": "b"}], behind=2, tip="TIP2abcdefghijk")
        run(f)
        self.assertIn("rebase:TIP2abcdefgh", f.did("POST", "/comments")[0][2]["body"])

    def test_update_branch_failure_is_reported_not_raised(self):
        class F(FakeApi):
            def __call__(s, method, path, body=None, retries=3):
                if "update-branch" in path:
                    raise ap.ApiError(422, "merge conflict between base and head")
                return super().__call__(method, path, body, retries)
        f = F(pr(), runs=[{"status": "completed", "conclusion": "failure", "name": "b"}], behind=1, tip="NEW")
        out = run(f)
        self.assertEqual(out[0], "refreshing")
        self.assertIn("could not update branch", out[1])

    def test_mangled_previous_command_does_not_block_real_one(self):
        stub = pr(user={"login": "dependabot[bot]"})
        bad = {"body": "\u00b7@\u00b7dependabot rebase\n\n<!-- pr-autopilot --> rebase:NEWBASE"}
        f = FakeApi(stub, runs=[{"status": "completed", "conclusion": "failure", "name": "b"}], behind=1, tip="NEWBASE", comments=[bad])
        run(f)
        self.assertEqual(len(f.did("POST", "/comments")), 1)

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
