# 공개 소스와 버전 관리

이 저장소는 Bubit의 **포트폴리오용 공개 snapshot**입니다. 제품 개발·버전 관리·빌드·운영 배포는 비공개 개발 저장소에서 진행합니다. 이곳에는 검토한 앱 소스·테스트·공개 문서만 반영하며, 공개 CI는 로컬 재현 가능성을 확인합니다.

## 버전과 기록

| 기록 | 의미 |
| --- | --- |
| [`apps/web/package.json`](../apps/web/package.json)의 `version` | 내보낸 제품 소스의 버전. 화면 푸터도 같은 값을 사용 |
| [CHANGELOG](../CHANGELOG.md) | 기능 추가·오류 수정·사용성 개선 등 사용자가 체감하는 변경 |
| [`releaseNotes.ts`](../apps/web/src/app/shared/updates/releaseNotes.ts) | 푸터 업데이트 팝업에 표시하는 변경 요약 |
| [기술 문제 해결 기록](TROUBLESHOOTING.md) | 구현의 원인·해결·검증 범위 |
| [Pull requests](https://github.com/Hdev-x/Bubit/pulls) | 공개 snapshot의 변경 범위와 검증 결과 |

제품은 `Major.Minor.Patch`를 사용합니다. 오류 수정·UI 정리·리팩터링은 Patch, 기능 추가는 Minor, 호환성을 깨는 변경은 Major에 해당합니다. 초기 `0.x`에서의 호환성 변경은 Minor로 관리합니다. 공개 문서만 고친 경우에는 제품 버전을 별도로 올리지 않습니다.

공개본의 `package.json`과 `package-lock.json`은 같은 원본에서 함께 가져옵니다. 공개 저장소에서 제품 버전이나 의존성을 따로 관리하지 않습니다. 코드 수정이 필요하면 개발 원본에서 수정·검증한 뒤 다음 snapshot에 포함합니다.

## 공개본 갱신 절차

1. 비공개 개발 저장소에서 공개할 버전과 검증된 소스를 확정합니다.
2. 허용된 파일만 내보내고 공개 문서·예제 설정·CI를 적용합니다. 운영 설정·Secret·사용자 데이터·자동매매 worker·내부 도구는 제외합니다.
3. 작업 브랜치에서 기존 공개본과 비교합니다. README의 기능·이미지·버전, 문서 링크, Secret 검사와 공개 경계를 확인합니다.
4. [실행 가이드](SETUP.md)의 Web lint·test·PC/Mobile build·CSS 검사와 API test·bootJar를 공개 CI로 확인합니다. 테스트의 H2/mock 결과를 실제 PostgreSQL·실계좌 검증으로 해석하지 않습니다.
5. 최신 PR head의 검증과 리뷰를 확인하고 유지관리자 승인 후 squash merge합니다.

Public의 merge·CI 실행은 운영 배포를 일으키지 않습니다. 실제 서비스는 별도의 운영 배포 기록으로 추적하며, 공개 snapshot과 시점이 다를 수 있습니다.

## 태그와 GitHub Release

제품 버전, 공개 commit 반영, 태그·GitHub Release 발행은 서로 다른 상태입니다. 공개본에 `v0.2.2`가 표시되어 있어도 동일한 이름의 GitHub Release가 발행됐다는 뜻은 아닙니다.

태그와 Release가 필요할 때는 유지관리자가 별도로 승인한 검증된 공개 commit에 발행합니다. 발행된 태그는 이동하거나 재사용하지 않으며, Release에는 공개 소스 버전·변경 내용·검증 범위·알려진 제한을 기록합니다. 운영 배포가 확인되지 않았다면 배포 완료로 표시하지 않습니다.

보안 수정의 공개 내용과 시점은 [보안 안내](../SECURITY.md)를 따릅니다.
