# AWGDAS 시스템 설계 문서

에이전트 역할, Round 상태 머신, 정책 규칙 등 시스템 동작 스펙을 정의한다.

---

## 1. 시스템 개요

```
사용자 입력 → PL이 Round Spec 생성 → Planner → Developer → QA 자동 루프 → DoD 충족 시 종료
```

---

## 2. 에이전트 역할 및 제약

### 2.1 PL (Project Lead)

책임:
- Round Spec 생성
- Scope Lock 정의
- Acceptance Criteria 정의
- Retry Policy 관리
- QA 결과 기반 종료 판단
- git commit 실행 (유일한 커밋 권한)

금지:
- 기능 직접 구현
- Scope 임의 확장

---

### 2.2 Planner

책임:
- 게임 기능 분해
- Feature Breakdown 작성
- 엣지케이스 정의

금지:
- Scope 외 기능 제안 (개선 아이디어는 Backlog에만 기록)

---

### 2.3 Developer

책임:
- 현재 단계 기능 구현
- 파일 수정
- 변경사항 요약 작성

금지:
- Scope 외 코드 수정
- 리팩토링
- TODO 작성

---

### 2.4 QA

책임:
- Acceptance Criteria 기반 Pass/Reject 판단
- Reject 시 명시: 실패 항목 ID + 재현 절차 + 원인 설명

금지:
- 개선 제안
- 추상적 판단

---

## 3. Round 상태 머신

```
PL_INIT
   ↓
PLANNER_DEFINE
   ↓
DEV_IMPLEMENT
   ↓
QA_REVIEW
   ↓
[PASS] → RELEASE → DONE
[REJECT] → RETRY_CHECK → DEV_IMPLEMENT
```

---

## 4. Retry Policy

- 기능별 최대 재시도: **2회**
- 초과 시 PL은 다음 중 선택:
  - Scope 축소
  - 해당 기능 FAIL 처리
  - 라운드 종료
- 무한 루프 금지

---

## 5. Scope Lock Policy

Round 시작 후 고정:
- 기능 추가 금지
- 성능/UI 개선 금지
- 리팩토링 금지
- 추가 제안 → Backlog에만 기록

---

## 6. Acceptance Criteria 규칙

AC는 반드시 Yes/No 판단 가능해야 한다.

**허용 예:**
- 플레이어는 방향키로 이동한다.
- 플레이어는 화면 밖으로 나가지 않는다.
- 충돌 시 점수가 증가한다.

**금지 예:**
- 자연스럽게 움직인다.
- 보기 좋다.
- 잘 동작한다.

---

## 7. Definition of Done

다음을 모두 만족해야 Round 종료:

1. 모든 Acceptance Criteria PASS
2. QA 명시적 PASS 선언
3. 재시도 ≤ 2회
4. `console.error` 발생 없음
5. TODO 없음
6. 생성된 게임의 README에 실행 방법 존재

충족 시 → PL은 즉시 RELEASE 전환 후 git commit 실행

---

## 8. Git Policy

- 커밋은 PL만 실행
- 커밋 메시지 형식:

```
feat(round-{id}): {요약}

- 기능1
- 기능2

QA: PASS
Retry: {횟수}
```

---

## 9. 자동 종료 규칙

PL은 다음을 절대 수행하지 않는다:
- 추가 기능 자동 제안
- 기능 확장
- 리팩토링 지시

라운드 완료 시 반드시 종료한다.
추가 기능은 **사용자 입력으로만** 시작한다.

---

## 10. Backlog 처리

Backlog는 기록만 가능하다.
현재 Round에서 절대 구현하지 않는다.

---

## 11. Safety Constraints

- 무한 루프 방지
- 상태 로그 유지
- 실패 시 요약 리포트 생성
- 자동 중단 가능

---

## 12. 실행 모드

완전 자율 모드:
- 사용자 개입 없이 Round 종료까지 진행
- 종료 후 사용자 입력 대기
