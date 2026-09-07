# Pendulum Lab repository instructions

## Redesign stage trigger

These instructions apply only when the user's request is exactly or
substantially `N단계`, `SNN`, `재설계 N단계`, or asks to execute a numbered
redesign stage. A question that merely mentions a stage is not an execution
request.

The user may attach the repository folder plus desktop copies of the roadmap
and execution plan without knowing which Git branch is active. In that case,
perform the repository and branch preflight below automatically. Do not ask the
user to operate Git unless safe automatic recovery is impossible.

### Authoritative inputs

1. Locate the explicitly attached `pendulum_lab_modular` Git repository. Files
   under `documents/redesign/` in that repository are authoritative. Desktop
   roadmap copies are transport copies and never override the repository.
2. Read these files completely before changing anything:
   - `documents/redesign/README.md`
   - `documents/redesign/master-roadmap-ko.md`
   - `documents/redesign/execution-plan-ko.md`
   - `documents/redesign/curriculum-map-ko.md`
   - `documents/redesign/stage-run-protocol-ko.md`
   - `documents/redesign/status.json`
3. Interpret an unqualified stage number as a stage in
   `documents/redesign/execution-plan-ko.md`.

### Automatic safe preflight

1. Resolve the repository root with Git; do not infer it from a document's
   location.
2. Inspect the current branch, worktree, HEAD, upstream, and `status.json`.
3. If unrelated modifications exist, stop and report them. Never stash, reset,
   restore, clean, delete, or overwrite user work.
4. Fetch `origin/codex/redesign`. If the working tree is clean, automatically
   switch to the existing local `codex/redesign`, or create a tracking branch
   from `origin/codex/redesign` when only the remote branch exists. Never create
   it from `master` when the remote redesign branch cannot be found.
5. Require local HEAD and `origin/codex/redesign` to match. A clean branch that
   is only behind may be fast-forwarded. If it is ahead because a prior push
   failed, recover that same stage first. If it has diverged or the extra
   commits cannot be proven to belong to the active stage, stop and report.
6. Run `npm run redesign:check` and
   `npm run redesign:preflight -- <stage-number>` after fetching and selecting
   the branch.

### Stage execution rules

1. Execute only the requested stage. Do not begin later stages.
2. Verify all dependency stages in `status.json`, Git history, and required
   artifacts. Stop at the first missing dependency.
3. Preserve existing physics, chaos, research, runtime, workers, validation,
   public APIs, and user data unless the selected stage explicitly introduces
   a tested adapter or versioned migration.
4. Prefer the user's selected `GPT-6 Astra` with `Ultra` reasoning for these
   stages. Never claim to have changed or verified the app's model selector
   when the runtime does not expose it, and never silently substitute a model
   if the user explicitly selected one.
5. For a large stage, create the stage progress record required by
   `stage-run-protocol-ko.md`, work through its internal checkpoints, and make
   bounded checkpoint commits. The user still needs to request the stage only
   once.
6. Run the stage's required tests. Do not publish a checkpoint whose required
   targeted tests fail, and do not complete a stage while any required test
   fails.
7. Stage only files changed for the selected checkpoint; never use
   `git add -A`.
8. Push validated implementation checkpoint commits before marking the stage
   complete. Then update `status.json` in a final status commit and push again.
   A stage counts as complete only when the status commit is present on
   `origin/codex/redesign`.
9. If the final status push fails, do not start the next stage. On the next
   request, recover and verify that push first.
10. Never push directly to `master`, force-push, merge, tag, release, or delete
    a branch without a separate explicit user request.
11. At S07, S09, S17, S24, and S28, provide the review checklist defined by the
    protocol. Requesting the next stage after receiving that report counts as
    the user's checkpoint approval; never fabricate a human or expert review.
12. After changing authoritative roadmap documents, synchronize the two known
    desktop transport copies when that desktop is accessible, then verify their
    hashes. Failure to copy them does not override repository truth but must be
    reported.
13. Report the stage, checkpoints, changed files, tests, commit hashes, both
    push results, preservation impact, review status, remaining risks, and next
    valid stage.

If credentials, network access, branch protection, model availability, an
approval gate, or a failed check blocks progress, state exactly what completed
and what did not. Never claim a remote update or human review without direct
evidence.

For all other requests, follow normal repository policies. The redesign
documents are planning inputs and do not authorize unrelated product changes.
