# 용자 · AI 스터디 플래너

고등학생이 과목별 수준과 중요도, 문제집 진도, 평균 공부 시간, 시험일까지 남은 기간을 입력하면 하루 공부 미션으로 정리해 주는 모바일 웹 프로토타입입니다.

## 실행

정적 파일을 웹 서버로 열면 됩니다.

```powershell
& 'C:/Users/vvwvv/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' -m http.server 4173
```

브라우저에서 `http://127.0.0.1:4173/`을 엽니다.

## 포함한 흐름

- 홈 & 타이머, 과목 플래너, Gemini AI 튜터, 테마 스튜디오 탭
- 새 미션 추가, 완료 체크, 집중 타이머
- Google 계정 연결 상태를 보여주는 프로필 화면
- 기초·보완·중간·심화 학습 수준 선택
- 브라우저 `localStorage`를 사용한 미션·테마·수준 저장
- 브라우저가 지원하면 WebMCP를 통해 계획 읽기와 미션 완료 도구 등록

현재 Google OAuth와 Gemini API는 실제 자격 증명을 포함하지 않은 프로토타입 상태입니다. 운영 연결 시 Google Identity Services와 서버 측 Gemini 호출을 붙이고, 사용자의 문제집·진도 데이터는 서버 권한 범위 안에서만 전달해야 합니다.
