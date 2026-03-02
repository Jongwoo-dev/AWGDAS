# M8: 에이전트 테스트 + 파이프라인 통합 테스트

## 목표
M5~M7 에이전트가 API mock 기반 단위 테스트로 검증된다.
에이전트 간 데이터 흐름이 통합 테스트로 검증된다.

## 선행 의존
M7

## 작업 목록

### 에이전트 단위 테스트

| 파일 | 작업 |
|------|------|
| `src/agents/__tests__/plAgent.test.ts` | PL: mock API 응답 → 유효한 RoundSpec 파싱, evaluateQAResult 판단 로직, generateFailReport 형식 |
| `src/agents/__tests__/plannerAgent.test.ts` | Planner: mock API 응답 → 유효한 FeatureBreakdown 파싱, 잘못된 JSON 응답 시 에러 처리 |
| `src/agents/__tests__/developerAgent.test.ts` | Developer: mock tool_use 응답 → 파일 생성 확인, manifest 갱신 확인, Retry 시 qaFeedback 반영 |
| `src/agents/__tests__/qaAgent.test.ts` | QA: mock API 응답 → PASS/REJECT 판정, fileIntegrity=false 시 강제 REJECT |

### 파이프라인 통합 테스트

| 파일 | 작업 |
|------|------|
| `src/__tests__/pipeline.test.ts` | (1) PL → Planner 데이터 흐름: RoundSpec → FeatureBreakdown 호환성 검증. (2) Planner → Developer 데이터 흐름: FeatureBreakdown → DevResult 호환성 검증. (3) Developer → QA 데이터 흐름: DevResult + manifest.json → QAResult 호환성 검증. (4) QA → PL 판단 흐름: QAResult → evaluateQAResult 분기 검증. (5) Retry 루프: REJECT → RETRY_CHECK → DEV_IMPLEMENT 재진입 시 상태 동기화 검증 |

> 통합 테스트는 mock API를 사용하되, 에이전트 간 **실제 타입 호환성**(데이터 계약)을 검증한다.
> E2E(M9)와의 차이: M8 통합 테스트는 실제 API를 호출하지 않고, 에이전트 간 데이터 계약만 검증.

## 검증 기준
- `npm test` — 에이전트 단위 테스트 + 파이프라인 통합 테스트 전체 PASS
- API를 실제 호출하지 않음 (mock 확인)
