# Library Tool Reference

이 문서는 현재 공개된 명지대학교 도서관 MCP tool 범위를 정리합니다.

## 1. 범위

현재 도서관 기능은 스터디룸 예약 흐름에 집중되어 있습니다.

Tool:

- `mju_library_list_study_rooms`
- `mju_library_get_study_room`
- `mju_library_list_room_reservations`
- `mju_library_reserve_study_room`
- `mju_library_update_study_room_reservation`
- `mju_library_cancel_study_room_reservation`

## 2. 인증과 세션

도서관도 같은 학번/비밀번호를 사용하지만, 구현 방식은 LMS SSO 폼 암호화와 다릅니다.

- 자격증명 자체는 LMS와 같은 우선순위로 해석합니다.
- 실제 로그인 호출은 `POST https://lib.mju.ac.kr/pyxis-api/api/login` 입니다.
- 로그인 후 `Pyxis-Auth-Token` 헤더를 사용합니다.
- 기본 세션 파일: `%LOCALAPPDATA%\\mju-mcp\\state\\library-session.json`

즉 “같은 계정”은 맞지만, 코드 구조는 `token-based JSON API` 에 더 가깝습니다.

## 3. 읽기 tool

### `mju_library_list_study_rooms`

캠퍼스/날짜 기준으로 예약 가능한 스터디룸 목록을 조회합니다.

입력:

- `campus?`: `인문`, `자연`, `all`
- `date?`: 예약 날짜

반환 핵심:

- 사용자 정보
- 캠퍼스별 선택 날짜
- 예약 가능 날짜
- 층 목록
- 방 목록

### `mju_library_get_study_room`

특정 스터디룸의 상세 타임라인을 조회합니다.

입력:

- `roomId`
- `date`
- `beginTime?`

반환 핵심:

- 이용 목적 목록
- 인원 규칙
- 최소/최대 이용 시간
- 타임라인
- 사용 불가 구간
- 예약 가능 시작 시각
- `beginTime` 지정 시 예약 가능 종료 시각

### `mju_library_list_room_reservations`

현재 로그인한 사용자의 스터디룸 예약 목록을 조회합니다.

반환 핵심:

- 예약 id
- 방 이름
- 캠퍼스
- 예약 시간
- 상태
- 동행자 수

## 4. 쓰기 tool

도서관 쓰기 tool은 모두 2단계 승인 흐름을 사용합니다.

1. `confirm=true` 로 첫 호출
2. 서버가 preview + `approvalToken` 반환
3. 같은 세션에서 `approvalToken` 포함 재호출
4. fingerprint 가 일치할 때만 실제 쓰기 실행

이 규칙은 다음 3개 tool 에 동일하게 적용됩니다.

- `mju_library_reserve_study_room`
- `mju_library_update_study_room_reservation`
- `mju_library_cancel_study_room_reservation`

### `mju_library_reserve_study_room`

스터디룸 예약 생성입니다.

입력 핵심:

- `roomId`
- `date`
- `beginTime`
- `endTime`
- `useSectionId?` / `useSectionCode?` / `useSectionName?`
- `companionCount?`
- `companions?`
- `patronMessage?`

### `mju_library_update_study_room_reservation`

기존 예약 수정입니다.

입력 핵심:

- `reservationId`
- `date`
- `beginTime`
- `endTime`
- `companions?`
- `companionCount?`

기존 예약 상세에서 방 id, 기존 이용 목적, 기존 동행자를 fallback 으로 활용합니다.

### `mju_library_cancel_study_room_reservation`

기존 예약 취소입니다.

입력:

- `reservationId`
- `confirm`
- `approvalToken?`

## 5. 동행자 입력 규칙

스터디룸은 최소 인원 규칙이 있기 때문에 동행자 입력이 중요합니다.

예:

```json
{
  "companions": [
    { "name": "홍길동", "memberNo": "60123456" },
    { "name": "김명지", "memberNo": "60123457" }
  ],
  "companionCount": 2
}
```

내부 동작:

1. 입력된 `name`, `memberNo` 를 trim
2. `/api/rooms/{roomId}/check-companions` 로 내부 patron id 조회
3. 예약 payload 에는 `companionPatrons: [internalId...]` 로 변환

즉 사용자는 이름/학번만 넣고, 내부 시스템이 요구하는 companion id 는 서버 쪽에서 해석합니다.

## 6. 내부 동작

핵심 호출 체인은 아래와 같습니다.

1. `POST /pyxis-api/api/login`
2. `GET /pyxis-api/1/api/my-info`
3. `GET /pyxis-api/1/api/room-floors-and-chargeable-dates`
4. `GET /pyxis-api/1/api/rooms`
5. `GET /pyxis-api/1/api/rooms/{roomId}`
6. `GET /pyxis-api/1/api/rooms/{roomId}/use-sections`
7. `GET /pyxis-api/api/rooms/{roomId}/check-companions`
8. `POST/PUT/DELETE /pyxis-api/1/api/room-charges`

쓰기 요청은 모두 preview 단계에서 먼저 실제 room timeline 을 다시 읽고, 선택한 시간대가 비어 있는지 확인합니다.

## 7. 실데이터 검증 메모

현재까지 확인한 내용:

- 예약 상세 조회
- 기존 예약 목록 조회
- 기존 예약 시간 수정 후 원복
- 동행자 2명 이름/학번을 내부 id 로 정상 해석
- 수정 API는 `success.updated` 코드만 반환하고 `data` 는 비워둘 수 있음

## 8. 알려진 제한

- 예약 가능 날짜는 라이브 규칙에 따라 매우 제한적일 수 있습니다.
- 계정별 1일 1예약 같은 정책이 있어 신규 예약 생성이 차단될 수 있습니다.
- 오늘 날짜라도 `warning.room.hasNoRuleHour` 로 실제 배정 가능 시간이 없을 수 있습니다.
- 읽기 목록의 `unableMessage` 와 상세 타임라인은 같이 보는 편이 안전합니다.
