import { useEffect, useRef, useState } from 'react';
import BottomTabBar, { type AppRoute } from './components/BottomTabBar';
import AssetsPage from './pages/AssetsPage';
import CoinChartPage from './pages/CoinChartPage';
import CoinListPage from './pages/CoinListPage';
import MobileTradePage from './pages/MobileTradePage';
import MyPageDialog, { type SettingsSection } from '../shared/account/MyPageDialog';
import { useMobileSession } from './hooks/useMobileSession';
import StrategyComingSoon from '../../shared/ui/StrategyComingSoon';
import LoginPage from './pages/LoginPage';
import type { AuthUser } from '../../api/server/authApi';
import { isBitgetSymbolSupported, prefetchBitgetSymbols } from '../../api/exchange/bitget/bitgetSymbols';
import { prefetchBinanceSymbols } from '../../api/exchange/binance/binanceSymbols';
import { useDocumentVisible } from '../../hooks/ui/usePageVisible';
import { listenRealtimeTicker } from '../../api/server/coinRealtime';
import { loadWithTimeout } from '../../chart/hooks/loadWithTimeout';
import { isKrwExchange, type ExchangeId } from '../../shared/constants/exchanges';

function getRoute(hash: string): AppRoute {
  const path = hash.replace(/^#/, '');
  if (path === '/chart' || path === '/orders' || path === '/strategy' || path === '/assets') {
    return path as AppRoute;
  }

  return '/';
}

export default function App() {
  const { authChecked, user, setUser, logout } = useMobileSession();
  const [loginRequested, setLoginRequested] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null);

  function handleLogin(nextUser: AuthUser) {
    setUser(nextUser);
    setLoginRequested(false);
  }

  function handleLogout() {
    tradeRequestSeqRef.current++;
    setTradeError(null);
    setSettingsSection(null);
    logout();
    if (route !== '/' && route !== '/chart') navigate('/');
  }

  const [route, setRoute] = useState<AppRoute>(() => getRoute(window.location.hash));
  // 앱이 보일 때만 true. 각 페이지 active = (현재 라우트) && visible → 화면 밖/백그라운드면 폴링·구독 정지.
  const visible = useDocumentVisible();
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [selectedProductType, setSelectedProductType] = useState<string | undefined>('USDT-FUTURES');
  const [selectedExchange, setSelectedExchange] = useState<ExchangeId>('BINANCE');
  const [selectedTickDecimals, setSelectedTickDecimals] = useState<number>(2);

  // 차트는 자체 타이틀을 관리한다. 다른 탭은 화면이 이미 구독한 시세만 듣는다.
  const isFutures = selectedProductType?.includes('FUTURES') ?? false;
  useEffect(() => {
    if (route === '/chart' || !visible) return;
    document.title = 'Bubit';
    if (isKrwExchange(selectedExchange)) return;
    let listening = true;
    const topic = selectedExchange === 'BINANCE'
      ? `/topic/binance-${isFutures ? 'futures' : 'spot'}/${selectedSymbol}`
      : `/topic/coin${isFutures ? '-futures' : ''}/${selectedSymbol}`;
    const subscription = listenRealtimeTicker(topic, ticker => {
      if (!listening || ticker.symbol !== selectedSymbol) return;
      const price = ticker.price.toLocaleString(undefined, {
        minimumFractionDigits: selectedTickDecimals,
        maximumFractionDigits: selectedTickDecimals,
      });
      const rate = ticker.changeRate == null ? '' : ` (${ticker.changeRate > 0 ? '+' : ''}${(ticker.changeRate * 100).toFixed(2)}%)`;
      document.title = `${selectedSymbol} ${price}${rate}`;
    });
    return () => { listening = false; subscription.close(); };
  }, [route, visible, selectedExchange, selectedSymbol, isFutures, selectedTickDecimals]);

  // 차트·마켓에서 트레이드 진입 시 현물/선물 마켓 지정(seq로 매번 재적용). 거래소는 항상 비트겟.
  const [tradeMarketReq, setTradeMarketReq] = useState<{ market: 'spot' | 'futures'; seq: number } | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const tradeRequestSeqRef = useRef(0);
  const tradeMountedRef = useRef(true);

  const [visitedRoutes, setVisitedRoutes] = useState<Set<AppRoute>>(new Set([getRoute(window.location.hash)]));

  // 거래/자산/전략 탭바 공유 슬라이드 인디케이터 — 각 페이지가 활성 탭 위치(뷰포트 x,y)를 보고하면
  // App이 단일 바를 그 자리로 슬라이드시킨다(페이지 전환 시에도 바가 미끄러져 이동).
  const [tabBar, setTabBar] = useState<{ x: number; y: number } | null>(null);
  const showTabBar = user && !loginRequested && (route === '/orders' || route === '/assets' || route === '/strategy') && tabBar !== null;

  useEffect(() => {
    tradeMountedRef.current = true;
    // 트레이드 가용성 가드용 비트겟 심볼 + 차트 거래소 우선순위용 바이낸스 선물 심볼 미리 받기(즉시 판정)
    prefetchBitgetSymbols();
    prefetchBinanceSymbols();

    // iOS PWA 하단 탭바 붕 뜨는 버그(Ghost Safe Area) 강제 재계산
    const nav: Navigator & { standalone?: boolean } = window.navigator; // iOS Safari 전용 필드
    if (nav.standalone || window.matchMedia('(display-mode: standalone)').matches) {
      const fixViewport = () => window.scrollTo(0, 0);
      setTimeout(fixViewport, 50);
      setTimeout(fixViewport, 300);
    }

    function syncRoute() {
      setLoginRequested(false);
      setTradeError(null);
      const nextRoute = getRoute(window.location.hash);
      setRoute(nextRoute);
      setVisitedRoutes(prev => new Set(prev).add(nextRoute));
    }

    // 모바일 기기(iOS/웹뷰)의 좌우 가장자리 뒤로가기/앞으로가기 스와이프 제스처 무력화
    let isEdgeTouch = false;

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (touch) {
        // 좌측 끝 24px 이내 또는 우측 끝 24px 이내에서 터치 시작 시 플래그 켬
        if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) {
          isEdgeTouch = true;
        } else {
          isEdgeTouch = false;
        }
      }
    }

    function handleTouchMove(e: TouchEvent) {
      if (isEdgeTouch) {
        // 가장자리 터치 시작 후 움직일 때 브라우저 기본 내비게이션(뒤로가기 등) 차단
        e.preventDefault();
      }
    }

    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      tradeMountedRef.current = false;
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, []);

  // 페이지를 display로만 토글하는 구조라 window.scrollY가 페이지 간에 공유된다.
  // 라우트별로 스크롤을 저장/복원해 "이전 페이지 스크롤이 남아 내려간 채 열리는" 튐을 막는다.
  // (처음 가는 페이지는 0에서 시작)
  const scrollPositionsRef = useRef<Partial<Record<AppRoute, number>>>({});
  const prevRouteRef = useRef(route);
  useEffect(() => {
    const prev = prevRouteRef.current;
    if (prev !== route) {
      scrollPositionsRef.current[prev] = window.scrollY;
      prevRouteRef.current = route;
    }
    const saved = scrollPositionsRef.current[route] ?? 0;
    requestAnimationFrame(() => window.scrollTo(0, saved));
  }, [route]);

  function navigate(nextRoute: AppRoute) {
    setLoginRequested(false);
    tradeRequestSeqRef.current++;
    setTradeError(null);
    if (nextRoute === route) {
      return;
    }

    window.location.hash = nextRoute === '/' ? '' : nextRoute;
    setRoute(nextRoute);
    setVisitedRoutes(prev => new Set(prev).add(nextRoute));
  }

  async function openTrade(symbolArg?: string, marketArg?: 'spot' | 'futures') {
    const requestSeq = ++tradeRequestSeqRef.current;
    const requestHash = window.location.hash;
    setTradeError(null);
    const sym = symbolArg ?? selectedSymbol;
    const market = marketArg ?? (selectedProductType ? 'futures' : 'spot');
    if (!user) {
      setSelectedSymbol(sym);
      setSelectedProductType(market === 'futures' ? 'USDT-FUTURES' : undefined);
      setTradeMarketReq(current => ({ market, seq: (current?.seq ?? 0) + 1 }));
      navigate('/orders');
      return;
    }
    const controller = new AbortController();
    const supported = await loadWithTimeout(isBitgetSymbolSupported(sym, market), controller.signal).catch(() => true);
    if (!tradeMountedRef.current || requestSeq !== tradeRequestSeqRef.current || window.location.hash !== requestHash) return;
    if (!supported) {
      const label = market === 'futures' ? '선물' : '현물';
      setTradeError(`${sym}는 Bitget ${label}에서 지원하지 않는 심볼입니다.`);
      return;
    }
    setSelectedSymbol(sym);
    setSelectedProductType(market === 'futures' ? 'USDT-FUTURES' : undefined);
    setTradeMarketReq(current => ({ market, seq: (current?.seq ?? 0) + 1 }));
    navigate('/orders');
  }

  const privateRoute = route === '/orders' || route === '/strategy' || route === '/assets';
  const showLogin = !user && (loginRequested || privateRoute);
  const pageActive = visible && !showLogin && !settingsSection;

  return (
    <div className="app-frame">
      {showLogin && (authChecked
        ? <LoginPage onSuccess={handleLogin} onBrowse={() => { setLoginRequested(false); if (privateRoute) navigate('/'); }} />
        : <p role="status">로그인 정보를 확인하고 있습니다.</p>)}
      <div style={{ display: !showLogin && route === '/' ? 'block' : 'none', height: '100%' }}>
        {visitedRoutes.has('/') && <CoinListPage
          active={route === '/' && pageActive}
          selectedSymbol={selectedSymbol}
          onSelectSymbol={setSelectedSymbol}
          onOpenChart={() => navigate('/chart')}
          onOpenTrade={openTrade}
          onProductTypeChange={setSelectedProductType}
          onExchangeChange={setSelectedExchange}
          onTickDecimalsChange={setSelectedTickDecimals}
          onLogout={handleLogout}
          user={user}
          onAccount={() => setSettingsSection('profile')}
          onLogin={() => setLoginRequested(true)}
        />}
      </div>
      <div style={{ display: !showLogin && route === '/chart' ? 'block' : 'none', height: '100%' }}>
        {visitedRoutes.has('/chart') && <CoinChartPage
          routeActive={route === '/chart' && !showLogin}
          active={route === '/chart' && pageActive}
          canUseIndicators={!!user}
          onLogin={() => setLoginRequested(true)}
          symbol={selectedSymbol}
          onSelectSymbol={setSelectedSymbol}
          productType={selectedProductType}
          exchange={selectedExchange}
          tickDecimals={selectedTickDecimals}
          onExchangeChange={setSelectedExchange}
          onProductTypeChange={setSelectedProductType}
          focusTracker={null}
        />}
      </div>
      <div style={{ display: user && route === '/orders' ? 'block' : 'none', height: '100%' }}>
        {user && visitedRoutes.has('/orders') && <MobileTradePage
          user={user}
          onOpenPaperSettings={() => setSettingsSection('paper')}
          symbol={selectedSymbol}
          active={route === '/orders' && pageActive}
          onSelectSymbol={setSelectedSymbol}
          onProductTypeChange={setSelectedProductType}
          onExchangeChange={setSelectedExchange}
          onOpenChart={() => navigate('/chart')}
          tradeMarketReq={tradeMarketReq}
          onTabBar={setTabBar}
        />}
      </div>
      <div style={{ display: user && route === '/strategy' ? 'block' : 'none', height: '100%' }}>
        {user && visitedRoutes.has('/strategy') && <StrategyComingSoon />}
      </div>
      <div style={{ display: user && route === '/assets' ? 'block' : 'none', height: '100%' }}>
        {user && visitedRoutes.has('/assets') && <AssetsPage active={route === '/assets' && pageActive} onTabBar={setTabBar} />}
      </div>

      {/* 거래/자산 공유 탭 인디케이터 — 페이지가 바뀌어도 같은 바가 새 활성탭 자리로 슬라이드 */}
      {showTabBar && tabBar && (
        <span style={{ position: 'fixed', left: 0, top: 0, width: 22, height: 3, borderRadius: 3, background: '#fff', zIndex: 25, pointerEvents: 'none', transform: `translate(${tabBar.x}px, ${tabBar.y}px)`, transition: 'transform 0.26s ease' }} />
      )}

      {tradeError && (
        <div role="status" style={{ position: 'fixed', left: '50%', bottom: 88, transform: 'translateX(-50%)', zIndex: 30, padding: '10px 16px', borderRadius: 10, background: 'rgba(28,30,34,0.96)', color: '#eaecef' }}>
          <span>{tradeError}</span>
          <button type="button" onClick={() => setTradeError(null)} aria-label="안내 닫기">×</button>
        </div>
      )}

      {settingsSection && user && <MyPageDialog user={user} initialSection={settingsSection} onClose={() => setSettingsSection(null)} onUserChange={setUser} />}

      <BottomTabBar activeRoute={route} onNavigate={navigate} />
    </div>
  );
}
