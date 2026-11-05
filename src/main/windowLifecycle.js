export const MINIMUM_SPLASH_TIME_MS = 2000;

export function showWindowAfterSplash(main, splash, {
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
  minimumTimeMs = MINIMUM_SPLASH_TIME_MS,
} = {}) {
  const started = now();
  let timer;
  const closeSplash = () => { if (!splash.isDestroyed()) splash.destroy(); };
  const onClosed = () => {
    if (timer !== undefined) clearTimer(timer);
    closeSplash();
  };
  main.once("closed", onClosed);
  main.once("ready-to-show", () => {
    if (main.isDestroyed()) return;
    timer = setTimer(() => {
      timer = undefined;
      closeSplash();
      if (!main.isDestroyed()) main.show();
    }, Math.max(0, minimumTimeMs - (now() - started)));
  });
}
