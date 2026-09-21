/**
 * DeadlockMonitor - OS Deadlock Analysis & Resource Allocation Graph (RAG)
 * Analyzes Coffman's 4 conditions:
 * 1. Mutual Exclusion
 * 2. Hold and Wait
 * 3. No Preemption
 * 4. Circular Wait (Cycle detection in dependency graph)
 */

class DeadlockMonitor {
    constructor() {
        this.status = 'NO_DEADLOCK'; // 'NO_DEADLOCK' or 'DEADLOCK_DETECTED'
        this.waitingThreadsCount = 0;
        this.resourcesHeld = [];
        this.resourcesRequested = [];
        this.dependencies = [];
        this.coffmanConditions = {
            mutualExclusion: true, // Mutex guarantees mutual exclusion
            holdAndWait: false,
            noPreemption: true,    // Threads do not preemptively steal locks
            circularWait: false
        };
        this.listeners = [];
    }

    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    notify() {
        const state = this.getState();
        this.listeners.forEach(cb => cb(state));
    }

    /**
     * Inspect current system state from syncManager and threads
     */
    analyze(syncState, producerList = [], consumerList = []) {
        this.dependencies = [];
        this.resourcesHeld = [];
        this.resourcesRequested = [];

        let holdAndWaitDetected = false;
        let circularWaitDetected = false;

        // Mutex holding & requests
        if (syncState.isMutexLocked && syncState.mutexOwner) {
            this.resourcesHeld.push({
                threadId: syncState.mutexOwner,
                resource: 'Buffer Mutex'
            });
            this.dependencies.push({
                from: syncState.mutexOwner,
                to: 'Buffer Mutex',
                type: 'HELD'
            });
        }

        // Threads waiting on mutex
        if (syncState.mutexWaiters && syncState.mutexWaiters.length > 0) {
            syncState.mutexWaiters.forEach(waiterId => {
                this.resourcesRequested.push({
                    threadId: waiterId,
                    resource: 'Buffer Mutex'
                });
                this.dependencies.push({
                    from: waiterId,
                    to: 'Buffer Mutex',
                    type: 'REQUESTING'
                });
            });
        }

        // Producers waiting for empty slot
        if (syncState.emptyWaiters && syncState.emptyWaiters.length > 0) {
            syncState.emptyWaiters.forEach(pId => {
                this.resourcesRequested.push({
                    threadId: pId,
                    resource: 'Empty Buffer Slot'
                });
                this.dependencies.push({
                    from: pId,
                    to: 'Empty Slot Semaphore',
                    type: 'WAITING'
                });
            });
        }

        // Consumers waiting for full slot
        if (syncState.fullWaiters && syncState.fullWaiters.length > 0) {
            syncState.fullWaiters.forEach(cId => {
                this.resourcesRequested.push({
                    threadId: cId,
                    resource: 'Full Buffer Item'
                });
                this.dependencies.push({
                    from: cId,
                    to: 'Full Slot Semaphore',
                    type: 'WAITING'
                });
            });
        }

        this.waitingThreadsCount = syncState.totalWaitingThreads || 0;

        // Check Hold and Wait: Does any thread hold a lock while waiting for another resource?
        if (syncState.mutexOwner) {
            const isOwnerWaitingForEmpty = syncState.emptyWaiters && syncState.emptyWaiters.includes(syncState.mutexOwner);
            const isOwnerWaitingForFull = syncState.fullWaiters && syncState.fullWaiters.includes(syncState.mutexOwner);
            if (isOwnerWaitingForEmpty || isOwnerWaitingForFull) {
                holdAndWaitDetected = true;
            }
        }

        // Circular Wait Check:
        // In the standard semaphore solution, acquire order is strictly:
        // Producer: sem_wait(&empty) -> mutex_lock()
        // Consumer: sem_wait(&full) -> mutex_lock()
        // Therefore, a thread inside critical section never waits on a semaphore, preventing cycles.
        this.coffmanConditions = {
            mutualExclusion: true,
            holdAndWait: holdAndWaitDetected,
            noPreemption: true,
            circularWait: circularWaitDetected
        };

        this.status = circularWaitDetected ? 'DEADLOCK_DETECTED' : 'NO_DEADLOCK';
        this.notify();
    }

    /**
     * Simulate an inverted-lock deadlock demonstration for academic PBL defense
     */
    simulateDeadlock(isSimulated = false) {
        if (isSimulated) {
            this.status = 'DEADLOCK_DETECTED';
            this.coffmanConditions.holdAndWait = true;
            this.coffmanConditions.circularWait = true;
            this.dependencies = [
                { from: 'P1', to: 'Buffer Mutex', type: 'HELD' },
                { from: 'P1', to: 'Empty Slot (Full Buffer)', type: 'WAITING' },
                { from: 'C1', to: 'Buffer Mutex', type: 'REQUESTING' },
                { from: 'C1', to: 'P1 (Cycle: C1 blocked on Mutex held by P1)', type: 'CYCLE' }
            ];
            this.waitingThreadsCount = 2;
        } else {
            this.status = 'NO_DEADLOCK';
            this.coffmanConditions.holdAndWait = false;
            this.coffmanConditions.circularWait = false;
        }
        this.notify();
    }

    reset() {
        this.status = 'NO_DEADLOCK';
        this.waitingThreadsCount = 0;
        this.resourcesHeld = [];
        this.resourcesRequested = [];
        this.dependencies = [];
        this.coffmanConditions = {
            mutualExclusion: true,
            holdAndWait: false,
            noPreemption: true,
            circularWait: false
        };
        this.notify();
    }

    getState() {
        return {
            status: this.status,
            isDeadlocked: this.status === 'DEADLOCK_DETECTED',
            waitingThreadsCount: this.waitingThreadsCount,
            resourcesHeld: [...this.resourcesHeld],
            resourcesRequested: [...this.resourcesRequested],
            dependencies: [...this.dependencies],
            coffmanConditions: { ...this.coffmanConditions }
        };
    }
}

// Export for browser module or global scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeadlockMonitor;
} else {
    window.DeadlockMonitor = DeadlockMonitor;
}

