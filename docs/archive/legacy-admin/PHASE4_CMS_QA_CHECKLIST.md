# Phase 4 CMS QA Checklist

> [!WARNING]
> **Historical Document**: Do not use as current Git/deployment guidance.
> The current authoritative B3 workflow is defined by `AGENTS.md`,
> `docs/b3/ARCHITECTURE_FREEZE_V1.md`, and current repository instructions.

## Reporter
- Sign in as a `reporter` and confirm the sidebar shows `My Work`, `My Articles`, `My Stories`, and `Media`, but not `Review Queue`.
- Open `My Work` and confirm the summary cards show `My Drafts`, `Waiting On Desk`, `Needs Changes`, and `Assigned To Me`.
- Open an article in `changes_requested` and confirm the top workflow panel shows:
  - a highlighted desk note
  - `Ready to resubmit`
  - a clear `Next action`
- Open a story in `submitted` or `assigned` and confirm the top workflow panel shows `With desk`.
- Confirm story edit shows `Recent Workflow Notes`.
- Create a new story and confirm the author field is prefilled from the signed-in reporter account.
- Create a new article and confirm category creation is not available to the reporter.

## Copy Editor
- Sign in as a `copy_editor` and confirm `Review Queue`, `Copy Desk`, `My Work`, `Articles`, `Stories`, `Videos`, and `Media` are available.
- Open an assigned article and story and confirm the workflow summary reflects copy-desk states like `Copy Desk`, `Needs Changes`, or `Ready For Approval`.
- Add a copy-editor note / return-for-changes reason and confirm it becomes the highlighted desk feedback for the reporter view.
- Confirm `Recent Workflow Notes` appears on both article and story edit screens.
- Confirm copy editor cannot publish content directly.

## Admin
- Sign in as `admin` and confirm `Review Queue` is available and reporter-only shortcuts are not shown.
- Confirm admin can still create categories and directly publish article/story content.
- Confirm the public latest articles feed only shows workflow-`published` articles.
- Confirm unpublished article URLs return `404`.

## Regression Checks
- Verify plain `git push` now targets `zaid2` locally, not the old `origin`.
- Verify the old live repo remains configured as `origin` but is only used when explicitly requested.
- Run:
  - `npm test -- tests/article-workflow-overview.test.ts tests/workflow-feedback.test.ts tests/permissions-governance.test.ts tests/newsroom-metadata.test.ts tests/api/admin-articles-route.test.ts tests/api/admin-categories-route.test.ts tests/api/public-articles-routes.test.ts tests/server-articles-publication.test.ts tests/metadata-routes.test.ts`
  - `npm run typecheck`
