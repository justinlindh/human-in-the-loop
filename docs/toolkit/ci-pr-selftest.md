---
tool: `scripts/ci-pr-selftest.test.sh`
section: pr
covers: scripts/ci-pr-selftest.test.sh
---
Cases for the self-test override in `ci-local.sh` (`pr_selftest`). Under `ci-pr.sh` (`CI_PR_SELFTESTS=1`), main's local CI normally runs main's copy of each tooling self-test. When the PR changes a test file a `tool_step` runs, that step runs the PR's copy in place in the PR's tree, so it exercises the PR's own copies of the scripts it tests: a PR that adds behaviour together with its test passes, and one that fixes a broken self-test is judged by the fix. The Local CI summary carries a note naming the file; the reviewer checks the test was not weakened. A test the PR doesn't change, or a tree that lacks the file, runs main's.
