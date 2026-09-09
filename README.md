<p align="center">
  <img src="apps/web/public/botz-icon.svg" alt="Bubit 로고" width="80" height="80" />
</p>

<h1 align="center"><img src="docs/images/title.svg" alt="Bubit Beta" width="240" height="44" /></h1>

<p align="center">
  <strong>시세 확인부터 차트 분석까지, PC와 모바일에서.</strong><br />
  여러 거래소의 암호화폐 마켓과 차트를 한곳에서 살펴보세요.
</p>

<p align="center">
  <a href="docs/SETUP.md">시작하기</a> ·
  <a href="docs/USER-GUIDE.md">사용 가이드</a> ·
  <a href="CHANGELOG.md">업데이트</a> ·
  <a href="SUPPORT.md">피드백</a>
</p>

<p align="center">
  <a href="https://github.com/Hdev-x/Bubit/actions/workflows/ci.yml"><img src="https://github.com/Hdev-x/Bubit/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

> **Beta 소스 공개 중** · 현재는 로컬에서 실행할 수 있으며, 외부 접속용 서비스 주소는 준비 중입니다.

## 주요 기능

| 기능 | 할 수 있는 일 |
| --- | --- |
| 실시간 마켓 | 거래소별 시세와 호가를 확인하고, 종목을 검색하거나 관심종목으로 관리합니다. |
| 차트 분석 | 시간봉을 전환하며 지표, SMC·하모닉·파동 분석과 드로잉 도구를 사용합니다. |
| PC·Mobile 화면 | PC에서는 차트·시세·호가 패널을 함께 보고, Mobile에서는 전용 탭과 시트로 마켓·차트·자산을 확인합니다. |
| 계좌 조회 | Bitget 계좌를 연결해 자산과 포지션을 확인합니다. 계좌 연동은 선택 사항입니다. |

**시세·차트 지원 거래소:** Binance · Bitget · Upbit · Bithumb

계좌 연동은 Bitget만 지원합니다. Beta의 거래 화면은 조회용이며 실제 주문·자동매매 기능은 제공하지 않습니다.

차트 지표·분석 도구는 Mobile에서 사용할 수 있으며, 현재 PC의 지표 기능은 관리자 계정으로 제한됩니다.

## 시작하기

Node.js 22, Java 21, PostgreSQL이 필요합니다. 저장소를 내려받은 뒤 [로컬 실행 가이드](docs/SETUP.md)에 따라 DB와 API를 설정하고 Web을 실행하세요.

```bash
git clone https://github.com/Hdev-x/Bubit.git
cd Bubit
```

로컬 실행을 마치면 다음 주소에서 사용할 수 있습니다.

- **PC:** [localhost:5174/web/](http://localhost:5174/web/) — 로그인 전에도 실시간 마켓을 살펴볼 수 있습니다.
- **Mobile:** [localhost:5173/mobile/](http://localhost:5173/mobile/) — PC 화면에서 가입한 계정으로 로그인해 사용합니다. PC 브라우저에서도 Mobile 화면을 열 수 있습니다.

처음에는 마켓에서 거래소와 종목을 고른 뒤 차트에서 시간봉과 지표를 바꿔보세요. 계좌 정보가 필요한 경우에만 Bitget을 연결하면 됩니다. 자세한 이용 범위는 [사용 가이드](docs/USER-GUIDE.md)에 있습니다.

## Beta 안내와 피드백

Beta 기간에는 기능과 화면을 계속 다듬습니다. 거래소 응답이나 네트워크 상태에 따라 시세 갱신이 지연될 수 있으며, 실제 기기에서의 차트 전환과 재연결을 점검하고 있습니다.

사용자에게 보이는 변경은 [변경 이력](CHANGELOG.md)에 계속 쌓습니다. 아직 버전 태그·Release는 없으며, 발행한 버전은 [GitHub Releases](https://github.com/Hdev-x/Bubit/releases)에도 게시합니다.

- [문제 신고·기능 제안](SUPPORT.md) — 일반 피드백은 공개 Issue로 받습니다.
- [보안 문제 신고](SECURITY.md) — 취약점은 비공개 신고 경로로 받습니다.
- [데이터 저장과 삭제](docs/DATA.md) — 로컬 DB·브라우저 저장 정보와 현재 삭제 가능한 범위를 안내합니다.

## 개발 문서

React 19 · TypeScript · Vite · Java 21 · Spring Boot 3 · MyBatis · PostgreSQL

- [로컬 실행과 테스트](docs/SETUP.md)
- [프로젝트 구조와 데이터 흐름](docs/ARCHITECTURE.md)
- [기술 문제 해결 기록](docs/TROUBLESHOOTING.md)
- [버전과 릴리즈 관리](docs/RELEASING.md)
- [외부 라이브러리와 출처](docs/THIRD_PARTY.md)

Bubit 자체의 별도 오픈소스 라이선스는 아직 지정하지 않았습니다.
