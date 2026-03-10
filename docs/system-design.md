# AWGDAS 시스템 설계 문서

에이전트 역할, Round 상태 머신, 정책 규칙 등 시스템 동작 스펙을 정의한다.

---

## 1. 시스템 개요

```
사용자 입력 → PL이 Round Spec 생성 → Planner → Developer → QA 자동 루프 → DoD 충족 시 종료
```

---

## 2. 에이전트 역할 및 제약

### 2.1 PL (Project Lead)

책임:
- Round Spec 생성
- Scope Lock 정의
- Acceptance Criteria 정의
- Retry Policy 관리
- QA 결과 기반 종료 판단
- git commit 실행 (유일한 커밋 권한)

금지:
- 기능 직접 구현
- Scope 임의 확장

---

### 2.2 Planner

책임:
- 게임 기능 분해
- Feature Breakdown 작성
- 엣지케이스 정의

금지:
- Scope 외 기능 제안 (개선 아이디어는 Backlog에만 기록)

---

### 2.3 Developer

책임:
- 현재 단계 기능 구현
- 파일 수정
- 변경사항 요약 작성

금지:
- Scope 외 코드 수정
- 리팩토링
- TODO 작성

---

### 2.4 QA

책임:
- Acceptance Criteria 기반 Pass/Reject 판단
- Reject 시 명시: 실패 항목 ID + 재현 절차 + 원인 설명

금지:
- 개선 제안
- 추상적 판단

---

## 3. Round 상태 머신

```
PL_INIT
   ↓
PLANNER_DEFINE
   ↓
DEV_IMPLEMENT
   ↓
QA_REVIEW
   ↓
[PASS] → RELEASE → DONE
[REJECT] → RETRY_CHECK → DEV_IMPLEMENT
```

---

## 4. Retry Policy

- 기능별 최대 재시도: **2회**
- 초과 시 PL은 다음 중 선택:
  - Scope 축소
  - 해당 기능 FAIL 처리
  - 라운드 종료
- 무한 루프 금지

---

## 5. Scope Lock Policy

Round 시작 후 고정:
- 기능 추가 금지
- 성능/UI 개선 금지
- 리팩토링 금지
- 추가 제안 → Backlog에만 기록

---

## 6. Acceptance Criteria 규칙

AC는 반드시 Yes/No 판단 가능해야 한다.

**허용 예:**
- 플레이어는 방향키로 이동한다.
- 플레이어는 화면 밖으로 나가지 않는다.
- 충돌 시 점수가 증가한다.

**금지 예:**
- 자연스럽게 움직인다.
- 보기 좋다.
- 잘 동작한다.

---

## 7. Definition of Done

다음을 모두 만족해야 Round 종료:

1. 모든 Acceptance Criteria PASS
2. QA 명시적 PASS 선언
3. 재시도 ≤ 2회
4. `console.error` 발생 없음
5. TODO 없음
6. 생성된 게임의 README에 실행 방법 존재

충족 시 → PL은 즉시 RELEASE 전환 후 git commit 실행

---

## 8. Git Policy

- 커밋은 PL만 실행
- 커밋 메시지 형식:

```
feat(round-{id}): {요약}

- 기능1
- 기능2

QA: PASS
Retry: {횟수}
```

---

## 9. 자동 종료 규칙

PL은 다음을 절대 수행하지 않는다:
- 추가 기능 자동 제안
- 기능 확장
- 리팩토링 지시

라운드 완료 시 반드시 종료한다.
추가 기능은 **사용자 입력으로만** 시작한다.

---

## 10. Backlog 처리

Backlog는 기록만 가능하다.
현재 Round에서 절대 구현하지 않는다.

---

## 11. Safety Constraints

- 무한 루프 방지
- 상태 로그 유지
- 실패 시 요약 리포트 생성
- 자동 중단 가능

---

## 12. 실행 모드

완전 자율 모드:
- 사용자 개입 없이 Round 종료까지 진행
- 종료 후 사용자 입력 대기

---

## 13. Output 파일 전략

### 13.1 파일 분리 원칙

Developer는 단일 HTML 파일이 아닌 분리된 파일 구조로 게임을 생성한다.
이유: 에이전트 간 선택적 파일 읽기를 가능하게 하여 토큰 소비를 절감한다.

### 13.2 기본 디렉토리 구조

```
output/{game-name}/
  ├── index.html          # HTML 구조 + 스크립트 로딩
  ├── js/
  │   ├── main.js         # 진입점, 게임 루프
  │   ├── player.js       # 플레이어 로직
  │   ├── renderer.js     # 렌더링
  │   └── input.js        # 입력 처리
  ├── manifest.json       # 파일 목록 + 역할 설명
  └── README.md           # 실행 방법
```

