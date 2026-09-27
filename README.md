# 용자 · AI 스터디 플래너

고등학생이 과목별 수준과 중요도, 문제집 진도, 평균 공부 시간, 시험일까지 남은 기간을 입력하면 하루 공부 미션으로 정리해 주는 모바일 웹 프로토타입입니다.

## 실행

Google 로그인과 Gemini API 프록시를 함께 사용하려면 Node 서버로 실행합니다.

1. `config.example.js`를 `config.js`로 복사하고 Google Cloud OAuth 웹 클라이언트 ID를 입력합니다. 웹 클라이언트 ID는 공개 식별자라 배포 파일에 포함해도 되지만, Gemini API 키는 절대 브라우저 코드나 저장소에 넣지 않습니다.
2. Google Cloud Console의 승인된 JavaScript 원본에 `http://127.0.0.1:4173`과 실제 배포 주소를 추가합니다.
3. Google AI Studio에서 무료 사용량이 있는 Gemini API 키를 만든 뒤, 키를 환경 변수로 설정합니다.

```powershell
Copy-Item config.example.js config.js
Copy-Item .env.example .env
# .env에 실제 GOOGLE_CLIENT_ID와 GEMINI_API_KEY를 입력한 뒤
node server.mjs
```

브라우저에서 `http://127.0.0.1:4173/`을 엽니다. API 키는 `server.mjs`가 Gemini API를 호출할 때만 사용하며 저장소나 브라우저 코드에 넣지 않습니다. API 서버를 별도 주소로 배포하면 `.env`의 `ALLOWED_ORIGIN`을 웹 주소로 바꾸고 `config.js`의 `apiBaseUrl`에 API 주소를 입력합니다. 정적 서버(`python -m http.server`)로 실행하면 화면만 열리고 `/api/gemini`는 동작하지 않습니다.

## 포함한 흐름

- 홈 & 타이머, 과목 플래너, Gemini AI 튜터, 테마 스튜디오 탭
- 새 미션 추가, 완료 체크, 집중 타이머
- Google Identity Services 기반 Google 계정 로그인
- 로그인한 ID 토큰을 서버에서 검증한 뒤 Gemini API에 학습 맥락을 전달하는 AI 튜터
- 기초·보완·중간·심화 학습 수준 선택
- 브라우저 `localStorage`를 사용한 미션·테마·수준 저장
- 브라우저가 지원하면 WebMCP를 통해 계획 읽기와 미션 완료 도구 등록

Google Web Client ID는 `config.js`에 넣어 배포하고, Gemini API 키는 서버 환경 변수로만 설정합니다. `.env`, API 키 파일, 인증서 파일은 `.gitignore`에 포함되어 있습니다.

## 개인정보 처리

- 이름, 이메일, 전화번호, 비밀번호, 생년월일, 주소, 사진을 입력받는 별도 입력란은 두지 않습니다.
- Google 로그인은 Gemini 사용 권한 확인을 위해 ID 토큰을 메모리에서만 사용합니다. Google 이름·이메일·사진을 localStorage나 서버 응답에 저장하지 않습니다.
- 미션·테마·학습 수준은 기능 제공을 위해 현재 브라우저의 `localStorage`에만 저장합니다. 미션 저장 전 이메일·전화번호·주민등록번호 형식은 제거하고, 프로필 화면에서 저장 범위를 안내합니다.
- AI 질문과 학습 계획만 Gemini 서버로 전송하며, 이메일·전화번호·주민등록번호 형식은 전송 전에 가리고, 채팅 입력에서는 개인정보를 입력하지 않도록 안내합니다.
