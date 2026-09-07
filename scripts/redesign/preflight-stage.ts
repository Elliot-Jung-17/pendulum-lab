/**
 * Read-only Git and status guard for a numbered redesign stage.
 * The caller must fetch origin/codex/redesign before running this command.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface RedesignStatus {
  branch: string;
  nextStage: number | null;
  lastCompletedStage: number;
  completedStages: number[];
  activeStage: number | null;
}

function fail(message: string): never {
  console.error(`redesign preflight FAILED: ${message}`);
  process.exit(1);
}

function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (error) {
    fail(`git ${args.join(' ')} failed: ${String(error)}`);
  }
}

const rawStage = process.argv[2];
if (rawStage === undefined) fail('usage: npm run redesign:preflight -- <stage-number>');
const requestedStage = Number(rawStage.replace(/^s/i, ''));
if (!Number.isInteger(requestedStage) || requestedStage < 1 || requestedStage > 30) {
  fail(`invalid stage number: ${rawStage}`);
}

const repositoryRoot = git('rev-parse', '--show-toplevel');
const branch = git('branch', '--show-current');
const worktree = git('status', '--porcelain');
const upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}');
const localHead = git('rev-parse', 'HEAD');
const remoteHead = git('rev-parse', 'origin/codex/redesign');

if (branch !== 'codex/redesign') fail(`current branch is ${branch || '(detached)'}`);
if (upstream !== 'origin/codex/redesign') fail(`upstream is ${upstream}`);
if (worktree.length > 0) fail('worktree is not clean; inspect it without stashing or resetting');
if (localHead !== remoteHead) {
  fail(`local HEAD ${localHead.slice(0, 12)} does not match origin ${remoteHead.slice(0, 12)}`);
}

let status: RedesignStatus;
try {
  status = JSON.parse(readFileSync(`${repositoryRoot}/documents/redesign/status.json`, 'utf8')) as RedesignStatus;
} catch (error) {
  fail(`cannot read status.json: ${String(error)}`);
}

if (status.branch !== 'codex/redesign') fail(`status expects branch ${status.branch}`);
if (status.nextStage !== requestedStage) {
  fail(`requested S${String(requestedStage).padStart(2, '0')}, next is ${String(status.nextStage)}`);
}
if (status.activeStage !== null && status.activeStage !== requestedStage) {
  fail(`active stage is S${String(status.activeStage).padStart(2, '0')}`);
}

const expectedCompleted = Array.from({ length: status.lastCompletedStage }, (_, index) => index + 1);
if (status.completedStages.join(',') !== expectedCompleted.join(',')) {
  fail('completed stage history is not contiguous');
}

console.log(
  `redesign preflight ok: S${String(requestedStage).padStart(2, '0')} at ${localHead.slice(0, 12)} in ${repositoryRoot}`
);
