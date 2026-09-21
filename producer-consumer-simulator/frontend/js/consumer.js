/**
 * ConsumerManager & ConsumerThread
 * Simulates concurrent consumer threads waiting on semaphores,
 * acquiring mutexes, extracting items from the shared bounded buffer,
 * and processing them.
 */

class ConsumerThread {
    constructor(id, options = {}) {
        this.id = id; // e.g., 'C1'
        this.name = `Consumer ${id.replace('C', '')}`;
        this.color = options.color || '#10b981';
        this.itemsConsumedCount = 0;
        this.delay = options.delay || 1500;
        
        this.state = 'IDLE'; // 'IDLE', 'CONSUMING', 'WAITING_BUFFER_EMPTY', 'WAITING_MUTEX', 'IN_CRITICAL_SECTION'
        this.currentItem = null;
        this.currentProgress = 0;
        
        this.totalWaitTime = 0;
        this.waitStartTime = null;
        
        this.isPaused = false;
        this.isStopped = false;
        
        this.bufferManager = options.bufferManager;
        this.syncManager = options.syncManager;
        this.logger = options.logger;
        this.metrics = options.metrics;
        
        this.onStateChange = options.onStateChange || (() => {});
        this.onItemConsumed = options.onItemConsumed || (() => {});
    }

    notifyState() {
        this.onStateChange(this.getState());
    }

    getState() {
        return {
            id: this.id,
            name: this.name,
            color: this.color,
            state: this.state,
            currentItem: this.currentItem,
            itemsConsumedCount: this.itemsConsumedCount,
            progress: this.currentProgress,
            totalWaitTime: this.totalWaitTime
        };
    }

    async run() {
        while (!this.isStopped) {
            // Check pause
            while (this.isPaused && !this.isStopped) {
                await this.sleep(100);
            }
            if (this.isStopped) break;

            // 1. Wait for Full Slot (Semaphore: wait(full))
            if (this.bufferManager.isEmpty()) {
                this.state = 'WAITING_BUFFER_EMPTY';
                this.waitStartTime = Date.now();
                this.notifyState();
                if (this.logger) {
                    this.logger.wait(this.id, 'Buffer Empty (waiting for producer to signal full slot)');
                }
            }

            const fullGranted = await this.syncManager.waitFull(this.id);
            if (!fullGranted || this.isStopped) break;

            if (this.waitStartTime) {
                const waitDur = Date.now() - this.waitStartTime;
                this.totalWaitTime += waitDur;
                if (this.metrics) this.metrics.recordConsumerWait(waitDur);
                if (this.logger && this.state === 'WAITING_BUFFER_EMPTY') {
                    this.logger.resume(this.id, 'item signaled in buffer');
                }
                this.waitStartTime = null;
            }

            // 2. Acquire Mutex (Critical Section Lock)
            if (this.syncManager.mutex.isLocked) {
                this.state = 'WAITING_MUTEX';
                this.waitStartTime = Date.now();
                this.notifyState();
            }

            const lockGranted = await this.syncManager.lockMutex(this.id);
            if (!lockGranted || this.isStopped) {
                // Return item to semaphore if cancelled
                this.syncManager.signalFull(this.id);
                break;
            }

            if (this.waitStartTime) {
                const waitDur = Date.now() - this.waitStartTime;
                this.totalWaitTime += waitDur;
                if (this.metrics) this.metrics.recordConsumerWait(waitDur);
                this.waitStartTime = null;
            }

            // 3. Critical Section: Extract from buffer
            this.state = 'IN_CRITICAL_SECTION';
            this.syncManager.setCriticalSection(this.id);
            this.notifyState();
            if (this.logger) {
                this.logger.lock(this.id);
            }

            // Dwell in critical section for visual representation (180ms)
            await this.sleep(180);
            if (this.isStopped) {
                this.syncManager.clearCriticalSection(this.id);
                this.syncManager.unlockMutex(this.id);
                break;
            }

            let extractedItem = null;
            let slotIndex = 0;
            try {
                const result = this.bufferManager.get();
                extractedItem = result.item;
                slotIndex = result.slotIndex;
                this.currentItem = extractedItem;
                
                if (this.logger) {
                    this.logger.consume(this.id, extractedItem ? extractedItem.id : '?', slotIndex);
                }
                this.onItemConsumed({
                    consumerId: this.id,
                    item: extractedItem,
                    slotIndex
                });
            } catch (err) {
                console.error(err);
            }

            // 4. Release Mutex (Unlock Critical Section)
            this.syncManager.clearCriticalSection(this.id);
            this.syncManager.unlockMutex(this.id);
            if (this.logger) {
                this.logger.unlock(this.id);
            }

            // 5. Signal Empty Semaphore (Notify producers that a slot was freed)
            this.syncManager.signalEmpty(this.id);

            // 6. Consuming phase (simulate item processing/consumption)
            this.state = 'CONSUMING';
            this.notifyState();

            const jitteredDelay = Math.max(300, Math.round(this.delay * (0.85 + Math.random() * 0.3)));
            await this.sleepWithProgress(jitteredDelay);
            if (this.isStopped) break;

            this.itemsConsumedCount++;
            if (this.metrics) {
                this.metrics.recordConsume();
                this.metrics.updateBufferUtilization(
                    this.bufferManager.getUtilization(),
                    this.bufferManager.count
                );
            }

            this.state = 'IDLE';
            this.currentProgress = 0;
            this.notifyState();
            await this.sleep(150);
        }

        if (!this.isStopped) {
            this.state = 'IDLE';
            this.notifyState();
        }
    }

