type Entry<Value> = {
  key: string;
  value: Value;
  next: Entry<Value> | undefined;
};

const INITIAL_CAPACITY = 16;
const MAX_LOAD_FACTOR = 0.75;
const MIN_LOAD_FACTOR = 0.25;

export class HashMap<Value> {
  private buckets: Array<Entry<Value> | undefined> = new Array(INITIAL_CAPACITY);
  private count = 0;

  get size(): number {
    return this.count;
  }

  set(key: string, value: Value): void {
    let index = this.bucketIndex(key, this.buckets.length);
    let entry = this.buckets[index];

    while (entry) {
      if (entry.key === key) {
        entry.value = value;
        return;
      }
      entry = entry.next;
    }

    if ((this.count + 1) / this.buckets.length > MAX_LOAD_FACTOR) {
      this.resize(this.buckets.length * 2);
      index = this.bucketIndex(key, this.buckets.length);
    }

    this.buckets[index] = {
      key,
      value,
      next: this.buckets[index],
    };
    this.count += 1;
  }

  get(key: string): Value | undefined {
    let entry = this.buckets[this.bucketIndex(key, this.buckets.length)];

    while (entry) {
      if (entry.key === key) {
        return entry.value;
      }
      entry = entry.next;
    }

    return undefined;
  }

  has(key: string): boolean {
    let entry = this.buckets[this.bucketIndex(key, this.buckets.length)];

    while (entry) {
      if (entry.key === key) {
        return true;
      }
      entry = entry.next;
    }

    return false;
  }

  delete(key: string): boolean {
    const index = this.bucketIndex(key, this.buckets.length);
    let entry = this.buckets[index];
    let previous: Entry<Value> | undefined;

    while (entry) {
      if (entry.key === key) {
        if (previous) {
          previous.next = entry.next;
        } else {
          this.buckets[index] = entry.next;
        }

        this.count -= 1;
        if (
          this.buckets.length > INITIAL_CAPACITY &&
          this.count / this.buckets.length < MIN_LOAD_FACTOR
        ) {
          this.resize(Math.max(INITIAL_CAPACITY, this.buckets.length / 2));
        }
        return true;
      }

      previous = entry;
      entry = entry.next;
    }

    return false;
  }

  private bucketIndex(key: string, capacity: number): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < key.length; i += 1) {
      hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
    }
    return (hash >>> 0) % capacity;
  }

  private resize(capacity: number): void {
    const newBuckets: Array<Entry<Value> | undefined> = new Array(capacity);

    for (const bucket of this.buckets) {
      let entry = bucket;
      while (entry) {
        const next = entry.next;
        const index = this.bucketIndex(entry.key, capacity);
        entry.next = newBuckets[index];
        newBuckets[index] = entry;
        entry = next;
      }
    }

    this.buckets = newBuckets;
  }
}
