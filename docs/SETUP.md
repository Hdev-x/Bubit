# 로컬 실행

## 준비물

- Node.js 22
- Java 21
- PostgreSQL
- Python 3 (`npm run check:css`에서 사용)

이 공개 Beta에는 자동매매·Paper Trading·Backtest·Push·Admin 코드와 `trading` profile이 없습니다. API는 실제 거래소 주문을 실행하지 않으며, 외부 서비스에 배포하는 절차도 이 문서에 포함하지 않습니다.

## 첫 검증

```bash
cd apps/web
npm ci
npm run lint
npm test
npm run build
npm run build:desktop
npm run check:css

cd ../api
./gradlew test --no-daemon
./gradlew bootWar -x test
```

API test는 H2 in-memory DB와 테스트 전용 더미 값을 사용합니다. PostgreSQL이나 실제 credential은 필요하지 않습니다.

## PostgreSQL 준비

새 빈 database와 전용 사용자를 만든 뒤, repository root에서 schema를 한 번 적용합니다.

```bash
psql -d bubit -f docs/schema.sql
```

`docs/schema.sql`은 PostgreSQL용이며 `members`, 암호화된 거래소 API key, 수동 매수 평균가 table만 만듭니다. 애플리케이션은 schema를 자동 변경하지 않으므로 schema 변경이 생기면 SQL을 검토한 뒤 직접 적용해야 합니다.

## API 설정과 실행

예제를 로컬 설정 파일로 복사합니다. `application.properties`는 Git에서 제외됩니다.

```bash
cp apps/api/config/application.example.properties apps/api/src/main/resources/application.properties
mkdir -p apps/api/uploads
```

다음 환경변수를 현재 shell에 설정합니다. 값은 각자 생성하고 password manager 등 안전한 곳에 보관합니다.

```bash
export BUBIT_DB_URL='jdbc:postgresql://localhost:5432/bubit'
export BUBIT_DB_USERNAME='YOUR_DATABASE_USER'
read -s BUBIT_DB_PASSWORD  # DB 비밀번호를 입력하고 Enter (입력값은 화면에 표시되지 않음)
export BUBIT_DB_PASSWORD
export BUBIT_JWT_SECRET="$(openssl rand -base64 48)"
export BUBIT_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

`BUBIT_ENCRYPTION_KEY`는 기존에 저장한 API key를 복호화하는 열쇠이므로 운영 중 바꾸면 안 됩니다. `BUBIT_JWT_SECRET`, DB credential, 거래소 credential을 source나 `VITE_*` 변수에 넣지 마세요. `VITE_*` 값은 browser bundle에 포함되어 사용자에게 공개됩니다.

```bash
cd apps/api
./gradlew bootRun
```

API는 `http://localhost:8081`에서 실행됩니다.

## Web 실행

별도 terminal 두 개에서 Mobile과 Desktop을 실행합니다. Vite는 기본적으로 API `http://localhost:8081`을 proxy합니다. REST와 WebSocket 모두 기본 로컬 API 주소를 사용합니다.

```bash
cd apps/web
npm run dev
```

Mobile: `http://localhost:5173/mobile/`

```bash
cd apps/web
npm run dev:desktop
```

Desktop: `http://localhost:5174/web/`

새 계정은 PC 화면의 로그인 → 회원가입에서 생성합니다. Mobile에서는 같은 계정으로 로그인합니다. mapper는 `members` table을 사용합니다. 거래소 API key는 server에서 암호화한 뒤 `bot_api_keys`에 저장되며 browser나 repository에 저장하면 안 됩니다. 현재 지원 범위는 [사용 가이드](USER-GUIDE.md)를 참고하세요.

## 검증 범위

`PublicSchemaTest`는 같은 schema를 H2 PostgreSQL 호환 모드에 적용해 회원 생성·로그인 mapper 계약을 검사합니다. 이는 SQL의 기본 구조와 MyBatis mapping을 확인하는 smoke test이며 PostgreSQL의 권한, locking, query planner, 운영 migration 동작까지 보장하지 않습니다. 실제 배포 전에는 별도의 PostgreSQL 환경에서 schema 적용과 API 통합 검증이 필요합니다.
