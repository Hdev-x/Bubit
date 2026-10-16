import { authHeader } from '../client';

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || (response.status === 413
      ? '사진은 1MB 이하로 선택하세요.' : '프로필을 저장하지 못했습니다. 다시 시도해주세요.'));
  }
  return data as T;
}

export async function updateProfile(name: string): Promise<{ name: string }> {
  return readResponse(await fetch('/api/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ name }),
  }));
}

export async function uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
  const body = new FormData();
  body.append('file', file);
  return readResponse(await fetch('/api/user/profile/avatar', { method: 'POST', headers: authHeader(), body }));
}
