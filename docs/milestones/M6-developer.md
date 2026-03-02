# M6: Developer 에이전트 + 파이프라인 확장

## 목표
Developer가 tool_use로 파일을 생성/수정하고, manifest.json을 자동 갱신한다.
`index.ts`의 파이프라인을 확장하여 PLANNER_DEFINE → DEV_IMPLEMENT까지 연결한다.

## 선행 의존
M5

## 작업 목록

| 파일 | 작업 |
|------|------|
| `src/agents/developerAgent.ts` | `runDeveloper(breakdown, gameName, isRetry, qaFeedback?): Promise<DevResult>` — tool 정의(write_file, read_file, delete_file), tool_use API 호출 루프, tool 결과 → fileManager로 실제 I/O, manifest.json 자동 갱신, Retry 시 qaFeedback 포함 |
| `src/index.ts` 수정 | 파이프라인 확장 — M5의 부분 파이프라인에 (5) DEV_IMPLEMENT → developerAgent 호출 (6) 결과 출력 후 종료 단계 추가 |

## 검증 기준
1. `npm run typecheck` 성공
2. `npm start` 실행 시:
   - a. stdin으로 게임 설명 입력 가능 (M5 회귀)
   - b. 상태 전환 로그 출력: `PL_INIT → PLANNER_DEFINE` (M5 회귀)
   - c. PL이 반환한 RoundSpec에 features >= 1개, acceptanceCriteria >= 1개 포함 (M5 회귀)
   - d. Planner가 반환한 FeatureBreakdown에 fileStructure >= 1개, features >= 1개 포함 (M5 회귀)
   - e. 추가 상태 전환 로그: `→ DEV_IMPLEMENT`
   - f. `output/{game-name}/` 디렉토리에 파일 실제 생성
   - g. manifest.json 생성 및 files 배열 >= 1개
   - h. DevResult.changedFiles가 정확한지 확인
   - i. DEV_IMPLEMENT 완료 후 정상 종료 (exit code 0)
