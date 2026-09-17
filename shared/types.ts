export interface RefState {
  name: string;
  target: string;
}

export interface HeadState {
  symbolic: string | null;
  commit: string | null;
  detached: boolean;
}

export interface ModelledState {
  head: HeadState;
  refs: RefState[];
  indexDigest: string;
  stagedEntries: string[];
  worktreeDigest: string;
  worktreeEntries: string[];
}

export interface CommitNode {
  sha: string;
  parents: string[];
  subject: string;
  author: string;
  authoredAt: string;
  refs: string[];
}

export interface GraphData {
  commits: CommitNode[];
  head: HeadState | null;
}

export interface RefChange {
  name: string;
  before: string | null;
  after: string | null;
}

export interface PathChange {
  path: string;
  before: string;
  after: string;
}

export interface HeadChange {
  before: string | null;
  after: string | null;
  commitBefore: string | null;
  commitAfter: string | null;
  detachedBefore: boolean;
  detachedAfter: boolean;
}

export interface CountChange {
  before: number;
  after: number;
}

export interface ChangeSet {
  empty: boolean;
  refs: RefChange[];
  head: HeadChange;
  indexChanged: boolean;
  indexCounts: CountChange;
  staged: PathChange[];
  worktreeChanged: boolean;
  worktreeCounts: CountChange;
  worktree: PathChange[];
  commitsAdded: string[];
  commitsRemoved: string[];
}

export type FingerprintSurface =
  | "config"
  | "reflog"
  | "object-store"
  | "packed-refs"
  | "commit-graph";

export interface SideEffectBadge {
  surface: FingerprintSurface;
  label: string;
  detail: string;
  blocking: boolean;
}

export interface Caveat {
  id: string;
  label: string;
  detail: string;
}

export interface Fingerprints {
  configHash: string;
  reflogTips: Record<string, string>;
  objectCount: number;
  inPackCount: number;
  packedRefsHash: string | null;
  commitGraphMtimeMs: number | null;
}

export interface OriginSnapshot {
  takenAt: number;
  state: ModelledState;
}

export interface StaticDisqualifiers {
  submodules: boolean;
  lfs: boolean;
  linkedWorktrees: number;
}

export interface DynamicDisqualifiers {
  operation: string | null;
}

export interface RepoConnectResult {
  path: string;
  name: string;
  state: ModelledState;
  graph: GraphData;
  staticDisqualifiers: StaticDisqualifiers;
  dynamicDisqualifiers: DynamicDisqualifiers;
  untracked: string[];
  ignored: string[];
  caveats: Caveat[];
}

export type ToolErrorCause =
  | "clone-failed"
  | "mirror-failed"
  | "sandbox-unavailable"
  | "network-reachable"
  | "timeout"
  | "output-capped";

export interface OutcomeBase {
  display: string;
  args: string[] | null;
  changeSet: ChangeSet | null;
  graphBefore: GraphData | null;
  graphAfter: GraphData | null;
  sideEffects: SideEffectBadge[];
  blockingAnomaly: boolean;
  fidelityWarnings: string[];
  caveats: Caveat[];
  originSnapshot: OriginSnapshot | null;
  stdout: string;
  stderr: string;
}

export interface PreviewOutcome extends OutcomeBase {
  kind: "preview";
}

export interface ConflictStopOutcome extends OutcomeBase {
  kind: "conflict-stop";
  operation: string;
  step: string | null;
  paths: string[];
}

export interface PauseStopOutcome extends OutcomeBase {
  kind: "pause-stop";
  step: string | null;
  action: string;
}

export interface FailureOutcome extends OutcomeBase {
  kind: "failure";
  exitCode: number;
  explanation: string | null;
}

export interface RefusalOutcome extends OutcomeBase {
  kind: "refusal";
  code: string;
  reason: string;
  alternative: string | null;
}

export interface ToolErrorOutcome extends OutcomeBase {
  kind: "tool-error";
  cause: ToolErrorCause;
  reason: string;
  nextStep: string;
}

export type RehearsalOutcome =
  | PreviewOutcome
  | ConflictStopOutcome
  | PauseStopOutcome
  | FailureOutcome
  | RefusalOutcome
  | ToolErrorOutcome;

export interface StalenessResult {
  stale: boolean;
  changed: string[];
}

export interface PreviewRequest {
  path: string;
  command: string;
  sequence?: string | null;
}

export interface ConnectRequest {
  path: string;
}

export interface StalenessRequest {
  path: string;
  snapshot: ModelledState;
}

export interface ApiError {
  error: string;
}

export interface SandboxHealth {
  ok: boolean;
  method: string | null;
  cause: ToolErrorCause | null;
  reason: string;
  nextStep: string;
}

export interface HealthResult {
  ok: boolean;
  sandbox: SandboxHealth;
}
