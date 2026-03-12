# AWGDAS

**Autonomous Web Game Dev Agent System**

사용자가 게임 아이디어를 입력하면, 멀티 에이전트 시스템이 자율적으로 기획 → 개발 → QA → 배포까지 완료하는 자동화 파이프라인.

---

## 프로젝트 목적

AWGDAS는 **결과물(게임)이 아닌, 자율 에이전트 조직이 안정적으로 작동하는 구조를 설계**하는 데 목적이 있다.

구체적으로 다음 기술적 과제를 다룬다:

- **자율 루프 제어** — 기획↔개발↔QA 반복에서 무한 루프와 스코프 확장을 방지하고, 정의된 완료 조건(DoD)을 충족하면 자동 종료
- **명세 기반 개발** — Round Spec을 Single Source of Truth로 사용해 모든 판단을 문서화된 기준에 고정
- **검증 가능한 품질 게이트** — 추상적 평가("잘 동작한다") 대신 Yes/No 판정이 가능한 Acceptance Criteria로 통과 여부 결정
- **불변 상태 머신** — 에이전트 간 상태 전이를 순수 함수 기반 FSM으로 관리하여 예측 가능한 파이프라인 흐름 보장

---

## 아키텍처

### 에이전트 파이프라인

```
사용자 입력
    │
    ▼
┌─────────┐    RoundSpec     ┌──────────┐   FeatureBreakdown  ┌───────────┐
│   PL    │ ──────────────▶  │ Planner  │ ──────────────────▶ │ Developer │
│(관리자) │                  │ (설계자) │                     │ (구현자)  │
└─────────┘                  └──────────┘                     └───────────┘
    ▲                                                              │
    │  QAResult                                          DevResult │
    │  (PASS/REJECT)                                               ▼
    │                                                        ┌──────────┐
    └─────────────────────────────────────────────────────── │    QA    │
                                                             │ (검증자) │
                                                             └──────────┘
```

### 에이전트 간 데이터 계약

에이전트 간 전달되는 데이터는 TypeScript 인터페이스로 엄격하게 정의된다. 런타임에도 `parseAndValidate`로 필수 필드 존재를 검증하여 계약 위반을 조기에 감지한다.

```
PL ──RoundSpec──▶ Planner ──FeatureBreakdown──▶ Developer ──DevResult──▶ QA ──QAResult──▶ PL
```

| 인터페이스 | 핵심 필드 | 용도 |
|-----------|----------|------|
| `RoundSpec` | features, acceptanceCriteria, scopeLock, maxRetries | PL이 Round의 범위와 완료 기준을 정의 |
| `FeatureBreakdown` | fileStructure, features[].targetFiles, edgeCases | Planner가 기능을 파일 단위로 분해 |
| `DevResult` | implementedFeatures, changedFiles[] | Developer가 구현 결과를 보고 |
| `QAResult` | verdict(PASS/REJECT), fileIntegrity, results[] | QA가 AC 기반 판정 결과를 보고 |

### 상태 머신

8-phase 불변 FSM으로 파이프라인 흐름을 제어한다. 전이는 순수 함수 `transition(state, nextPhase)`로만 수행되며, 유효하지 않은 전이는 즉시 예외를 발생시킨다.

```
PL_INIT → PLANNER_DEFINE → DEV_IMPLEMENT → QA_REVIEW
                                                ↓
                                [PASS] → RELEASE → DONE
                                [REJECT] → RETRY_CHECK → DEV_IMPLEMENT (최대 2회)
                                                    ↓ (초과)
                                                  FAILED
```

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 언어 | TypeScript (strict mode) |
| 런타임 | Node.js (ESM) |
| AI SDK | Anthropic SDK — streaming, tool_use |
| 테스트 | Vitest |
| 빌드 | tsc (NodeNext module resolution) |

---

## 주요 기술적 결정

### API 호출: Streaming + Tool Use

- **PL, Planner, QA** — `messages.stream()` → 텍스트 응답을 JSON 파싱
- **Developer만** — `tool_use` 모드로 `write_file`/`read_file`/`delete_file` 도구를 제공하여 파일 시스템을 직접 조작. 최대 50회 tool loop를 허용하며, `end_turn`으로 종료 시 DevResult를 반환

### JSON 응답 파싱: 단계적 복구

LLM 응답이 항상 깨끗한 JSON이 아닌 문제를 해결하기 위해, 직접 파싱 실패 시 다음 복구를 순차 시도한다:

- Markdown code fence (` ```json ``` `) 내부 추출
- 부분 JSON 복구 — trailing comma 제거 + 스택 기반 truncated JSON 닫기
- 첫 `{` ~ 마지막 `}` 범위 추출 (앞뒤 설명 텍스트 제거)

