# M4: 에이전트 프롬프트 설계

## 목표
각 에이전트의 system prompt가 모듈로 존재하며, 입출력 JSON 스키마와 금지 사항이 명시된다.

## 선행 의존
M1

## 작업 목록

| 파일 | 작업 |
|------|------|
| `src/agents/prompts/plPrompt.ts` | PL system prompt — 역할(섹션 2.1), 금지사항, 입력(게임 설명)/출력(RoundSpec JSON) |
| `src/agents/prompts/plannerPrompt.ts` | Planner system prompt — 역할(섹션 2.2), 금지사항, 입력(RoundSpec)/출력(FeatureBreakdown JSON), 파일 분리 원칙(섹션 13.1) |
| `src/agents/prompts/developerPrompt.ts` | Developer system prompt — 역할(섹션 2.3), 금지사항, 입력(FeatureBreakdown)/출력(DevResult JSON + tool_use), manifest 규칙(섹션 18) |
| `src/agents/prompts/qaPrompt.ts` | QA system prompt — 역할(섹션 2.4), 금지사항, 입력(DevResult+파일)/출력(QAResult JSON), AC 규칙(섹션 6), 무결성 검증(섹션 18) |

## 검증 기준
- `npm run typecheck` 성공
- 각 프롬프트에 해당 에이전트의 입출력 JSON 스키마 포함 확인
- 섹션 2의 금지사항이 프롬프트에 명시됨 확인
