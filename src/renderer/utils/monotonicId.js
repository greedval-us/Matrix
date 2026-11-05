export function createMonotonicIdGenerator(now = () => Date.now()) {
  let previous = 0;
  return () => {
    previous = Math.max(now(), previous + 1);
    return previous;
  };
}
