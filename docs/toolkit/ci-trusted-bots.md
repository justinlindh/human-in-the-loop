---
tool: `scripts/ci-trusted-bots`
section: ci
who: integrator
covers: scripts/ci-trusted-bots scripts/ci-pr-trust.test.sh
---
GitHub Apps (REST login `<name>[bot]`, one per line) whose same-repository pull requests count as a trusted author, next to the people in `scripts/ci-trusted`. `ci-pr.sh`, `auto-ci.sh` and `review-prep.sh` read it; a lane's app is one line here. An app is trusted as an author only: `pr-owner`, `pr-status` and `baseline-media` still read `scripts/ci-trusted` alone, so an app can never record an owner decision. `ci-pr.sh` checks the REST login and type (`Bot`) rather than gh's `app/<name>`, so a person can't pass by naming themselves like an app. Forks stay refused. The `review` and `local-ci` required checks accept a status from any source, so an app token that can write commit statuses can post them.
