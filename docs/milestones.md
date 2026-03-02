# AWGDAS 마일스톤

## 상태 요약

| ID | 마일스톤 | 상태 | 의존 | 커밋 | 세부 문서 |
|----|---------|------|------|------|----------|
| M0 | 프로젝트 스캐폴딩 | 작업전 | - | ~1 | [M0](milestones/M0-scaffolding.md) |
| M1 | 공유 타입 정의 | 작업전 | M0 | ~1 | [M1](milestones/M1-types.md) |
| M2 | 유틸리티 + 테스트 | 작업전 | M1 | ~2 | [M2](milestones/M2-utils.md) |
| M3 | 상태 머신 + 테스트 | 작업전 | M1 | ~1 | [M3](milestones/M3-state-machine.md) |
| M4 | 에이전트 프롬프트 | 작업전 | M1 | ~1 | [M4](milestones/M4-prompts.md) |
| M5 | PL + Planner + 부분 파이프라인 | 작업전 | M2, M3, M4 | ~2 | [M5](milestones/M5-pl-planner.md) |
| M6 | Developer + 파이프라인 확장 | 작업전 | M5 | ~2 | [M6](milestones/M6-developer.md) |
| M7 | QA + 전체 루프 완성 | 작업전 | M6 | ~2 | [M7](milestones/M7-qa.md) |
| M8 | 에이전트 테스트 + 통합 테스트 | 작업전 | M7 | ~2 | [M8](milestones/M8-agent-tests.md) |
| M9 | 에러 강화 + E2E | 작업전 | M8 | ~3 | [M9](milestones/M9-e2e-polish.md) |

## 의존성 다이어그램

```
M0 → M1 ─┬→ M2(+test) ─┐
          ├→ M3(+test) ──┼→ M5(PL+Planner+파이프라인) → M6(Dev+확장) → M7(QA+루프) → M8(테스트) → M9(E2E)
          └→ M4 ─────────┘
```

## 테스트 전략

- **프레임워크**: vitest
- **인프라 (M2, M3)**: 구현과 함께 단위 테스트 작성
- **에이전트 (M5~M7)**: 수동 검증 (각 마일스톤별 관찰 가능한 검증 기준 정의, 이전 단계 회귀 검증 포함)
- **에이전트 단위 + 통합 (M8)**: API mock 기반 에이전트 단위 테스트 + 에이전트 간 데이터 계약 검증 통합 테스트 (`pipeline.test.ts`)
- **E2E (M9)**: 실제 API 호출로 전체 파이프라인 테스트
