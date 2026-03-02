# M1: 공유 타입 정의

## 목표
`system-design.md` 섹션 14, 16의 모든 인터페이스가 TypeScript 타입으로 존재한다.

## 선행 의존
M0

## 작업 목록

| 파일 | 작업 |
|------|------|
| `src/types/index.ts` | `RoundSpec`, `FeatureBreakdown`, `DevResult`, `QAResult`, `RoundState`, `ManifestFile`, `Manifest`, `AgentConfig`(model, max_tokens, timeout), `AcceptanceCriteria` |

## 검증 기준
- `npm run typecheck` 성공
- 모든 인터페이스가 `system-design.md` 스키마와 1:1 대응
