import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class BackupLockService {
  private tail: Promise<void> = Promise.resolve();
  private readonly runningCount = signal(0);

  readonly isBusy = computed(() => this.runningCount() > 0);

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    this.runningCount.update((count) => count + 1);
    try {
      return await task();
    } finally {
      this.runningCount.update((count) => count - 1);
      release();
    }
  }
}
