# M3: 상태 머신 + 테스트

## 목표
Round 상태 전환 로직이 구현되고, 모든 전환 경로가 단위 테스트로 검증된다.

## 선행 의존
M1

## 작업 목록

| 파일 | 작업 |
|------|------|
| `src/utils/roundStateMachine.ts` | `create(roundId)`, `transition(state, nextPhase)` — 유효하지 않은 전환 시 throw, `canRetry(state)`, `incrementRetry(state)`, 데이터 슬롯(currentSpec 등) 업데이트 메서드 |
| `src/utils/__tests__/roundStateMachine.test.ts` | 정상 전환(PASS/REJECT/FAIL 경로), 유효하지 않은 전환 throw, retry 카운트 관리 |

## 검증 기준
- `npm run typecheck` 성공
- `npm test` — 상태 머신 단위 테스트 전체 PASS