### 13.3 manifest.json 스키마

Developer는 파일 생성/수정 시 manifest.json을 함께 갱신한다.

```json
{
  "gameName": "space-shooter",
  "round": 1,
  "files": [
    {
      "path": "index.html",
      "role": "entry",
      "description": "HTML 구조 및 스크립트 로딩"
    },
    {
      "path": "js/main.js",
      "role": "core",
      "description": "게임 루프, 초기화"
    }
  ]
}
```

role 종류:
- `entry` — HTML 진입점
- `core` — 게임 루프, 초기화 등 핵심 로직
- `feature` — 개별 기능 모듈
- `render` — 렌더링 전담
- `asset` — 정적 리소스

### 13.4 에이전트별 활용

- **Developer**: 파일 생성/수정 후 manifest.json 갱신
- **QA**: manifest.json을 먼저 읽고, 검토 대상 파일만 선택적으로 읽기
- **Developer (Retry)**: QA의 Reject 사유 + manifest.json으로 수정 대상 파일만 파악

---
## 14. 에이전트 간 데이터 전달 형식

```typescript
interface RoundSpec { // PL → Planner
  roundId: number; gameDescription: string; features: string[];
  acceptanceCriteria: { id: string; description: string }[];
  scopeLock: string[]; maxRetries: number;
}
interface FeatureBreakdown { // Planner → Developer
  roundId: number; fileStructure: string[];
  features: { id: string; name: string; description: string; targetFiles: string[]; edgeCases: string[] }[];
}
interface DevResult { // Developer → QA
  roundId: number; implementedFeatures: string[]; summary: string;
  changedFiles: { path: string; action: "created" | "modified" | "deleted" }[];
}
interface QAResult { // QA → PL
  roundId: number; verdict: "PASS" | "REJECT"; fileIntegrity: boolean;
  results: { criteriaId: string; pass: boolean; reason: string }[];
}
```

---
## 15. API 호출 방식
- 기본 모델: `claude-opus-4-6` (`AWGDAS_MODEL`로 오버라이드, Key: `ANTHROPIC_API_KEY`)
- system prompt: 역할 정의 → 금지 사항(섹션 2) → 입출력 스키마 → JSON 응답 지시
- tool_use: **Developer만** 파일 쓰기에 사용, 나머지는 텍스트 응답
- max_tokens — PL: 4096, Planner: 16384, Developer: 32768, QA: 16384
- 타임아웃 — PL: 30s, Planner: 60s, Developer: 120s, QA: 60s

---
## 16. 상태 관리
메모리 내 객체로 관리 (파일 저장 안 함). 상태 전환은 **PL만** 수행.

```typescript
interface RoundState {
  roundId: number; retryCount: number; backlog: string[];
  phase: "PL_INIT"|"PLANNER_DEFINE"|"DEV_IMPLEMENT"|"QA_REVIEW"|"RETRY_CHECK"|"RELEASE"|"DONE"|"FAILED";
  currentSpec: RoundSpec | null; currentBreakdown: FeatureBreakdown | null;
  currentDevResult: DevResult | null; currentQAResult: QAResult | null;
}
```
전환은 섹션 3 상태 머신 준수. `FAILED`는 섹션 3에 미표기된 확장 상태로, 섹션 4 Retry 초과 시 진입한다. PASS→`RELEASE`→`DONE`, REJECT→`RETRY_CHECK`→재시도 가능 시 `DEV_IMPLEMENT`/초과 시 `FAILED`.

---
## 17. 에러 핸들링
- **API 에러**: 최대 3회 재시도, exponential backoff (1s→2s→4s). 초과 시 PL에 실패 보고
- **파일 I/O 실패**: 즉시 throw, PL이 Round를 `FAILED`로 전환
- **FAIL 리포트**: `[ROUND {id} FAILED] Phase:{phase} | Retry:{n}/{max} | Reason:{요약} | Failed:{AC ID}`

---
## 18. manifest.json 갱신 규칙
- **최초 생성**: 첫 파일 생성과 동시 (파일 없이 단독 생성 금지)
- **갱신**: 파일 추가→항목 추가, 수정→description 갱신, 삭제→항목 제거. `round`은 현재 roundId
- **QA 무결성 검증**: manifest 내 모든 파일 존재 확인. 누락 시 `fileIntegrity=false`→verdict 반드시 `"REJECT"`
