# M1 — 공유 타입 정의

## 목표

에이전트 간 데이터 전달에 사용할 TypeScript 인터페이스를 `src/types/index.ts`에 정의한다.

## 산출물

| 파일 | 설명 |
|------|------|
| `src/types/index.ts` | 14개 타입/인터페이스 (named export) |

## 정의된 타입

### 리터럴 유니온
- `FileAction` — `"created" | "modified" | "deleted"`
- `FileRole` — `"entry" | "core" | "feature" | "render" | "asset"`
- `Verdict` — `"PASS" | "REJECT"`
- `RoundPhase` — 8개 상태 (`PL_INIT` ~ `FAILED`)

### 인터페이스 (에이전트 간 전달)
- `AcceptanceCriteria` — AC 항목
- `RoundSpec` — PL → Planner
- `Feature` — 기능 단위
- `FeatureBreakdown` — Planner → Developer
- `ChangedFile` — 변경 파일 항목
- `DevResult` — Developer → QA
- `CriteriaResult` — AC 판정 항목
- `QAResult` — QA → PL

### 인터페이스 (상태/설정)
- `RoundState` — Round 상태 객체 (메모리 내 관리)
- `ManifestFile` / `Manifest` — 게임 파일 매니페스트
- `AgentConfig` — 에이전트별 API 설정

## 검증

- `npm run typecheck` → 에러 0
- `npm run build` → 정상 빌드

## 근거

- `docs/system-design.md` 섹션 14 (데이터 전달 형식)
- `docs/system-design.md` 섹션 16 (상태 관리)
- `docs/system-design.md` 섹션 13.3 (manifest.json 스키마)
- `docs/system-design.md` 섹션 15 (API 호출 방식)
