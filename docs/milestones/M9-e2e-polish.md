# M9: 에러 강화 + E2E 테스트

## 목표
edge case가 처리되고, 실제 API E2E 테스트가 통과하며, 문서가 완성된다.

## 선행 의존
M8

## 작업 목록

| 파일 | 작업 |
|------|------|
| `src/utils/responseParser.ts` | 에이전트 응답에서 JSON 안전 추출 — markdown 코드블록 처리, 부분 JSON 복구, 파싱 실패 시 명확한 에러 |
| `src/utils/anthropicClient.ts` 수정 | 타임아웃 강화 (AbortController), 네트워크 에러 vs API 에러 구분 |
| `src/agents/*.ts` 수정 | responseParser 적용, 필수 필드 유효성 검증 |
| `src/index.ts` 수정 | FAIL 리포트 형식 정리, graceful shutdown (SIGINT) |
| `README.md` 수정 | 실행 방법, 환경변수 설정, 예시 출력 |

### E2E 테스트 시나리오
1. 단순 게임("클릭 카운터") — 1 round PASS
2. 복잡한 게임 — retry 발생 시나리오
3. 의도적 실패 — max retry 초과 시 FAILED 처리

## 검증 기준
- E2E 3개 시나리오 기대대로 동작
- README만 보고 새 사용자가 실행 가능
- CLAUDE.md 금지사항 위반 0건
