'use strict';

class Semaphore {
  constructor(max, queueTimeout) {
    if (!Number.isInteger(max) || max < 1) {
      throw new Error('max must be a positive integer');
    }
    if (!Number.isInteger(queueTimeout) || queueTimeout < 0) {
      throw new Error('queueTimeout must be a non-negative integer');
    }
    this.max = max;
    this.queueTimeout = queueTimeout;
    this.active = 0;
    this.queue = [];
  }

  get queued() {
    return this.queue.length;
  }

  acquire() {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.indexOf(entry);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error('Queue timeout'));
      }, this.queueTimeout);

      const entry = { resolve, timer };
      this.queue.push(entry);
    });
  }

  release() {
    if (this.queue.length > 0) {
      const entry = this.queue.shift();
      clearTimeout(entry.timer);
      entry.resolve();
    } else {
      this.active--;
    }
  }
}

module.exports = { Semaphore };
