# MSI Tool Reference

이 문서는 현재 공개된 MSI MCP tool의 범위를 정리합니다.

## 1. 범위

현재 MSI는 read-only 범위만 지원합니다.

지원 기능:

- 수강과목시간표 조회
- 현재 학기 수강성적 조회
- 성적이력 조회
- 졸업학점 조회

아직 지원하지 않는 것:

- 학생카드
- 쓰기 기능
- 메뉴 전체 탐색용 공개 tool

## 2. 인증과 세션

MSI는 LMS와 같은 계정 자격증명을 재사용합니다.

- 아이디/비밀번호는 LMS와 동일한 해석 우선순위를 사용합니다.
- 세션은 LMS와 별도로 저장합니다.
- 기본 세션 파일: `%LOCALAPPDATA%\\mju-mcp\\state\\msi-session.json`

내부적으로는 LMS와 다른 로그인 브리지 체인을 거칩니다.

1. `login_security`
2. 명지대 SSO
3. callback
4. `login_security`
5. `j_spring_security_check`
6. `MySecurityStart`

## 3. Tool 목록

| Tool | 용도 | 핵심 입력 |
| --- | --- | --- |
| `mju_msi_get_timetable` | 수강과목시간표 조회 | `year?`, `termCode?` |
| `mju_msi_get_current_term_grades` | 현재 학기 수강성적조회 | 없음 |
| `mju_msi_get_grade_history` | 성적조회 | 없음 |
| `mju_msi_get_graduation_requirements` | 졸업학점조회 | 없음 |

## 4. Tool 상세

### 4.1 `mju_msi_get_timetable`

입력:

- `year?`
- `termCode?`

학기 코드:

- `10`: 1학기
- `15`: 여름계절학기
- `20`: 2학기
- `25`: 겨울계절학기

반환 핵심:

- 연도 / 학기
- 학기 선택 옵션
- 시간표 항목 목록
- 요일 / 시간 / 강의명 / 장소 / 교수명

예시:

```json
{
  "name": "mju_msi_get_timetable",
  "arguments": {
    "year": 2026,
    "termCode": 10
  }
}
```

### 4.2 `mju_msi_get_current_term_grades`

입력:

- 없음

반환 핵심:

- 연도 / 학기
- 과목명
- 과목코드
- 분반
- 학점
- 상태 메시지

예시:

```json
{
  "name": "mju_msi_get_current_term_grades",
  "arguments": {}
}
```

### 4.3 `mju_msi_get_grade_history`

입력:

- 없음

반환 핵심:

- 학생 기본 정보
- 전체 요약
- 이수구분별 학점
- 학기별 성적 카드
- 전체 성적 행 목록

예시:

```json
{
  "name": "mju_msi_get_grade_history",
  "arguments": {}
}
```

### 4.4 `mju_msi_get_graduation_requirements`

입력:

- 없음

반환 핵심:

- 학생 기본 정보
- 영역별 취득학점
- 영역별 필요학점
- 부족 학점 계산 결과
- 안내 문구

예시:

```json
{
  "name": "mju_msi_get_graduation_requirements",
  "arguments": {}
}
```

## 5. 구현 특성

MSI는 메뉴 URL을 단순 GET 하는 방식으로 잘 열리지 않습니다.

현재 구현은 아래 흐름을 공통화합니다.

1. `goBodyPage`
2. 내부 상태 세팅
3. `sideform` 또는 `form1` POST

즉 MSI는 로그인뿐 아니라 “메뉴 진입 방식”도 별도 계층으로 구현되어 있습니다.

## 6. 알려진 제한

- 학생카드는 2차 비밀번호 인증 보호 메뉴라 현재 범위에서 제외되어 있습니다.
- 현재는 read-only 범위만 열려 있습니다.
- 메뉴별 HTML 구조 차이가 커서, 새 기능을 추가할 때는 메뉴별 파서 검증이 필요합니다.
