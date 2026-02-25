# CLAUDE.md — AWGDAS 개발 지침

이 파일은 Claude Code가 AWGDAS 코드베이스를 개발할 때 따르는 지침이다.

---

## 프로젝트 개요

AWGDAS (Autonomous Web Game Dev Agent System) — 사용자 입력으로부터 웹 게임을 자동 생성하는 멀티 에이전트 파이프라인.

---

## 기술 스택

- **언어**: TypeScript (strict mode)
- **런타임**: Node.js
- **AI SDK**: Anthropic SDK (`@anthropic-ai/sdk`)
- **패키지 매니저**: npm
- **빌드 도구**: tsc (TypeScript 컴파일러)

---

## 폴더 구조

```
/AWGDAS
  ├── src/
  │   ├── agents/          # 에이전트 구현 (pl, planner, developer, qa)
  │   ├── types/           # 공유 TypeScript 인터페이스
  │   ├── utils/           # 공통 유틸리티
  │   └── index.ts         # 진입점
  ├── dist/                # tsc 빌드 출력 (gitignore)
  ├── output/              # 생성된 게임 파일 저장 위치
  ├── docs/
  │   └── system-design.md # 에이전트 동작 스펙
  ├── package.json
  ├── tsconfig.json
  ├── CLAUDE.md
  └── README.md
```

---

## 주요 명령어

```bash
# 의존성 설치
npm install

# 빌드
npm run build

# 실행
npm start

# 개발 모드 (ts-node)
npm run dev

# 타입 체크
npm run typecheck
```

---

## 코딩 컨벤션

### 네이밍
- 파일명: `camelCase.ts` (단, 에이전트 파일은 `plAgent.ts`, `plannerAgent.ts` 형식)
- 클래스/인터페이스: `PascalCase`
- 함수/변수: `camelCase`
- 상수: `UPPER_SNAKE_CASE`

### 파일 분리 원칙
- 에이전트마다 파일 1개 (`src/agents/`)
- 공유 타입은 `src/types/index.ts`에 집중
- 유틸리티 함수는 `src/utils/`에 분리

### 비동기
- `async/await` 사용, `.then()` 체이닝 금지
- Anthropic API 호출은 반드시 `try/catch`로 래핑

---

## 금지 사항

- `any` 타입 남용 금지 — 불가피한 경우 `// eslint-disable` 주석 대신 명시적 타입 가드 사용
- `console.log` 잔류 금지 — 디버그 로그는 커밋 전 제거
- `TODO` 주석 코드 잔류 금지
- Scope 외 리팩토링 금지
- CDN, 외부 라이브러리 추가 시 사전 승인 필요

---

## 에이전트 동작 스펙

시스템 설계, 에이전트 역할, Round 상태 머신, Retry Policy 등 상세 스펙은:

→ [`docs/system-design.md`](docs/system-design.md) 참고
