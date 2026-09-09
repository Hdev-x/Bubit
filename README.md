# Bubit · Beta

[![CI](https://github.com/Hdev-x/Bubit/actions/workflows/ci.yml/badge.svg)](https://github.com/Hdev-x/Bubit/actions/workflows/ci.yml)

**PC와 모바일에서 암호화폐 시세·차트·호가를 살펴보는 개인 포트폴리오 프로젝트입니다.**
React와 Spring Boot로 만들었으며, 실시간 데이터 처리와 공용 UI 구조를 중심으로 개선했습니다.
현재는 Beta 소스를 공개한 단계이며 외부 서비스 주소는 아직 제공하지 않습니다.

## 주요 기능

- 거래소별 시세·캔들·호가 조회, 관심종목과 종목 검색
- Desktop 다중 패널 차트와 Mobile 전용 화면·PWA
- 차트 지표, SMC·하모닉·파동 분석, 드로잉 도구
- 회원 인증과 Bitget 계좌의 자산·포지션 조회

계좌 연동은 선택 사항입니다. 공개본에는 봇 워커·자동매매·모의투자·관리자 기능을 포함하지 않습니다.
Beta 거래 화면은 계좌 조회 용도이며 실주문 기능을 제공하지 않습니다.

## 기술과 구조

| 경로 | 역할 | 주요 기술 |
| --- | --- | --- |
| `apps/web` | Desktop·Mobile UI, 차트와 클라이언트 상태 | React 19, TypeScript, Vite, Vitest |
| `apps/api` | 인증, 거래소 REST 프록시·WebSocket 중계, 계좌 조회 | Java 21, Spring Boot 3, MyBatis, PostgreSQL |
| `shared` | UI와 분리된 차트 분석 계산 | TypeScript |

[구조와 데이터 흐름](docs/ARCHITECTURE.md) · [실행 방법](docs/SETUP.md) · [트러블슈팅](docs/TROUBLESHOOTING.md)

## 빠른 검증

Node.js 22, Java 21, Python 3가 필요합니다. 아래 검증은 운영 DB나 거래소 API 키 없이 실행합니다.

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
./gradlew bootWar -x test --no-daemon
```

앱 실행에는 별도 로컬 PostgreSQL과 서버 설정이 필요합니다. [설정 예제와 실행 순서](docs/SETUP.md)를 참고하세요.

## 개선한 문제

- 종목·시간봉을 빠르게 바꾸면 이전 요청이 늦게 도착해 새 화면을 덮는 문제
- WebSocket으로 갱신된 현재 봉을 늦은 REST 응답이 되돌리는 문제
- 차트 표시가 보조 데이터 응답을 기다리며 지연되는 문제
- Desktop·Mobile CSS 중복과 분리 과정의 스타일 우선순위 회귀

[트러블슈팅 문서](docs/TROUBLESHOOTING.md)에 원인, 해결 방식, 테스트 범위와 남은 확인 사항을 정리했습니다.

## 현재 범위

자동 테스트와 빌드 검증을 제공하며, 실제 기기·네트워크에서의 전환과 재연결 확인은 계속 진행 중입니다.
공개 소스 검증 완료를 운영 서비스 배포나 보안 감사 완료로 보지 않습니다.

이 저장소는 검토된 소스를 별도 이력으로 공개합니다. 개발 작업 기록, 로컬 환경설정, 사용자 데이터는 포함하지 않습니다.
프로젝트 자체의 별도 오픈소스 라이선스는 아직 지정하지 않았습니다. 외부 라이브러리 고지는 [THIRD_PARTY](docs/THIRD_PARTY.md)에 정리했습니다.
