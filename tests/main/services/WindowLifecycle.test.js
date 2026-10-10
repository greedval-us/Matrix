import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { showWindowAfterSplash } from "../../../src/main/windowLifecycle.js";

function window() {
  const result = new EventEmitter();
  result.destroyed = false;
  result.shown = 0;
  result.isDestroyed = () => result.destroyed;
  result.show = () => { result.shown += 1; };
  result.destroy = () => { result.destroyed = true; result.emit("closed"); };
  return result;
}

test("closing the main window before splash delay cancels its pending show", () => {
  const main = window();
  const splash = window();
  let callback;
  let cleared;
  showWindowAfterSplash(main, splash, { now: () => 0, setTimer: (fn) => { callback = fn; return 42; }, clearTimer: (id) => { cleared = id; } });
  main.emit("ready-to-show");
  main.destroy();
  callback();
  assert.equal(cleared, 42);
  assert.equal(main.shown, 0);
  assert.equal(splash.destroyed, true);
});

test("each window delay captures its own main window and splash", () => {
  const first = window();
  const firstSplash = window();
  const second = window();
  const secondSplash = window();
  const callbacks = [];
  const options = { now: () => 0, setTimer: (fn) => callbacks.push(fn), clearTimer() {} };
  showWindowAfterSplash(first, firstSplash, options);
  showWindowAfterSplash(second, secondSplash, options);
  first.emit("ready-to-show");
  second.emit("ready-to-show");
  callbacks[0]();
  assert.equal(first.shown, 1);
  assert.equal(second.shown, 0);
  assert.equal(firstSplash.destroyed, true);
  assert.equal(secondSplash.destroyed, false);
});