파싱 후 `validateFields`로 필수 필드 존재를 런타임 검증한다. 모든 시도 실패 시 `ResponseParseError`에 raw text를 포함하여 디버깅을 돕는다.

### 에러 핸들링 + Graceful Shutdown

- **재시도** — transient 에러(network, rate limit, 5xx)에 한해 3회 재시도 + exponential backoff (1s→2s→4s). 비복구 에러(인증, bad request)는 즉시 실패
- **에러 분류** — 모든 API 에러를 `AgentCallError(role, category, originalError)`로 래핑. category는 `network`/`api`/`timeout`/`unknown` 4종으로, 상위에서 에러 종류별 분기 처리 가능
- **타임아웃** — 에이전트별 AbortController로 streaming hang 방지 (PL: 30s, Developer: 10min 등)
- **Graceful Shutdown** — SIGINT 시 global AbortController를 abort하여 진행 중인 스트림 취소. 두 번째 SIGINT로 강제 종료

### manifest.json 기반 파일 추적

Developer가 파일을 생성/수정/삭제할 때마다 `manifest.json`을 즉시 갱신한다. QA는 manifest를 기반으로 무결성 검증(모든 파일 존재 확인)을 수행하고, 누락 시 verdict를 강제 REJECT한다. 이를 통해 Developer의 "파일을 만들었다"는 보고와 실제 파일 시스템 상태의 불일치를 감지한다.

### 테스트 전략

| 레벨 | 범위 | 방식 |
|------|------|------|
| 유틸리티 단위 | 상태 머신, 파일 I/O, manifest, JSON 파싱 | 순수 함수 테스트 |
| 에이전트 단위 | PL, Planner, Developer, QA 각각 | API mock (`vi.mock`) 기반 |
| 파이프라인 통합 | PL→Planner→Dev→QA 데이터 계약 | 실제 상태 머신 + 에이전트 mock |
| E2E | 전체 파이프라인 (PASS/RETRY/FAIL) | 실제 API 호출 |

---

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경변수 설정
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 3. 빌드 + 실행
npm run build && npm start
# 또는 개발 모드
npm run dev
```

실행 후 게임 설명을 입력하면 파이프라인이 자율로 동작합니다.

```
게임 설명을 입력하세요: 클릭 카운터 게임
```

---

## 환경변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `ANTHROPIC_API_KEY` | **필수** | — | Anthropic API 키 |
| `AWGDAS_MODEL` | 선택 | `claude-opus-4-6` | 사용할 Claude 모델 |

---

## 프로젝트 구조

```
src/
├── agents/                    # 에이전트 구현
│   ├── plAgent.ts                 # PL — Round Spec 생성, QA 판정, FAIL 리포트
│   ├── plannerAgent.ts            # Planner — Feature Breakdown 생성
│   ├── developerAgent.ts          # Developer — tool_use 루프, 파일 I/O
│   ├── qaAgent.ts                 # QA — manifest 무결성 + AC 판정
│   └── prompts/                   # 에이전트별 system prompt
├── types/index.ts             # 공유 인터페이스 (RoundSpec, DevResult 등)
├── utils/
│   ├── anthropicClient.ts         # API 클라이언트 (재시도, AbortController, AgentCallError)
│   ├── responseParser.ts          # JSON 단계적 복구 + 필드 검증
│   ├── roundStateMachine.ts       # 불변 FSM (transition, canRetry)
│   ├── fileManager.ts             # 게임 파일 I/O
│   ├── manifest.ts                # manifest.json CRUD
│   └── logger.ts                  # 구조화 로거
└── index.ts                   # 진입점 — 파이프라인 루프 + graceful shutdown
```

---

## 출력 결과물

생성된 게임은 `output/{game-name}/` 디렉토리에 저장됩니다. 브라우저에서 `index.html`을 열어 실행합니다.

```
output/{game-name}/
  ├── index.html       # 게임 진입점
  ├── js/              # JavaScript 모듈
  ├── manifest.json    # 파일 목록 + 역할 메타데이터
  └── README.md        # 게임 실행 방법
```

---

## 테스트

```bash
# 단위 + 통합 테스트
npm test

# E2E 테스트 (실제 API 호출, ANTHROPIC_API_KEY 필요)
npm run test:e2e

# 타입 체크
npm run typecheck
```

---

## 주요 정책

- **Retry** — 기능별 최대 2회 재시도, 초과 시 FAIL 처리
- **Scope Lock** — Round 시작 후 기능 추가/변경 금지, 제안은 Backlog에만 기록
- **Definition of Done** — 모든 AC PASS + QA 명시적 PASS + console.error 없음
- **Graceful Shutdown** — Ctrl+C로 진행 중인 API 스트림을 안전하게 취소

상세 스펙: [`docs/system-design.md`](docs/system-design.md)
