/**
 * SynchronizationManager - POSIX Synchronization Primitives Simulator
 * Implements:
 * 1. AsyncMutex (Binary Semaphore for Critical Section)
 * 2. CountingSemaphore (for empty and full buffer slot tracking)
 * 3. SynchronizationManager coordinating thread queues and notifications
 */

class AsyncMutex {
    constructor(name = 'BufferMutex') {
        this.name = name;
        this.isLocked = false;
        this.owner = null;
        this.waitQueue = []; // [{ threadId, resolve }]
    }

    acquire(threadId) {
        if (!this.isLocked) {
            this.isLocked = true;
            this.owner = threadId;
            return Promise.resolve(true);
        }

        return new Promise(resolve => {
            this.waitQueue.push({ threadId, resolve });
        });
    }

    release(threadId) {
        if (!this.isLocked) {
            return false;
        }

        // Only the current owner should release the mutex
        if (this.owner !== threadId) {
            console.warn(`Thread ${threadId} tried to unlock mutex owned by ${this.owner}`);
        }

        if (this.waitQueue.length > 0) {
            const next = this.waitQueue.shift();
            this.owner = next.threadId;
            next.resolve(true);
            return true;
        } else {
            this.isLocked = false;
            this.owner = null;
            return true;
        }
    }

    reset() {
        // Cancel all pending waiters if reset
        while (this.waitQueue.length > 0) {
            const waiter = this.waitQueue.shift();
            waiter.resolve(false);
        }
        this.isLocked = false;
        this.owner = null;
    }

    getWaiters() {
        return this.waitQueue.map(w => w.threadId);
    }
}

class CountingSemaphore {
    constructor(name, initialValue = 0) {
        this.name = name;
        this.value = initialValue;
        this.waitQueue = []; // [{ threadId, resolve }]
    }

    wait(threadId) {
        this.value--;
        if (this.value >= 0) {
            return Promise.resolve(true);
        }

        return new Promise(resolve => {
            this.waitQueue.push({ threadId, resolve });
        });
    }

    signal() {
        this.value++;
        if (this.waitQueue.length > 0) {
            const next = this.waitQueue.shift();
            next.resolve(true);
            return true;
        }
        return false;
    }

    reset(newValue = 0) {
        while (this.waitQueue.length > 0) {
            const waiter = this.waitQueue.shift();
            waiter.resolve(false);
        }
        this.value = newValue;
    }

    getWaiters() {
        return this.waitQueue.map(w => w.threadId);
    }
}

class SynchronizationManager {
    constructor(bufferCapacity = 8) {
        this.bufferCapacity = bufferCapacity;
        this.mutex = new AsyncMutex('Buffer_Mutex');
        this.emptySem = new CountingSemaphore('sem_empty', bufferCapacity);
        this.fullSem = new CountingSemaphore('sem_full', 0);
        this.criticalSectionThread = null;
        this.listeners = [];
    }

    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    notify(action, details = {}) {
        const state = this.getState();
        this.listeners.forEach(cb => cb(state, action, details));
    }

    /**
     * Set which thread is currently executing inside the Critical Section
     */
    setCriticalSection(threadId) {
        this.criticalSectionThread = threadId;
        this.notify('CRITICAL_SECTION_CHANGE', { threadId });
    }

    clearCriticalSection(threadId) {
        if (this.criticalSectionThread === threadId) {
            this.criticalSectionThread = null;
            this.notify('CRITICAL_SECTION_CHANGE', { threadId: null });
        }
    }

    /**
     * Acquire Mutex
     */
    async lockMutex(threadId) {
        this.notify('MUTEX_WAITING', { threadId });
        const acquired = await this.mutex.acquire(threadId);
        if (acquired) {
            this.notify('MUTEX_LOCKED', { threadId });
        }
        return acquired;
    }

    /**
     * Release Mutex
     */
    unlockMutex(threadId) {
        const released = this.mutex.release(threadId);
        this.notify('MUTEX_UNLOCKED', { threadId, nextOwner: this.mutex.owner });
        return released;
    }

    /**
     * Wait on Empty Semaphore (Used by Producers)
     */
    async waitEmpty(producerId) {
        this.notify('EMPTY_SEM_WAIT', { producerId, valueBefore: this.emptySem.value });
        const granted = await this.emptySem.wait(producerId);
        this.notify('EMPTY_SEM_GRANTED', { producerId, valueAfter: this.emptySem.value });
        return granted;
    }

    /**
     * Signal Full Semaphore (Used by Producers to notify Consumers)
     */
    signalFull(producerId) {
        this.fullSem.signal();
        this.notify('FULL_SEM_SIGNAL', { producerId, valueAfter: this.fullSem.value });
    }

    /**
     * Wait on Full Semaphore (Used by Consumers)
     */
    async waitFull(consumerId) {
        this.notify('FULL_SEM_WAIT', { consumerId, valueBefore: this.fullSem.value });
        const granted = await this.fullSem.wait(consumerId);
        this.notify('FULL_SEM_GRANTED', { consumerId, valueAfter: this.fullSem.value });
        return granted;
    }

    /**
     * Signal Empty Semaphore (Used by Consumers to notify Producers)
     */
    signalEmpty(consumerId) {
        this.emptySem.signal();
        this.notify('EMPTY_SEM_SIGNAL', { consumerId, valueAfter: this.emptySem.value });
    }

    /**
     * Reset all synchronization primitives with new capacity
     */
    reset(bufferCapacity = null) {
        if (bufferCapacity !== null) {
            this.bufferCapacity = bufferCapacity;
        }
        this.mutex.reset();
        this.emptySem.reset(this.bufferCapacity);
        this.fullSem.reset(0);
        this.criticalSectionThread = null;
        this.notify('RESET', { bufferCapacity: this.bufferCapacity });
    }

    /**
     * Get current synchronization status for UI panels
     */
    getState() {
        const mutexWaiters = this.mutex.getWaiters();
        const emptyWaiters = this.emptySem.getWaiters();
        const fullWaiters = this.fullSem.getWaiters();

        // Separate waiting producers vs consumers
        const waitingProducers = [
            ...new Set([
                ...emptyWaiters.filter(id => id.startsWith('P')),
                ...mutexWaiters.filter(id => id.startsWith('P'))
            ])
        ];

        const waitingConsumers = [
            ...new Set([
                ...fullWaiters.filter(id => id.startsWith('C')),
                ...mutexWaiters.filter(id => id.startsWith('C'))
            ])
        ];

        return {
            isMutexLocked: this.mutex.isLocked,
            mutexOwner: this.mutex.owner,
            mutexWaiters,
            emptySlotsAvailable: Math.max(0, this.emptySem.value),
            emptySemValue: this.emptySem.value,
            emptyWaiters,
            fullItemsAvailable: Math.max(0, this.fullSem.value),
            fullSemValue: this.fullSem.value,
            fullWaiters,
            criticalSectionOccupied: !!this.criticalSectionThread,
            criticalSectionThread: this.criticalSectionThread,
            waitingProducers,
            waitingConsumers,
            totalWaitingThreads: waitingProducers.length + waitingConsumers.length
        };
    }
}

// Export for browser module or global scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SynchronizationManager, AsyncMutex, CountingSemaphore };
} else {
    window.SynchronizationManager = SynchronizationManager;
    window.AsyncMutex = AsyncMutex;
    window.CountingSemaphore = CountingSemaphore;
}

