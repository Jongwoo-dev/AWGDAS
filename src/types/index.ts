// ── 리터럴 유니온 타입 ────────────────────────────────────

/** 파일 변경 액션 종류. */
export type FileAction = "created" | "modified" | "deleted";

/** 게임 파일의 역할 분류. */
export type FileRole = "entry" | "core" | "feature" | "render" | "asset";

/** QA 판정 결과. */
export type Verdict = "PASS" | "REJECT";

/** 라운드 상태 머신의 페이즈. */
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

/** 단일 수락 기준 항목. */
export interface AcceptanceCriteria {
  /** 고유 식별자 (예: "AC-1") */
  id: string;
  description: string;
}

/** PL이 생성하는 라운드 스펙. 파이프라인 전체의 입력 계약이다. */
export interface RoundSpec {
  roundId: number;
  gameDescription: string;
  features: string[];
  acceptanceCriteria: AcceptanceCriteria[];
  /** 라운드 진행 중 변경 불가한 항목 목록 */
  scopeLock: string[];
  /** 최대 재시도 횟수 (기본 2) */
  maxRetries: number;
}

// ── Planner → Developer ──────────────────────────────────

/** 개별 기능의 분해 결과. */
export interface Feature {
  /** 고유 식별자 (예: "F-1") */
  id: string;
  name: string;
  description: string;
  /** 이 기능이 수정하는 파일 경로 목록 */
  targetFiles: string[];
  /** 고려해야 할 엣지 케이스 목록 */
  edgeCases: string[];
}

/** Planner가 생성하는 기능 분해 결과. */
export interface FeatureBreakdown {
  roundId: number;
  /** 생성할 파일 경로 목록 */
  fileStructure: string[];
  features: Feature[];
}

// ── Developer → QA ───────────────────────────────────────

/** Developer가 변경한 파일 정보. */
export interface ChangedFile {
  path: string;
  action: FileAction;
}

/** Developer의 구현 결과. */
export interface DevResult {
  roundId: number;
  implementedFeatures: string[];
  summary: string;
  changedFiles: ChangedFile[];
}

// ── QA → PL ──────────────────────────────────────────────

/** 개별 수락 기준에 대한 QA 검증 결과. */
export interface CriteriaResult {
  /** 수락 기준 식별자 (예: "AC-1") */
  criteriaId: string;
  pass: boolean;
  /** 판정 사유 (실패 시 재현 절차와 원인 포함) */
  reason: string;
}

/** QA 에이전트의 전체 검증 결과. */
export interface QAResult {
  roundId: number;
  verdict: Verdict;
  /** 매니페스트 파일 무결성 검증 통과 여부 */
  fileIntegrity: boolean;
  results: CriteriaResult[];
}

// ── 상태 관리 ────────────────────────────────────────────

/** 라운드의 현재 실행 상태. 불변 패턴으로 관리된다. */
export interface RoundState {
  roundId: number;
  retryCount: number;
  /** 다음 라운드로 이월된 작업 목록 */
  backlog: string[];
  phase: RoundPhase;
  currentSpec: RoundSpec | null;
  currentBreakdown: FeatureBreakdown | null;
  currentDevResult: DevResult | null;
  currentQAResult: QAResult | null;
}

// ── Manifest ─────────────────────────────────────────────

/** 매니페스트에 등록된 단일 파일 정보. */
export interface ManifestFile {
  path: string;
  role: FileRole;
  description: string;
}

/** 게임 출력 디렉토리의 파일 매니페스트. */
export interface Manifest {
  gameName: string;
  round: number;
  files: ManifestFile[];
}

// ── 파이프라인 통계 ──────────────────────────────────────

/** 파이프라인 실행 완료 후 집계되는 통계 정보. */
export interface PipelineStats {
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalApiCalls: number;
  /** QA 검증 실행 횟수 (초기 1회 + 재시도) */
  qaCycles: number;
  retryCount: number;
  /** 사람이 읽을 수 있는 소요 시간 문자열 (예: "2분 30초") */
  elapsed: string;
  elapsedMs: number;
}

// ── 에이전트 설정 ────────────────────────────────────────

/** 에이전트별 API 호출 설정. */
export interface AgentConfig {
  model: string;
  maxTokens: number;
  /** API 호출 타임아웃 (밀리초) */
  timeout: number;
}
