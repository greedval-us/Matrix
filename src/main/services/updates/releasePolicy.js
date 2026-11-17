export const MAX_RELEASE_BYTES = 2 * 1024 ** 3;
export const RELEASE_CHUNK_BYTES = 256 * 1024;
const versionPattern = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;

export function compareVersions(left, right) {
  if (!versionPattern.test(left) || !versionPattern.test(right)) throw new Error('Некорректный номер версии приложения.');
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return Math.sign(a[i] - b[i]);
  return 0;
}

export function releaseTarget(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && ['x64', 'arm64', 'ia32'].includes(arch)) return { platform, arch, kind: 'portable' };
  if (platform === 'linux' && ['x64', 'arm64'].includes(arch)) return { platform, arch, kind: 'appimage' };
  return null;
}

export function validateRelease(input, target) {
  const size = Number(input?.size);
  const name = input?.name;
  const suffix = target?.kind === 'portable' ? '.exe' : '.appimage';
  if (!input || !target || ['platform', 'arch', 'kind'].some(key => input[key] !== target[key]) ||
    !versionPattern.test(input.version) || typeof name !== 'string' || name.length > 160 ||
    !/^[^<>:"/\\|?*\x00-\x1f]+$/.test(name) || name.startsWith('.') || !name.toLowerCase().endsWith(suffix) ||
    !Number.isSafeInteger(size) || size <= 0 || size > MAX_RELEASE_BYTES ||
    !/^[a-f0-9]{64}$/.test(input.sha256) || typeof input.notes !== 'string' && input.notes !== undefined ||
    (input.notes?.length || 0) > 16000) {
    throw new Error('Сервер вернул некорректные данные обновления.');
  }
  return { version: input.version, platform: input.platform, arch: input.arch, kind: input.kind,
    name, size, sha256: input.sha256, notes: input.notes || '', publishedAt: String(input.published_at ?? input.publishedAt ?? '').slice(0, 64) };
}

export function updateError(error, action = 'download') {
  if (error?.code === 16 || error?.code === 7) return 'Нет доступа к обновлению. Проверьте API-ключ в настройках подключения.';
  if (error?.code === 14 || error?.code === 4) return 'Сервер недоступен. Проверьте подключение и повторите попытку.';
  if (error?.code === 5 || error?.code === 9) return 'Версия на сервере изменилась. Проверьте обновления ещё раз.';
  return action === 'check' ? 'Не удалось проверить обновления. Проверьте настройки подключения и повторите попытку.'
    : 'Не удалось скачать или проверить обновление. Повторите попытку.';
}
