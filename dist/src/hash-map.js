"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HashMap = void 0;
const INITIAL_CAPACITY = 16;
const MAX_LOAD_FACTOR = 0.75;
const MIN_LOAD_FACTOR = 0.25;
class HashMap {
    buckets = new Array(INITIAL_CAPACITY);
    count = 0;
    get capacity() {
        return this.buckets.length;
    }
    get size() {
        return this.count;
    }
    set(key, value) {
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
    get(key) {
        let entry = this.buckets[this.bucketIndex(key, this.buckets.length)];
        while (entry) {
            if (entry.key === key) {
                return entry.value;
            }
            entry = entry.next;
        }
        return undefined;
    }
    has(key) {
        let entry = this.buckets[this.bucketIndex(key, this.buckets.length)];
        while (entry) {
            if (entry.key === key) {
                return true;
            }
            entry = entry.next;
        }
        return false;
    }
    keys() {
        const result = [];

        for (const bucket of this.buckets) {
            let entry = bucket;
            while (entry) {
                result.push(entry.key);
                entry = entry.next;
            }
        }
        return result;
    }
    delete(key) {
        const index = this.bucketIndex(key, this.buckets.length);
        let entry = this.buckets[index];
        let previous;
        while (entry) {
            if (entry.key === key) {
                if (previous) {
                    previous.next = entry.next;
                }
                else {
                    this.buckets[index] = entry.next;
                }
                this.count -= 1;
                if (this.buckets.length > INITIAL_CAPACITY &&
                    this.count / this.buckets.length < MIN_LOAD_FACTOR) {
                    this.resize(Math.max(INITIAL_CAPACITY, this.buckets.length / 2));
                }
                return true;
            }
            previous = entry;
            entry = entry.next;
        }
        return false;
    }
    bucketIndex(key, capacity) {
        let hash = 0x811c9dc5;
        for (let i = 0; i < key.length; i += 1) {
            hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
        }
        return (hash >>> 0) % capacity;
    }
    resize(capacity) {
        const newBuckets = new Array(capacity);
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
exports.HashMap = HashMap;
