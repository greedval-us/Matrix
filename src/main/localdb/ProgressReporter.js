export class ProgressReporter {
  constructor(onProgress = null) {
    this.onProgress = typeof onProgress === "function" ? onProgress : null;
  }

  emit(stage, payload = {}) {
    if (!this.onProgress) return;

    this.onProgress({
      stage,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  }
}
