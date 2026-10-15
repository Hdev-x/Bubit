import { useEffect, useRef, useState } from 'react';
import { getToken } from '../../../api/client';
import { fetchMe, logout as authLogout, type AuthUser } from '../../../api/server/authApi';

export function useMobileSession() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const currentRequest = request;
    const generation = ++currentRequest.current;
    void (async () => {
      let currentUser = await fetchMe();
      // 유효 토큰이 남은 일시적 장애만 재시도한다. 공개 시장 조회는 기다리지 않는다.
      if (!currentUser && getToken()) {
        for (const delayMs of [1500, 4000]) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          if (generation !== currentRequest.current) return;
          currentUser = await fetchMe();
          if (currentUser || !getToken()) break;
        }
      }
      if (generation !== currentRequest.current) return;
      setUser(currentUser);
      setAuthChecked(true);
    })();
    return () => { currentRequest.current++; };
  }, []);

  function updateUser(next: AuthUser) {
    request.current++;
    setUser(next);
    setAuthChecked(true);
  }

  function logout() {
    request.current++;
    authLogout();
    setUser(null);
    setAuthChecked(true);
  }

  return { authChecked, user, setUser: updateUser, logout };
}
