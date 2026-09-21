/**
 * ProducerManager & ProducerThread
 * Simulates concurrent producer threads generating items, waiting on
 * semaphores and mutexes, and inserting items into the shared bounded buffer.
 */

class ProducerThread {
    constructor(id, options = {}) {
        this.id = id; // e.g., 'P1'
        this.name = `Producer ${id.replace('P', '')}`;
        this.color = options.color || '#38bdf8';
        this.itemsProducedCount = 0;
        this.maxItems = options.maxItems || 15;
        this.delay = options.delay || 1200;
        
        this.state = 'IDLE'; // 'IDLE', 'PRODUCING', 'WAITING_BUFFER_FULL', 'WAITING_MUTEX', 'IN_CRITICAL_SECTION', 'DONE'
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
        this.onItemProduced = options.onItemProduced || (() => {});
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
            itemsProducedCount: this.itemsProducedCount,
            maxItems: this.maxItems,
            progress: this.currentProgress,
            totalWaitTime: this.totalWaitTime
        };
    }

    async run() {
        while (!this.isStopped && (this.maxItems === 0 || this.itemsProducedCount < this.maxItems)) {
            // Check pause
            while (this.isPaused && !this.isStopped) {
                await this.sleep(100);
            }
            if (this.isStopped) break;

            // 1. Producing phase (simulate computation/generation)
            const itemId = Math.floor(100 + Math.random() * 900);
            this.currentItem = {
                id: itemId,
                producerId: this.id,
                producerColor: this.color,
                producedAt: Date.now()
            };
            this.state = 'PRODUCING';
            this.notifyState();

            // Simulate generation delay with slight realistic thread jitter (±15%)
            const jitteredDelay = Math.max(300, Math.round(this.delay * (0.85 + Math.random() * 0.3)));
            await this.sleepWithProgress(jitteredDelay);
            if (this.isStopped) break;

            // 2. Wait for Empty Slot (Semaphore: wait(empty))
            if (this.bufferManager.isFull()) {
                this.state = 'WAITING_BUFFER_FULL';
                this.waitStartTime = Date.now();
                this.notifyState();
                if (this.logger) {
                    this.logger.wait(this.id, 'Buffer Full (waiting for consumer to signal empty slot)');
                }
            }

            const emptyGranted = await this.syncManager.waitEmpty(this.id);
            if (!emptyGranted || this.isStopped) break;

            if (this.waitStartTime) {
                const waitDur = Date.now() - this.waitStartTime;
                this.totalWaitTime += waitDur;
                if (this.metrics) this.metrics.recordProducerWait(waitDur);
                if (this.logger && this.state === 'WAITING_BUFFER_FULL') {
                    this.logger.resume(this.id, 'empty slot signaled');
                }
                this.waitStartTime = null;
            }

            // 3. Acquire Mutex (Critical Section Lock)
            if (this.syncManager.mutex.isLocked) {
                this.state = 'WAITING_MUTEX';
                this.waitStartTime = Date.now();
                this.notifyState();
            }

            const lockGranted = await this.syncManager.lockMutex(this.id);
            if (!lockGranted || this.isStopped) {
                // If stopped while acquiring, balance semaphore
                this.syncManager.signalEmpty(this.id);
                break;
            }

            if (this.waitStartTime) {
                const waitDur = Date.now() - this.waitStartTime;
                this.totalWaitTime += waitDur;
                if (this.metrics) this.metrics.recordProducerWait(waitDur);
                this.waitStartTime = null;
            }

            // 4. Critical Section: Insert into buffer
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

            let slotIndex = 0;
            try {
                const result = this.bufferManager.put(this.currentItem);
                slotIndex = result.slotIndex;
                this.itemsProducedCount++;
                if (this.metrics) {
                    this.metrics.recordProduce();
                    this.metrics.updateBufferUtilization(
                        this.bufferManager.getUtilization(),
                        this.bufferManager.count
                    );
                }
                if (this.logger) {
                    this.logger.produce(this.id, this.currentItem.id, slotIndex);
                }
                this.onItemProduced({
                    producerId: this.id,
                    item: this.currentItem,
                    slotIndex
                });
            } catch (err) {
                console.error(err);
            }

            // 5. Release Mutex (Unlock Critical Section)
            this.syncManager.clearCriticalSection(this.id);
            this.syncManager.unlockMutex(this.id);
            if (this.logger) {
                this.logger.unlock(this.id);
            }

            // 6. Signal Full Semaphore (Notify consumer that an item is available)
            this.syncManager.signalFull(this.id);

            // Brief breather before next loop
            this.state = 'IDLE';
            this.currentProgress = 0;
            this.notifyState();
            await this.sleep(150);
        }

        if (!this.isStopped) {
            this.state = 'DONE';
            this.notifyState();
            if (this.logger) {
                this.logger.system(`${this.name} finished production quota (${this.itemsProducedCount} items).`);
            }
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

class ProducerManager {
    constructor(options = {}) {
        this.bufferManager = options.bufferManager;
        this.syncManager = options.syncManager;
        this.logger = options.logger;
        this.metrics = options.metrics;
        
        this.producers = [];
        this.numProducers = options.numProducers || 3;
        this.itemsPerProducer = options.itemsPerProducer || 15;
        this.delay = options.delay || 1200;
        
        this.colors = ['#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];
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

    init(count = 3, itemsPerProducer = 15, delay = 1200) {
        this.stop();
        this.numProducers = count;
        this.itemsPerProducer = itemsPerProducer;
        this.delay = delay;
        this.producers = [];

        for (let i = 1; i <= count; i++) {
            const thread = new ProducerThread(`P${i}`, {
                color: this.colors[(i - 1) % this.colors.length],
                maxItems: this.itemsPerProducer,
                delay: this.delay,
                bufferManager: this.bufferManager,
                syncManager: this.syncManager,
                logger: this.logger,
                metrics: this.metrics,
                onStateChange: () => this.notify('PRODUCER_STATE_CHANGE'),
                onItemProduced: (ev) => this.notify('ITEM_PRODUCED', ev)
            });
            this.producers.push(thread);
        }

        this.notify('INIT');
    }

    start() {
        this.producers.forEach(p => p.run());
        this.notify('START');
    }

    pause() {
        this.producers.forEach(p => p.pause());
        this.notify('PAUSE');
    }

    resume() {
        this.producers.forEach(p => p.resume());
        this.notify('RESUME');
    }

    stop() {
        this.producers.forEach(p => p.stop());
        this.notify('STOP');
    }

    setDelay(delay) {
        this.delay = delay;
        this.producers.forEach(p => p.delay = delay);
    }

    getState() {
        return this.producers.map(p => p.getState());
    }
}

// Export for browser module or global scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProducerManager, ProducerThread };
} else {
    window.ProducerManager = ProducerManager;
    window.ProducerThread = ProducerThread;
}
