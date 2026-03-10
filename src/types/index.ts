// ── 리터럴 유니온 타입 ────────────────────────────────────

export type FileAction = "created" | "modified" | "deleted";

export type FileRole = "entry" | "core" | "feature" | "render" | "asset";

export type Verdict = "PASS" | "REJECT";

export type RoundPhase =
  | "PL_INIT"
  | "PLANNER_DEFINE"
  | "DEV_IMPLEMENT"
  | "QA_REVIEW"
  | "RETRY_CHECK"
  | "RELEASE"
  | "DONE"
  | "FAILED";

// ── PL → Planner ─────────────────────────────────────────

export interface AcceptanceCriteria {
  id: string;
  description: string;
}

export interface RoundSpec {
  roundId: number;
  gameDescription: string;
  features: string[];
  acceptanceCriteria: AcceptanceCriteria[];
  scopeLock: string[];
  maxRetries: number;
}

// ── Planner → Developer ──────────────────────────────────

export interface Feature {
  id: string;
  name: string;
  description: string;
  targetFiles: string[];
  edgeCases: string[];
}

export interface FeatureBreakdown {
  roundId: number;
  fileStructure: string[];
  features: Feature[];
}

// ── Developer → QA ───────────────────────────────────────

export interface ChangedFile {
  path: string;
  action: FileAction;
}

export interface DevResult {
  roundId: number;
  implementedFeatures: string[];
  summary: string;
  changedFiles: ChangedFile[];
}

// ── QA → PL ──────────────────────────────────────────────

export interface CriteriaResult {
  criteriaId: string;
  pass: boolean;
  reason: string;
}

export interface QAResult {
  roundId: number;
  verdict: Verdict;
  fileIntegrity: boolean;
  results: CriteriaResult[];
}

// ── 상태 관리 ────────────────────────────────────────────

export interface RoundState {
  roundId: number;
  retryCount: number;
  backlog: string[];
  phase: RoundPhase;
  currentSpec: RoundSpec | null;
  currentBreakdown: FeatureBreakdown | null;
  currentDevResult: DevResult | null;
  currentQAResult: QAResult | null;
}

// ── Manifest ─────────────────────────────────────────────

export interface ManifestFile {
  path: string;
  role: FileRole;
  description: string;
}

export interface Manifest {
  gameName: string;
  round: number;
  files: ManifestFile[];
}

// ── 에이전트 설정 ────────────────────────────────────────

export interface AgentConfig {
  model: string;
  maxTokens: number;
  timeout: number;
}
