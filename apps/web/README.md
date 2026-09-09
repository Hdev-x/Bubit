# Bubit Web

Desktop(`/web/`)과 Mobile(`/mobile/`) 두 진입점을 가진 React·Vite 앱입니다.

- [전체 실행 방법](../../docs/SETUP.md)
- [구조와 데이터 흐름](../../docs/ARCHITECTURE.md)
- [트러블슈팅](../../docs/TROUBLESHOOTING.md)

```bash
npm ci
npm run dev          # Mobile: http://localhost:5173/mobile/
npm run dev:desktop  # Desktop: http://localhost:5174/web/ (별도 터미널)
```

개발 서버는 API 요청을 `http://localhost:8081`로 프록시합니다.
