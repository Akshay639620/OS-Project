/**
 * EventLogger - Terminal-style Live Event Logger
 * Records, formats, categorizes, and filters simulation events in real-time.
 */

class EventLogger {
    constructor(maxLogs = 400) {
        this.maxLogs = maxLogs;
        this.logs = [];
        this.filter = 'ALL';
        this.listeners = [];
        this.isAutoScroll = true;
    }

    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    notify(event, data) {
        this.listeners.forEach(cb => cb(event, data));
    }

    /**
     * Format current time as [HH:MM:SS.mmm]
     */
    static formatTimestamp(date = new Date()) {
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        const ms = String(date.getMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss}.${ms}`;
    }

    /**
     * Log a new event
     * @param {string} type - 'PRODUCE' | 'CONSUME' | 'WAIT' | 'RESUME' | 'LOCK' | 'UNLOCK' | 'SYSTEM' | 'DEADLOCK'
     * @param {string} message - Descriptive text
     * @param {object} metadata - Extra details (threadId, itemId, slotIndex, etc.)
     */
    log(type, message, metadata = {}) {
        const now = new Date();
        const entry = {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            timestamp: now.getTime(),
            timeString: EventLogger.formatTimestamp(now),
            type: type.toUpperCase(),
            message,
            metadata
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.notify('NEW_LOG', entry);
        return entry;
    }

    // Convenient helper methods
    produce(producerId, itemId, slotIndex) {
        return this.log('PRODUCE', `${producerId} produced Item #${itemId} (Slot [${slotIndex}])`, {
            threadId: producerId,
            itemId,
            slotIndex
        });
    }

    consume(consumerId, itemId, slotIndex) {
        return this.log('CONSUME', `${consumerId} consumed Item #${itemId} (from Slot [${slotIndex}])`, {
            threadId: consumerId,
            itemId,
            slotIndex
        });
    }

    wait(threadId, reason) {
        return this.log('WAIT', `${threadId} waiting — ${reason}`, { threadId, reason });
    }

    resume(threadId, reason) {
        return this.log('RESUME', `${threadId} resumed (${reason})`, { threadId, reason });
    }

    lock(threadId, resource = 'Buffer Mutex') {
        return this.log('LOCK', `${threadId} acquired ${resource} (Critical Section Locked)`, {
            threadId,
            resource
        });
    }

    unlock(threadId, resource = 'Buffer Mutex') {
        return this.log('UNLOCK', `${threadId} released ${resource} (Critical Section Free)`, {
            threadId,
            resource
        });
    }

    system(message) {
        return this.log('SYSTEM', message);
    }

    deadlock(message) {
        return this.log('DEADLOCK', message);
    }

    setFilter(filterName) {
        this.filter = filterName;
        this.notify('FILTER_CHANGE', { filter: this.filter });
    }

    getFilteredLogs() {
        if (this.filter === 'ALL') return this.logs;
        if (this.filter === 'PRODUCERS') return this.logs.filter(l => l.type === 'PRODUCE' || (l.metadata.threadId && l.metadata.threadId.startsWith('P')));
        if (this.filter === 'CONSUMERS') return this.logs.filter(l => l.type === 'CONSUME' || (l.metadata.threadId && l.metadata.threadId.startsWith('C')));
        if (this.filter === 'SYNC') return this.logs.filter(l => ['LOCK', 'UNLOCK', 'WAIT', 'RESUME'].includes(l.type));
        if (this.filter === 'WARNINGS') return this.logs.filter(l => ['WAIT', 'DEADLOCK'].includes(l.type));
        return this.logs;
    }

    clear() {
        this.logs = [];
        this.notify('CLEAR', {});
    }

    exportText() {
        return this.logs.map(l => `[${l.timeString}] [${l.type}] ${l.message}`).join('\n');
    }
}

// Export for browser module or global scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventLogger;
} else {
    window.EventLogger = EventLogger;
}
