# AWGDAS

**Autonomous Web Game Dev Agent System**

> _현재 개발 진행 중인 프로젝트입니다._

사용자가 게임 아이디어를 입력하면, 멀티 에이전트 시스템이 자율적으로 기획 → 개발 → QA → 배포까지 완료하는 자동화 파이프라인.

---

## 프로젝트 목적 (Technical)

AWGDAS는 멀티 에이전트가 역할을 분담해 협업하며,
스스로 기획하고 구현하고 검증하고 종료까지 책임지는
자율 개발 프로세스를 설계·구현하는 프로젝트다.

이 시스템은 다음 기술적 과제를 다룬다:

- **자율 루프 제어**: 기획 ↔ 개발 ↔ QA 반복 과정에서 무한 루프와 스코프 확장을 방지하고, 정의된 완료 조건을 충족하면 자동 종료한다.
- **명세 기반 개발**: Round Spec을 단일 진실 소스로 사용해 모든 판단을 문서화된 기준에 고정한다.
- **검증 가능한 품질 게이트**: 추상적 평가 대신 Yes/No 기반 Acceptance Criteria로 통과 여부를 결정한다.
- **라운드 단위 진화 모델**: 한 번의 완성을 종료 지점으로 삼고, 추가 기능은 새로운 Round로 분리해 점진적으로 확장한다.
- **MCP 기반 릴리즈 자동화**: QA 통과 시 PL이 MCP 도구를 통해 git 커밋을 수행하고, 라운드 결과를 버전 단위로 고정한다.

AWGDAS는 결과물로서의 게임보다,
자율 에이전트 조직이 안정적으로 작동할 수 있는 구조를 설계하는 데 목적이 있다.

---

## 개요

```
사용자: "미니 로그라이크 게임 만들어줘"

시스템:
  1. PL이 Round Spec 생성
  2. Planner → Developer → QA 자동 루프 실행
  3. Definition of Done 충족 시 자동 종료
  4. PL이 git commit 실행
  5. 사용자 추가 입력 대기
```

---

## 에이전트 구성

| 에이전트 | 역할 |
|---|---|
| **PL** | Round 관리, 종료 판단, git commit |
| **Planner** | 기능 분해, Feature Breakdown 작성 |
| **Developer** | 기능 구현, 파일 수정 |
| **QA** | Acceptance Criteria 검증, Pass/Reject 판단 |

---

## Round 라이프사이클

```
PL_INIT → PLANNER_DEFINE → DEV_IMPLEMENT → QA_REVIEW
                                                ↓
                                [PASS] → RELEASE → DONE
                                [REJECT] → RETRY_CHECK → DEV_IMPLEMENT
```

---

## 출력 결과물

AWGDAS가 생성하는 게임은 `output/` 디렉토리에 저장된다.
외부 라이브러리 없이 순수 웹 기술만 사용:

```
output/{game-name}/
  ├── index.html   # 게임 진입점
  ├── style.css    # 스타일
  ├── main.js      # 게임 로직
  └── README.md    # 게임 실행 방법
```

브라우저에서 `index.html`을 열어 실행한다.

---

## 주요 정책

- **Retry**: 기능별 최대 2회 재시도, 초과 시 PL이 Scope 축소 또는 FAIL 처리
- **Scope Lock**: Round 시작 후 기능 추가/변경 금지, 제안은 Backlog에만 기록
- **Definition of Done**: 모든 AC PASS + console.error 없음 + TODO 없음
- **Git**: PL만 커밋 실행, `feat(round-{id}): {요약}` 형식

에이전트 역할 상세, 상태 머신, 정책 전문은 → [`docs/system-design.md`](docs/system-design.md) 참고.

---

## 사용 방법

```bash
# 의존성 설치
npm install

# 실행
npm start
```

실행 후 게임 아이디어를 입력하면 시스템이 자율로 Round를 완료한다.
완료 후 추가 기능 입력 시 새 Round가 시작된다.
