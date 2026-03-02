# M5: PL + Planner 에이전트 + 부분 파이프라인

## 목표
파이프라인 전반부(PL_INIT → PLANNER_DEFINE)가 독립적으로 실행 가능하다.
`index.ts`에서 PL → Planner 연결까지의 부분 파이프라인을 구성한다.

## 선행 의존
M2, M3, M4

## 작업 목록

| 파일 | 작업 |
|------|------|
| `src/agents/plAgent.ts` | `runPLInit(gameDescription, roundId): Promise<RoundSpec>` — API 호출 → RoundSpec JSON 파싱. (evaluateQAResult, generateFailReport는 QA와 함께 검증 가능하므로 **M7에서 추가**) |
| `src/agents/plannerAgent.ts` | `runPlanner(spec: RoundSpec): Promise<FeatureBreakdown>` — API 호출 → FeatureBreakdown JSON 파싱 |
| `src/index.ts` | 부분 파이프라인 구성 — (1) stdin 사용자 게임 설명 수집 (2) RoundStateMachine.create() (3) PL_INIT → plAgent 호출 (4) PLANNER_DEFINE → plannerAgent 호출 (5) 결과 출력 후 종료. 전체 try/catch 래핑, 각 단계 로깅 |

## 검증 기준
1. `npm run typecheck` 성공
2. `npm start` 실행 시:
   - a. stdin으로 게임 설명 입력 가능
   - b. 상태 전환 로그 출력: `PL_INIT → PLANNER_DEFINE`
   - c. PL이 반환한 RoundSpec에 features >= 1개, acceptanceCriteria >= 1개 포함
   - d. Planner가 반환한 FeatureBreakdown에 fileStructure >= 1개, features >= 1개 포함
   - e. 파이프라인이 PLANNER_DEFINE 완료 후 정상 종료 (exit code 0)
   - f. 에러 발생 시 try/catch에서 포착하여 에러 메시지 출력 후 exit code 1
