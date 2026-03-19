# UCheck Tool Reference

이 문서는 현재 공개된 UCheck MCP tool의 범위를 정리합니다.

## 1. 범위

현재 UCheck는 한 가지 기능만 지원합니다.

- 과목별 출석현황 조회

Tool:

- `mju_ucheck_get_course_attendance`

## 2. 인증과 세션

UCheck도 LMS와 같은 계정 자격증명을 재사용합니다.

- 아이디/비밀번호는 LMS와 동일한 해석 우선순위를 사용합니다.
- 세션은 LMS와 별도로 저장합니다.
- 기본 세션 파일: `%LOCALAPPDATA%\\mju-mcp\\state\\ucheck-session.json`

로그인 자체는 LMS와 같은 SSO 암호화 로직을 재사용하지만, entry URL 은 `https://ucheck.mju.ac.kr/` 입니다.

## 3. Tool 상세

### `mju_ucheck_get_course_attendance`

명지대 UCheck에서 특정 과목의 출석현황을 조회합니다.

입력:

- `course?`: 강의명, 과목코드, 또는 `lectureNo` 문자열
- `lectureNo?`: UCheck `lecture_no`
- `year?`: 조회 연도
- `term?`: 조회 학기

중요:

- `course` 와 `lectureNo` 는 동시에 사용할 수 없습니다.
- `year`, `term` 을 생략하면 UCheck 기본 학기를 사용합니다.

## 4. 강의 식별 규칙

`course` 는 다음 순서로 해석합니다.

1. 숫자만 들어오면 `lectureNo`
2. 강의명 정확 일치
3. 과목코드 정확 일치
4. 제목 / 과목코드 / 교수명 부분 검색

여러 강의가 동시에 걸리면 자동 실행하지 않고 에러를 반환합니다.

즉 아래 입력이 모두 가능합니다.

```json
{
  "name": "mju_ucheck_get_course_attendance",
  "arguments": {
    "course": "시스템클라우드보안"
  }
}
```

```json
{
  "name": "mju_ucheck_get_course_attendance",
  "arguments": {
    "course": "JEJ02473"
  }
}
```

```json
{
  "name": "mju_ucheck_get_course_attendance",
  "arguments": {
    "lectureNo": 57201
  }
}
```

## 5. 반환 정보

반환 핵심:

- 학생 정보
- 강의 정보
  - `lectureNo`
  - 과목코드
  - 강의명
  - 분반
  - 교수명
- 출석 요약
  - `attendedCount`
  - `tardyCount`
  - `earlyLeaveCount`
  - `absentCount`
- 회차 수 / 진행된 회차 수
- 회차별 출결
  - 주차
  - 날짜
  - 시간
  - 강의실
  - 상태
  - 출석시간
  - 퇴실시간

## 6. 내부 동작

현재 구현은 아래 API 조합을 사용합니다.

1. `POST /common/account/ajax/accountInfo.json?as=`
2. `POST /lecture/lecture/select.json`
3. `POST /attend/attendance/selectItems.json?as=`
4. `POST /attend/attendance/selectAttend.json?as=`

과목 클릭으로 URL 이 바뀌지 않는 SPA 구조이기 때문에, 실제 화면도 내부 JSON 호출을 조합해 재현합니다.

## 7. 해석 팁

- `selectItems` 에서 본인 행의 출석/지각/조퇴/결석 누적 수를 읽습니다.
- `selectAttend` 에서 본인 회차별 로그를 읽습니다.
- 둘을 `lecture_week + class_no` 기준으로 묶어 회차별 출결 목록을 만듭니다.

## 8. 알려진 제한

- 현재는 출석현황 1개 기능만 공개되어 있습니다.
- 동일 강의명이 여러 개 겹치는 경우 `lectureNo` 직접 입력이 더 안전합니다.
- 일부 회차는 미래 일정이라 상태가 비어 있을 수 있습니다.
