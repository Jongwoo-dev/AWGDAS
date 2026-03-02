# M2: 유틸리티 레이어 + 테스트

## 목표
에이전트가 공유하는 인프라 함수가 존재하고, 단위 테스트로 검증된다.

## 선행 의존
M1

## 작업 목록

| 파일 | 작업 |
|------|------|
| `src/utils/anthropicClient.ts` | Anthropic SDK 초기화, `callAgent()` — 3회 재시도 + exponential backoff(1s/2s/4s), timeout 적용, tool_use 호출용 오버로드 |
| `src/utils/fileManager.ts` | `writeGameFile()`, `readGameFile()`, `deleteGameFile()`, `ensureOutputDir()` — `output/{game-name}/` 기준, 실패 시 즉시 throw |
| `src/utils/manifest.ts` | `createManifest()`, `addFileToManifest()`, `updateFileInManifest()`, `removeFileFromManifest()`, `readManifest()` — 섹션 18 규칙 준수 |
| `src/utils/logger.ts` | 구조화된 로깅 (phase, roundId, agent 포함) |
| `src/utils/__tests__/anthropicClient.test.ts` | 재시도 로직 테스트 (API mock) |
| `src/utils/__tests__/fileManager.test.ts` | 파일 CRUD 테스트 |
| `src/utils/__tests__/manifest.test.ts` | manifest 갱신 로직 테스트 |

## 검증 기준
- `npm run typecheck` 성공
- `npm test` — 유틸리티 단위 테스트 전체 PASS
