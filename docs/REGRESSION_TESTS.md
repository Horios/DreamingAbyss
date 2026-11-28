# Emberwild regression testing

## Push to `chatgpt-dev`: required preview gate

`.github/workflows/deploy-preview.yml` calls `test-skill-gems.yml` as a
reusable workflow. All three jobs must succeed before the preview-dispatch job
requests the existing Pages deployment on `main`:

- **Core**: current core modules, skills, journal, equipment and item/catalogue tests.
- **Persistence**: save migration, offline receipts/checkpoints and timeline ownership.
- **Browser smoke**: Playwright Chromium, boot/download failures, responsive navigation.

The older standalone push test trigger has been removed to avoid running the same
suite twice; the jobs are now visible inside the `Deploy production and preview`
workflow run. An unsuccessful required job blocks the preview dispatch, not just
the separate regression report. No balance or save schema is altered.

The dispatcher skips an outdated commit if `chatgpt-dev` has moved. The
preview checkout is pinned to the requested commit **in this branch's workflow
definition**. Important: GitHub executes the dispatched Pages workflow from
`main`, so its pinned-ref improvement only becomes active when the corresponding
`deploy-preview.yml` change is also promoted to `main`. Until then, `main`
still checks out the latest `chatgpt-dev` ref when deploying. Keep this
limitation in mind for closely spaced pushes.

## Scheduled and manual extended regression

`.github/workflows/regression-nightly.yml` checks out `chatgpt-dev` and runs
independent headless suites in parallel by topic plus an extended Playwright
Chromium suite. The planned schedule is 02:00 Taiwan time daily. GitHub
schedules and the standard Actions "Run workflow" control operate from the
default branch, so this schedule **does not activate** until the workflow file
exists on `main`. It can later be manually dispatched using a workflow ref
that exists in the repository once registered by GitHub Actions.

Until the workflow is merged to `main`, an on-demand run can be requested
by pushing a documentation/CI-only commit to `chatgpt-dev` whose message includes
`[extended-regression]`. Other pushes show skipped extended jobs. This does not
alter the pre-deployment gate or enable the daily schedule.

The extended workflow uses a per-branch concurrency group: a new run
cancels a still-running, superseded run from the same branch. Canceled
historical test runs are not counted as passes. The latest full set is
still required for an extended-regression verdict.

Extended tests are not silently treated as the pre-deployment gate. They are
additional coverage and can be expanded after failures are triaged. Browser
suites use Playwright 1.62.1 from `package-lock.json`.

## Cross-repository and manual checks

The complete local flow for both repositories, including the cross-repository tests excluded
below, is `npm run test:full`; see `docs/FULL_TEST_FLOW.md`.

The `Horios/DreamingAbyss-BalanceEditor` repository is private. End-to-end tests requiring
the separately checked-out editor or a deployment token are **not** included in
these self-contained jobs. The cross-repository tests `material-prices.test.cjs`,
`shop-options.test.cjs`, `timed-boosts-journal.test.cjs`, and
`progression-runtime.test.cjs` are intentionally excluded from independent
CI; they must be run from an environment with the separately checked-out
balance editor. Story tests keep their game-only checks, while the editor-only
case reports a skipped test when that fixture is unavailable. They need their own explicit permissions/credentials
before becoming an enforced gate. Do not insert a personal token into YAML.

Before promoting to production, also verify current and migrated saves, long
offline settlement, mobile fold/scroll behavior and balance JSON import/export.
These manual checks complement automation; successful CI is not proof of visual
or full gameplay coverage.
