# 용자 · AI 스터디 플래너

고등학생이 공부할 내용·교재 범위·날짜·시작 시간·예상 시간을 등록하고, 실제 오늘의 계획을 보며 AI에게 질문하는 모바일 웹 플래너입니다. AI의 답변은 학습 제안이며, 계획은 사용자가 직접 등록·수정합니다.

## 실행

Google 로그인과 Gemini API 프록시를 함께 사용하려면 Node 서버로 실행합니다.

1. `config.example.js`를 `config.js`로 복사하고 Google Cloud OAuth 웹 클라이언트 ID를 입력합니다. 웹 클라이언트 ID는 공개 식별자라 배포 파일에 포함해도 되지만, Gemini API 키는 절대 브라우저 코드나 저장소에 넣지 않습니다.
2. Google Cloud Console의 승인된 JavaScript 원본에 `http://127.0.0.1:4173`과 실제 배포 주소를 추가합니다.
3. Google AI Studio에서 Gemini API 키를 만든 뒤, 키를 환경 변수로 설정합니다. 무료 사용 가능 여부와 요금은 프로젝트·모델별 정책에 따라 달라지므로 Google의 최신 요금 및 사용량 한도를 확인하세요.

```powershell
Copy-Item config.example.js config.js
Copy-Item .env.example .env
# .env에 실제 GOOGLE_CLIENT_ID와 GEMINI_API_KEY를 입력한 뒤
node server.mjs
```

브라우저에서 `http://127.0.0.1:4173/`을 엽니다. API 키는 `server.mjs`가 Gemini API를 호출할 때만 사용하며 저장소나 브라우저 코드에 넣지 않습니다. API 서버를 별도 주소로 배포하면 `.env`의 `ALLOWED_ORIGIN`을 웹 주소로 바꾸고 `config.js`의 `apiBaseUrl`에 API 주소를 입력합니다. 정적 서버(`python -m http.server`)로 실행하면 화면만 열리고 `/api/gemini`는 동작하지 않습니다.

## 포함한 흐름

- 홈 & 타이머, 과목 플래너, Gemini AI 튜터, 테마 스튜디오 탭
- 날짜·시작 시간별 계획 추가·수정·삭제, 완료 체크, 등록한 예상 시간으로 집중 타이머
- 실제 오늘 날짜·현재 시각·주간 달력, 날짜별 완료율과 남은 시간, 완료 기록 기반 연속 공부 일수
- 시험명·시험일을 입력하면 D-day 자동 계산 (당일 D-Day, 지난 시험은 시험 종료)
- Google Identity Services 기반 Google 계정 로그인
- 로그인한 ID 토큰을 서버에서 검증한 뒤 Gemini API에 학습 맥락을 전달하는 AI 튜터
- Vercel 배포용 `/api/gemini` 및 `/api/health` 서버 함수
- 기초·보완·중간·심화 학습 수준 선택
- 브라우저 `localStorage`를 사용한 미션·시험일·테마·수준 저장
- 브라우저가 지원하면 WebMCP를 통해 계획 읽기와 미션 완료 도구 등록

Google Web Client ID는 `config.js`에 넣어 배포하고, Gemini API 키는 서버 환경 변수로만 설정합니다. `.env`, API 키 파일, 인증서 파일은 `.gitignore`에 포함되어 있습니다.

## 고정 예시 데이터 제거

처음 실행하면 계획·시험일·학습 수준은 비어 있습니다. 예전 예시 6개와 모든 값이 일치하는 날짜 없는 항목만 자동 정리하며, 직접 수정·추가한 기존 계획은 유지합니다. 날짜가 없던 실제 계획에는 업데이트를 처음 연 날짜를 붙입니다. 원문 예시 문자열은 이 마이그레이션 식별에만 남아 있으며 새 계획으로 생성하지 않습니다.

홈은 오늘, 과목 플래너는 선택한 날짜의 같은 계획 데이터를 사용합니다. 날짜를 바꾸면 이전 기록은 보존되고 새 날짜의 계획을 보여 줍니다. AI 화면의 학습 맥락도 실제 오늘 계획·시험일·선택 수준에서 구성합니다. 처음부터 표시하던 가짜 대화는 제거했습니다. 오늘의 문구는 앱에 준비된 7개 문구를 날짜별로 순환합니다.

`dist` 배포에는 `index.html`, `app.js`, `planner-core.js`, `styles.css`, `config.js`가 함께 필요합니다. Vercel에 배포할 때 프로젝트 루트의 `api` 폴더도 포함되어야 `/api/gemini`가 동작합니다. Vercel 프로젝트 설정의 Environment Variables에 `GOOGLE_CLIENT_ID`와 `GEMINI_API_KEY`를 추가하면 됩니다. 요청은 Gemini 3.8 Flash를 먼저 사용하고, 408·429·5xx 또는 연결 오류가 발생하면 3.7 Flash, 3.5 Flash 순서로 자동 재시도합니다. API 키·권한 오류 등 재시도해도 해결되지 않는 요청 오류는 다른 모델로 넘기지 않습니다. 모델은 코드에 지정되어 있어 `GEMINI_MODEL` 환경변수는 필요하지 않습니다. 환경 변수를 저장한 뒤 재배포해야 적용됩니다. 로컬에서는 `.env`를 읽도록 서버를 재시작하세요.

Google의 현재 요금표는 Gemini 3.8 Flash에 무료 티어와 유료 티어를 모두 표시하지만, 무료 한도와 접근 가능 여부는 프로젝트에 따라 다릅니다. 무료 한도를 넘으면 유료 티어 요금이 적용될 수 있으니 AI Studio의 사용량과 결제 설정을 확인하세요.

검증: `node --test tests/planner-core.test.cjs`

## 개인정보 처리

- 이름, 이메일, 전화번호, 비밀번호, 생년월일, 주소, 사진을 입력받는 별도 입력란은 두지 않습니다.
- Google 로그인은 Gemini 사용 권한 확인을 위해 ID 토큰을 메모리에서만 사용합니다. Google 이름·이메일·사진을 localStorage나 서버 응답에 저장하지 않습니다.
- 미션·테마·학습 수준은 기능 제공을 위해 현재 브라우저의 `localStorage`에만 저장합니다. 미션 저장 전 이메일·전화번호·주민등록번호 형식은 제거하고, 프로필 화면에서 저장 범위를 안내합니다.
- AI 질문과 학습 계획만 Gemini 서버로 전송하며, 이메일·전화번호·주민등록번호 형식은 전송 전에 가리고, 채팅 입력에서는 개인정보를 입력하지 않도록 안내합니다.