    async sleep(ms) {
        const start = Date.now();
        while (Date.now() - start < ms) {
            if (this.isStopped) return;
            while (this.isPaused && !this.isStopped) {
                await new Promise(r => setTimeout(r, 60));
            }
            await new Promise(r => setTimeout(r, 30));
        }
    }

    async sleepWithProgress(totalMs) {
        const step = 40;
        let elapsed = 0;
        while (elapsed < totalMs) {
            if (this.isStopped) return;
            while (this.isPaused && !this.isStopped) {
                await new Promise(r => setTimeout(r, 60));
            }
            await new Promise(r => setTimeout(r, step));
            elapsed += step;
            this.currentProgress = Math.min(100, Math.round((elapsed / totalMs) * 100));
            this.notifyState();
        }
        this.currentProgress = 100;
        this.notifyState();
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
    }

    stop() {
        this.isStopped = true;
        this.isPaused = false;
        this.state = 'IDLE';
        this.notifyState();
    }
}

class ConsumerManager {
    constructor(options = {}) {
        this.bufferManager = options.bufferManager;
        this.syncManager = options.syncManager;
        this.logger = options.logger;
        this.metrics = options.metrics;
        
        this.consumers = [];
        this.numConsumers = options.numConsumers || 3;
        this.delay = options.delay || 1500;
        
        this.colors = ['#10b981', '#059669', '#047857', '#065f46', '#34d399', '#6ee7b7', '#14b8a6', '#0d9488'];
        this.listeners = [];
    }

    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    notify(action, data) {
        const state = this.getState();
        this.listeners.forEach(cb => cb(state, action, data));
    }

    init(count = 3, delay = 1500) {
        this.stop();
        this.numConsumers = count;
        this.delay = delay;
        this.consumers = [];

        for (let i = 1; i <= count; i++) {
            const thread = new ConsumerThread(`C${i}`, {
                color: this.colors[(i - 1) % this.colors.length],
                delay: this.delay,
                bufferManager: this.bufferManager,
                syncManager: this.syncManager,
                logger: this.logger,
                metrics: this.metrics,
                onStateChange: () => this.notify('CONSUMER_STATE_CHANGE'),
                onItemConsumed: (ev) => this.notify('ITEM_CONSUMED', ev)
            });
            this.consumers.push(thread);
        }

        this.notify('INIT');
    }

    start() {
        this.consumers.forEach(c => c.run());
        this.notify('START');
    }

    pause() {
        this.consumers.forEach(c => c.pause());
        this.notify('PAUSE');
    }

    resume() {
        this.consumers.forEach(c => c.resume());
        this.notify('RESUME');
    }

    stop() {
        this.consumers.forEach(c => c.stop());
        this.notify('STOP');
    }

    setDelay(delay) {
        this.delay = delay;
        this.consumers.forEach(c => c.delay = delay);
    }

    getState() {
        return this.consumers.map(c => c.getState());
    }
}

// Export for browser module or global scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ConsumerManager, ConsumerThread };
} else {
    window.ConsumerManager = ConsumerManager;
    window.ConsumerThread = ConsumerThread;
}
