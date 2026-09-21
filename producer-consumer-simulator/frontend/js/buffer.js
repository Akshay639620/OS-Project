/**
 * BufferManager - Shared Bounded Buffer Simulation
 * Implements a circular bounded buffer with In and Out pointers,
 * capacity bounds, slot state tracking, and event emission.
 */
class BufferManager {
    constructor(capacity = 8) {
        this.capacity = capacity;
        this.slots = new Array(capacity).fill(null);
        this.inPointer = 0;   // Index where next produced item will be placed
        this.outPointer = 0;  // Index where next item will be consumed from
        this.count = 0;       // Current number of items in buffer
        this.listeners = [];
    }

    /**
     * Register a listener callback for buffer state changes
     */
    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    /**
     * Notify all listeners with current state and action details
     */
    notify(action, details = {}) {
        const state = this.getState();
        this.listeners.forEach(cb => cb(state, action, details));
    }

    /**
     * Check if buffer is completely full
     */
    isFull() {
        return this.count >= this.capacity;
    }

    /**
     * Check if buffer is completely empty
     */
    isEmpty() {
        return this.count === 0;
    }

    /**
     * Calculate current buffer utilization percentage
     */
    getUtilization() {
        if (this.capacity === 0) return 0;
        return Math.round((this.count / this.capacity) * 100);
    }

    /**
     * Insert an item into the circular buffer at inPointer
     * Throws an error if buffer is full (enforcing bounds)
     */
    put(item) {
        if (this.isFull()) {
            throw new Error(`Buffer Overflow! Attempted to put item ${item.id} into a full buffer.`);
        }

        const slotIndex = this.inPointer;
        this.slots[slotIndex] = {
            ...item,
            slotIndex,
            insertedAt: Date.now()
        };

        this.inPointer = (this.inPointer + 1) % this.capacity;
        this.count++;

        this.notify('PUT', {
            slotIndex,
            item: this.slots[slotIndex],
            newInPointer: this.inPointer,
            newOutPointer: this.outPointer
        });

        return { slotIndex, item: this.slots[slotIndex] };
    }

    /**
     * Remove and return an item from the circular buffer at outPointer
     * Throws an error if buffer is empty (enforcing bounds)
     */
    get() {
        if (this.isEmpty()) {
            throw new Error('Buffer Underflow! Attempted to get an item from an empty buffer.');
        }

        const slotIndex = this.outPointer;
        const item = this.slots[slotIndex];
        this.slots[slotIndex] = null;

        this.outPointer = (this.outPointer + 1) % this.capacity;
        this.count--;

        this.notify('GET', {
            slotIndex,
            item,
            newInPointer: this.inPointer,
            newOutPointer: this.outPointer
        });

        return { slotIndex, item };
    }

    /**
     * Inspect next item without removing it
     */
    peek() {
        return this.isEmpty() ? null : this.slots[this.outPointer];
    }

    /**
     * Reset buffer with optional new capacity
     */
    reset(newCapacity = null) {
        if (newCapacity && Number.isInteger(newCapacity) && newCapacity > 0) {
            this.capacity = newCapacity;
        }
        this.slots = new Array(this.capacity).fill(null);
        this.inPointer = 0;
        this.outPointer = 0;
        this.count = 0;
        this.notify('RESET', { capacity: this.capacity });
    }

    /**
     * Get complete current snapshot for UI and debugging
     */
    getState() {
        return {
            capacity: this.capacity,
            count: this.count,
            inPointer: this.inPointer,
            outPointer: this.outPointer,
            slots: [...this.slots],
            isFull: this.isFull(),
            isEmpty: this.isEmpty(),
            utilization: this.getUtilization()
        };
    }
}

// Export for browser module or global scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BufferManager;
} else {
    window.BufferManager = BufferManager;
}

