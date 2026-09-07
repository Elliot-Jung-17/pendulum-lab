# Pendulum Lab repository instructions

## Redesign stage trigger

These instructions apply when the user's request is exactly or substantially
`N단계`, `SNN`, `재설계 N단계`, or asks to execute a numbered redesign stage.

1. Read these files completely before changing anything:
   - `documents/redesign/README.md`
   - `documents/redesign/master-roadmap-ko.md`
   - `documents/redesign/execution-plan-ko.md`
   - `documents/redesign/curriculum-map-ko.md`
   - `documents/redesign/status.json`
2. Interpret an unqualified stage number as a stage in
   `documents/redesign/execution-plan-ko.md`.
3. Execute only that numbered stage. Do not begin later stages.
4. Verify that all dependency stages are complete in `status.json` and Git
   history. If they are not, stop and report the first missing stage.
5. Preserve the existing physics, chaos, research, validation, public API, and
   user data contracts unless the selected stage explicitly changes an adapter
   or versioned migration.
6. Never discard unrelated user changes. If the worktree contains unrelated
   modifications, stop and report them; do not stash, reset, restore, or delete
   them.
7. Work on `codex/redesign`. Never push directly to `master`, never force-push,
   and never merge without a separate explicit user request.
8. Run the stage's required tests. Do not commit or push a stage whose required
   tests fail.
9. Stage only files changed for the selected stage; do not use `git add -A`.
10. Update `documents/redesign/status.json` only after the implementation and
    required validation succeed. Include that update in the stage's final
    commit.
11. Make one to three focused commits using the messages prescribed by the
    execution plan, then push `codex/redesign` to `origin`.
12. Report the stage number, files changed, tests and results, commit hashes,
    push result, remaining risks, and the next valid stage.

If commit or push is blocked by credentials, network access, branch protection,
or a failed check, state exactly what completed and what did not. Never claim a
remote update without observing success.

For all other requests, follow the repository's normal contribution and test
policies. The redesign documents are planning inputs, not authority to modify
unrelated product behavior.
