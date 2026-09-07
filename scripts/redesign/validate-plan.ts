/**
 * Machine-check the redesign control documents before a numbered stage starts.
 * This script is intentionally read-only and does not inspect product behavior.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface RedesignStatus {
  schemaVersion: string;
  planVersion: string;
  branch: string;
  executionProfile: {
    model: string;
    reasoningEffort: string;
    selectedByUser: boolean;
  };
  totalStages: number;
  lastCompletedStage: number;
  nextStage: number | null;
  completedStages: number[];
  blockedStage: number | null;
  activeStage: number | null;
  activeStageCheckpoint: string | null;
  reviewGates: number[];
  approvedReviewGates: number[];
}

const root = process.cwd();
const files = {
  agents: 'AGENTS.md',
  readme: 'documents/redesign/README.md',
  roadmap: 'documents/redesign/master-roadmap-ko.md',
  plan: 'documents/redesign/execution-plan-ko.md',
  curriculum: 'documents/redesign/curriculum-map-ko.md',
  protocol: 'documents/redesign/stage-run-protocol-ko.md',
  status: 'documents/redesign/status.json'
} as const;

function fail(message: string): never {
  console.error(`redesign plan check FAILED: ${message}`);
  process.exit(1);
}

function read(relativePath: string): string {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) fail(`missing ${relativePath}`);
  return readFileSync(absolutePath, 'utf8');
}

const documents = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => [key, read(relativePath)])
) as Record<keyof typeof files, string>;

let status: RedesignStatus;
try {
  status = JSON.parse(documents.status) as RedesignStatus;
} catch (error) {
  fail(`invalid status.json: ${String(error)}`);
}

const stageMatches = [...documents.plan.matchAll(/^### S(\d{2}) —/gm)];
const stageIds = stageMatches.map((match) => Number(match[1]));
const expectedStageIds = Array.from({ length: 30 }, (_, index) => index + 1);
if (stageIds.join(',') !== expectedStageIds.join(',')) {
  fail(`stage sequence is ${stageIds.join(',')}, expected 1..30`);
}

const requiredStageLabels = ['의존성', '목표', '구현', '주요 경로', '검증', '완료 게이트', '권장 commit'];
for (const [index, match] of stageMatches.entries()) {
  const start = (match.index ?? 0) + match[0].length;
  const end = stageMatches[index + 1]?.index ?? documents.plan.indexOf('\n## 6.', start);
  const body = documents.plan.slice(start, end < 0 ? undefined : end);
  for (const label of requiredStageLabels) {
    if (!body.includes(`**${label}:**`)) {
      fail(`S${match[1]} is missing ${label}`);
    }
  }
}

const summaryRows = [...documents.plan.matchAll(/^\| S(\d{2}) \|/gm)].map((match) => Number(match[1]));
if (summaryRows.join(',') !== expectedStageIds.join(',')) {
  fail('stage dependency summary must contain S01..S30 exactly once');
}

const unitIds = [...documents.curriculum.matchAll(/^\| ([1-8]\.\d{1,2}) \|/gm)].map((match) => match[1] ?? '');
if (unitIds.length !== 86 || new Set(unitIds).size !== 86) {
  fail(`curriculum must contain 86 unique units, found ${unitIds.length}/${new Set(unitIds).size}`);
}

const expectedCourseCounts = [8, 9, 9, 10, 13, 12, 13, 12];
for (const [index, expected] of expectedCourseCounts.entries()) {
  const course = index + 1;
  const actual = unitIds.filter((id) => id.startsWith(`${course}.`)).length;
  if (actual !== expected) fail(`course ${course} has ${actual} units, expected ${expected}`);
}

if (status.schemaVersion !== 'pendulum-redesign-status/v2') fail('unexpected status schema');
if (status.planVersion !== '2.1') fail('status planVersion must be 2.1');
if (status.branch !== 'codex/redesign') fail('status branch must be codex/redesign');
if (status.executionProfile.model !== 'gpt-6-astra') fail('execution model must be gpt-6-astra');
if (status.executionProfile.reasoningEffort !== 'ultra') fail('reasoning effort must be ultra');
if (!status.executionProfile.selectedByUser) fail('execution profile must record user selection');
if (status.totalStages !== 30) fail('status totalStages must be 30');

const expectedCompleted = Array.from({ length: status.lastCompletedStage }, (_, index) => index + 1);
if (status.completedStages.join(',') !== expectedCompleted.join(',')) {
  fail('completedStages must be the contiguous sequence through lastCompletedStage');
}
const expectedNext = status.lastCompletedStage === 30 ? null : status.lastCompletedStage + 1;
if (status.nextStage !== expectedNext) fail(`nextStage must be ${String(expectedNext)}`);
if (status.blockedStage !== null && status.blockedStage !== status.nextStage) {
  fail('blockedStage must be null or the next stage');
}
if (status.activeStage !== null && status.activeStage !== status.nextStage) {
  fail('activeStage must be null or the next stage');
}
if (status.activeStage === null && status.activeStageCheckpoint !== null) {
  fail('activeStageCheckpoint requires activeStage');
}

const expectedReviewGates = [7, 9, 17, 24, 28];
if (status.reviewGates.join(',') !== expectedReviewGates.join(',')) {
  fail('reviewGates must be 7,9,17,24,28');
}
if (status.approvedReviewGates.some((stage) => !status.reviewGates.includes(stage))) {
  fail('approvedReviewGates contains a non-review stage');
}
if (status.approvedReviewGates.some((stage) => stage > status.lastCompletedStage)) {
  fail('approvedReviewGates contains an incomplete stage');
}

const requiredAgentPhrases = [
  'Desktop roadmap copies are transport copies',
  'Fetch `origin/codex/redesign`',
  'never use `git add -A`',
  'A stage counts as complete only when the status commit is present',
  'never fabricate a human or expert review'
];
const normalizedAgents = documents.agents.replace(/\s+/g, ' ').toLowerCase();
for (const phrase of requiredAgentPhrases) {
  if (!normalizedAgents.includes(phrase.toLowerCase())) {
    fail(`AGENTS.md is missing safety rule: ${phrase}`);
  }
}

for (const documentName of ['roadmap', 'plan', 'curriculum', 'protocol'] as const) {
  if (!documents[documentName].includes('v2.1')) fail(`${files[documentName]} is not plan v2.1`);
}

console.log(
  `redesign plan check ok: ${stageIds.length} stages, ${unitIds.length} unique units, next S${String(status.nextStage ?? 30).padStart(2, '0')}`
);
