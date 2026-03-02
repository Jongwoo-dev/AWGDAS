# M7: QA 에이전트 + 전체 루프 완성

## 목표
QA가 manifest 기반 파일 무결성 검증 + AC 기반 판정을 수행한다.
`index.ts`의 파이프라인을 완성하여 QA_REVIEW → PL 판단 → PASS/REJECT → DONE/FAILED 전체 루프를 구성한다.

## 선행 의존
M6

## 작업 목록

| 파일 | 작업 |
|------|------|
| `src/agents/plAgent.ts` 수정 | M5에서 미뤄진 함수 추가: `evaluateQAResult(state, qaResult): "RELEASE" \| "RETRY" \| "FAIL"` — QA 결과 판단. `generateFailReport(state, reason): string` — FAIL 리포트(섹션 17 형식). QA가 존재해야 실제 검증 가능하므로 이 시점에서 구현 |
| `src/agents/qaAgent.ts` | `runQA(devResult, spec, gameName): Promise<QAResult>` — (1) manifest.json 읽기 (2) 파일 존재 여부 확인(fileIntegrity) (3) 관련 파일 내용 읽기 (4) QA 프롬프트 + API 호출 (5) QAResult JSON 파싱. fileIntegrity=false → verdict 강제 REJECT(섹션 18) |
| `src/index.ts` 수정 | 전체 루프 완성 — M6의 파이프라인에 (6) QA_REVIEW → qaAgent 호출 (7) PL 판단(evaluateQAResult): PASS→RELEASE→DONE, REJECT→RETRY_CHECK→재시도/FAILED (8) FAILED 시 generateFailReport 호출 (9) 최종 결과 출력 단계 추가. SIGINT graceful shutdown은 M9에서 처리 |

## 검증 기준
1. `npm run typecheck` 성공
2. `npm start` 실행 시:
   - a. stdin으로 게임 설명 입력 가능 (M5 회귀)
   - b. 상태 전환 로그: `PL_INIT → PLANNER_DEFINE → DEV_IMPLEMENT` (M5/M6 회귀)
   - c. PL RoundSpec, Planner FeatureBreakdown 유효성 유지 (M5 회귀)
   - d. `output/{game-name}/`에 파일 생성, manifest.json files >= 1개 (M6 회귀)
   - e. 추가 상태 전환 로그: `→ QA_REVIEW → RELEASE → DONE` (PASS 경로)
   - f. QA fileIntegrity 검증 통과
   - g. REJECT 시 `RETRY_CHECK → DEV_IMPLEMENT` 재진입 동작
   - h. maxRetries 초과 시 FAILED 상태로 종료, generateFailReport 출력
