/**
 * App - Main UI Orchestrator & Controller
 * Coordinates managers, listens to simulation events, updates the DOM,
 * manages flying item animations, and handles user controls.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State & Managers Initialization ---
    let bufferCapacity = 8;
    let numProducers = 3;
    let numConsumers = 3;
    let itemsPerProducer = 15;
    let productionDelay = 1200;
    let consumptionDelay = 1500;
    
    let isSimRunning = false;
    let isSimPaused = false;
    let executionTimerInterval = null;

    // Instantiate modular managers
    const bufferManager = new BufferManager(bufferCapacity);
    const syncManager = new SynchronizationManager(bufferCapacity);
    const logger = new EventLogger(300);
    const metrics = new PerformanceMonitor();
    const deadlockMonitor = new DeadlockMonitor();
    
    const producerManager = new ProducerManager({
        bufferManager,
        syncManager,
        logger,
        metrics,
        numProducers,
        itemsPerProducer,
        delay: productionDelay
    });

    const consumerManager = new ConsumerManager({
        bufferManager,
        syncManager,
        logger,
        metrics,
        numConsumers,
        delay: consumptionDelay
    });

    let liveChart = null;

    // --- DOM Elements Cache ---
    const elements = {
        // Controls
        inputProducers: document.getElementById('inputProducers'),
        sliderProducers: document.getElementById('sliderProducers'),
        inputConsumers: document.getElementById('inputConsumers'),
        sliderConsumers: document.getElementById('sliderConsumers'),
        inputCapacity: document.getElementById('inputCapacity'),
        sliderCapacity: document.getElementById('sliderCapacity'),
        inputItemsPerProd: document.getElementById('inputItemsPerProd'),
        sliderProdDelay: document.getElementById('sliderProdDelay'),
        valProdDelay: document.getElementById('valProdDelay'),
        sliderConsDelay: document.getElementById('sliderConsDelay'),
        valConsDelay: document.getElementById('valConsDelay'),
        
        // Buttons
        btnStart: document.getElementById('btnStart'),
        btnPause: document.getElementById('btnPause'),
        btnResume: document.getElementById('btnResume'),
        btnReset: document.getElementById('btnReset'),
        
        // Preset buttons
        presetFull: document.getElementById('presetFull'),
        presetEmpty: document.getElementById('presetEmpty'),
        presetBalanced: document.getElementById('presetBalanced'),
        presetStress: document.getElementById('presetStress'),
        
        // Simulation Area
        producersContainer: document.getElementById('producersContainer'),
        consumersContainer: document.getElementById('consumersContainer'),
        bufferSlotsContainer: document.getElementById('bufferSlotsContainer'),
        bufferCapacityLabel: document.getElementById('bufferCapacityLabel'),
        bufferCountLabel: document.getElementById('bufferCountLabel'),
        bufferUtilPercent: document.getElementById('bufferUtilPercent'),
        bufferUtilProgressBar: document.getElementById('bufferUtilProgressBar'),
        bufferStatusBanner: document.getElementById('bufferStatusBanner'),
        bufferStatusText: document.getElementById('bufferStatusText'),
        inPointerBadge: document.getElementById('inPointerBadge'),
        outPointerBadge: document.getElementById('outPointerBadge'),
        
        // Synchronization Panel
        mutexStateBadge: document.getElementById('mutexStateBadge'),
        mutexOwnerBadge: document.getElementById('mutexOwnerBadge'),
        criticalSectionBadge: document.getElementById('criticalSectionBadge'),
        criticalSectionThread: document.getElementById('criticalSectionThread'),
        semEmptyCount: document.getElementById('semEmptyCount'),
        semFullCount: document.getElementById('semFullCount'),
        waitingProducersCount: document.getElementById('waitingProducersCount'),
        waitingProducersList: document.getElementById('waitingProducersList'),
        waitingConsumersCount: document.getElementById('waitingConsumersCount'),
        waitingConsumersList: document.getElementById('waitingConsumersList'),
        
        // Deadlock Panel
        deadlockBadge: document.getElementById('deadlockBadge'),
        deadlockStatusText: document.getElementById('deadlockStatusText'),
        deadlockWaitingThreads: document.getElementById('deadlockWaitingThreads'),
        deadlockHeldResources: document.getElementById('deadlockHeldResources'),
        deadlockRequestedResources: document.getElementById('deadlockRequestedResources'),
        deadlockCircularWait: document.getElementById('deadlockCircularWait'),
        deadlockDependenciesList: document.getElementById('deadlockDependenciesList'),
        btnSimulateDeadlock: document.getElementById('btnSimulateDeadlock'),
        
        // Event Log
        eventLogContainer: document.getElementById('eventLogContainer'),
        logFilterSelect: document.getElementById('logFilterSelect'),
        btnClearLogs: document.getElementById('btnClearLogs'),
        btnExportLogs: document.getElementById('btnExportLogs'),
        btnAutoScrollToggle: document.getElementById('btnAutoScrollToggle'),
        
        // Metrics
        metricTotalProduced: document.getElementById('metricTotalProduced'),
        metricTotalConsumed: document.getElementById('metricTotalConsumed'),
        metricThroughput: document.getElementById('metricThroughput'),
        metricExecTime: document.getElementById('metricExecTime'),
        metricAvgProdWait: document.getElementById('metricAvgProdWait'),
        metricAvgConsWait: document.getElementById('metricAvgConsWait'),
        metricBufferUtil: document.getElementById('metricBufferUtil'),
        chartCanvas: document.getElementById('liveMetricsCanvas'),
        
        // Status & Connection
        connectionBadge: document.getElementById('connectionBadge'),
        
        // Animation Overlay Layer
        animationOverlay: document.getElementById('animationOverlay')
    };

    // --- Chart Setup ---
    if (elements.chartCanvas) {
        liveChart = new LiveMetricsChart('liveMetricsCanvas');
    }

    // --- Initial Managers Initialization ---
    function initializeSimulation() {
        bufferManager.reset(bufferCapacity);
        syncManager.reset(bufferCapacity);
        deadlockMonitor.reset();
        metrics.reset();
        
        producerManager.init(numProducers, itemsPerProducer, productionDelay);
        consumerManager.init(numConsumers, consumptionDelay);

        renderBufferSlots();
        renderProducers();
        renderConsumers();
        updateSyncUI();
        updateDeadlockUI();
        updateMetricsUI();
        updateBufferStatusUI();

        logger.system(`Simulation configured: ${numProducers} Producers, ${numConsumers} Consumers, Buffer Size ${bufferCapacity}.`);
    }

    // --- Event Subscriptions ---

    // 1. Buffer events
    bufferManager.subscribe((state, action, details) => {
        renderBufferSlots();
        updateBufferStatusUI();
        deadlockMonitor.analyze(syncManager.getState(), producerManager.getState(), consumerManager.getState());
        
        if (action === 'PUT') {
            metrics.recordChartPoint(state.count);
        } else if (action === 'GET') {
            metrics.recordChartPoint(state.count);
        }
    });

    // 2. Synchronization events
    syncManager.subscribe((syncState, action, details) => {
        updateSyncUI();
        highlightFlowchartStep(action, details);
        deadlockMonitor.analyze(syncState, producerManager.getState(), consumerManager.getState());
    });

    // 3. Producer Manager events
    producerManager.subscribe((state, action, data) => {
        renderProducers();
        if (action === 'ITEM_PRODUCED') {
            animateItemProducerToBuffer(data.producerId, data.item, data.slotIndex);
        }
        deadlockMonitor.analyze(syncManager.getState(), producerManager.getState(), consumerManager.getState());
    });

    // 4. Consumer Manager events
    consumerManager.subscribe((state, action, data) => {
        renderConsumers();
        if (action === 'ITEM_CONSUMED') {
            animateItemBufferToConsumer(data.consumerId, data.item, data.slotIndex);
        }
        deadlockMonitor.analyze(syncManager.getState(), producerManager.getState(), consumerManager.getState());
    });

    // 5. Deadlock Monitor events
    deadlockMonitor.subscribe(() => {
        updateDeadlockUI();
    });

    // 6. Metrics updates
    metrics.subscribe((m) => {
        updateMetricsUI(m);
        if (liveChart) {
            liveChart.draw(m.chartData);
        }
    });

    // 7. Event Logger updates
    logger.subscribe((event, data) => {
        if (event === 'NEW_LOG') {
            appendLogEntry(data);
        } else if (event === 'CLEAR') {
            elements.eventLogContainer.innerHTML = '';
        } else if (event === 'FILTER_CHANGE') {
            refreshLogsDisplay();
        }
    });

    // --- UI Renderers ---

    // Render Producers List
    function renderProducers() {
        const producers = producerManager.getState();
        if (!elements.producersContainer) return;

        elements.producersContainer.innerHTML = '';
        producers.forEach(p => {
            const card = document.createElement('div');
            card.id = `producer-card-${p.id}`;
            card.className = `thread-node-card producer-node ${p.state.toLowerCase()}`;
            
            // Status label & class
            let statusBadgeClass = 'status-idle';
            let statusText = 'Idle';
            if (p.state === 'PRODUCING') {
                statusBadgeClass = 'status-active status-producing';
                statusText = 'Producing';
            } else if (p.state === 'WAITING_BUFFER_FULL') {
                statusBadgeClass = 'status-waiting';
                statusText = 'Waiting (Buffer Full)';
            } else if (p.state === 'WAITING_MUTEX') {
                statusBadgeClass = 'status-waiting';
                statusText = 'Waiting (Mutex)';
            } else if (p.state === 'IN_CRITICAL_SECTION') {
                statusBadgeClass = 'status-critical';
                statusText = 'In Critical Section';
            } else if (p.state === 'DONE') {
                statusBadgeClass = 'status-done';
                statusText = 'Done';
            }

            const currentItemHtml = p.currentItem 
                ? `<span class="item-tag" style="border-color: ${p.color}; color: ${p.color};">#${p.currentItem.id}</span>`
                : '<span class="item-tag empty-tag">—</span>';

            const quotaHtml = p.maxItems > 0 
                ? `${p.itemsProducedCount} / ${p.maxItems}`
                : `${p.itemsProducedCount}`;

            card.innerHTML = `
                <div class="thread-header">
                    <div class="thread-identity">
                        <span class="thread-dot" style="background: ${p.color}"></span>
                        <span class="thread-id">${p.id}</span>
                        <span class="thread-role">${p.name}</span>
                    </div>
                    <span class="thread-status-badge ${statusBadgeClass}">${statusText}</span>
                </div>
                <div class="thread-details">
                    <div class="detail-row">
                        <span class="detail-label">Current Item:</span>
                        <span class="detail-val">${currentItemHtml}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Items Produced:</span>
                        <span class="detail-val font-mono">${quotaHtml}</span>
                    </div>
                </div>
                <div class="thread-progress-track">
                    <div class="thread-progress-fill" style="width: ${p.progress}%; background: ${p.color};"></div>
                </div>
            `;
            elements.producersContainer.appendChild(card);
        });
    }

    // Render Consumers List
    function renderConsumers() {
        const consumers = consumerManager.getState();
        if (!elements.consumersContainer) return;

        elements.consumersContainer.innerHTML = '';
        consumers.forEach(c => {
            const card = document.createElement('div');
            card.id = `consumer-card-${c.id}`;
            card.className = `thread-node-card consumer-node ${c.state.toLowerCase()}`;
            
            // Status label & class
            let statusBadgeClass = 'status-idle';
            let statusText = 'Idle';
            if (c.state === 'CONSUMING') {
                statusBadgeClass = 'status-active status-consuming';
                statusText = 'Consuming';
            } else if (c.state === 'WAITING_BUFFER_EMPTY') {
                statusBadgeClass = 'status-waiting';
                statusText = 'Waiting (Buffer Empty)';
            } else if (c.state === 'WAITING_MUTEX') {
                statusBadgeClass = 'status-waiting';
                statusText = 'Waiting (Mutex)';
            } else if (c.state === 'IN_CRITICAL_SECTION') {
                statusBadgeClass = 'status-critical';
                statusText = 'In Critical Section';
            }

            const currentItemHtml = c.currentItem 
                ? `<span class="item-tag" style="border-color: ${c.color}; color: ${c.color};">#${c.currentItem.id}</span>`
                : '<span class="item-tag empty-tag">—</span>';

            card.innerHTML = `
                <div class="thread-header">
                    <div class="thread-identity">
                        <span class="thread-dot" style="background: ${c.color}"></span>
                        <span class="thread-id">${c.id}</span>
                        <span class="thread-role">${c.name}</span>
                    </div>
                    <span class="thread-status-badge ${statusBadgeClass}">${statusText}</span>
                </div>
                <div class="thread-details">
                    <div class="detail-row">
                        <span class="detail-label">Current Item:</span>
                        <span class="detail-val">${currentItemHtml}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Items Consumed:</span>
                        <span class="detail-val font-mono">${c.itemsConsumedCount}</span>
                    </div>
                </div>
                <div class="thread-progress-track">
                    <div class="thread-progress-fill" style="width: ${c.progress}%; background: ${c.color};"></div>
                </div>
            `;
            elements.consumersContainer.appendChild(card);
        });
    }

    // Render Shared Bounded Buffer Slots
    function renderBufferSlots() {
        const state = bufferManager.getState();
        if (!elements.bufferSlotsContainer) return;

        elements.bufferCapacityLabel.textContent = state.capacity;
        elements.bufferCountLabel.textContent = state.count;
        elements.bufferUtilPercent.textContent = `${state.utilization}%`;
        elements.bufferUtilProgressBar.style.width = `${state.utilization}%`;

        elements.inPointerBadge.textContent = `IN: [${state.inPointer}]`;
        elements.outPointerBadge.textContent = `OUT: [${state.outPointer}]`;

        elements.bufferSlotsContainer.innerHTML = '';
        for (let i = 0; i < state.capacity; i++) {
            const item = state.slots[i];
            const slot = document.createElement('div');
            slot.id = `buffer-slot-${i}`;
            slot.className = `buffer-slot ${item ? 'slot-occupied' : 'slot-empty'}`;
            
            // Pointer indicators
            let pointerPills = '';
            if (i === state.inPointer && i === state.outPointer) {
                pointerPills = '<div class="slot-pointer-tag dual-pointer">IN & OUT</div>';
            } else if (i === state.inPointer) {
                pointerPills = '<div class="slot-pointer-tag in-pointer">IN ➔</div>';
            } else if (i === state.outPointer) {
                pointerPills = '<div class="slot-pointer-tag out-pointer">➔ OUT</div>';
            }

            if (item) {
                slot.innerHTML = `
                    ${pointerPills}
                    <div class="slot-index-badge font-mono">${i}</div>
                    <div class="slot-item-content animate-pop-in" style="border-color: ${item.producerColor || '#06b6d4'};">
                        <span class="slot-item-id font-mono">#${item.id}</span>
                        <span class="slot-item-source font-mono" style="color: ${item.producerColor}">${item.producerId}</span>
                    </div>
                `;
            } else {
                slot.innerHTML = `
                    ${pointerPills}
                    <div class="slot-index-badge font-mono">${i}</div>
                    <div class="slot-empty-content">
                        <span class="slot-empty-icon">[ ]</span>
                        <span class="slot-empty-text">Empty</span>
                    </div>
                `;
            }
            elements.bufferSlotsContainer.appendChild(slot);
        }
    }

    // Update Buffer Banner (Buffer Full / Buffer Empty alerts)
    function updateBufferStatusUI() {
        const state = bufferManager.getState();
        const banner = elements.bufferStatusBanner;
        const text = elements.bufferStatusText;
        if (!banner || !text) return;

        banner.className = 'buffer-status-banner';

        if (state.isFull) {
            banner.classList.add('status-banner-full');
            text.innerHTML = `<strong>BUFFER FULL</strong> — PRODUCERS WAITING (${syncManager.getState().waitingProducers.length} threads blocked)`;
        } else if (state.isEmpty && isSimRunning) {
            banner.classList.add('status-banner-empty');
            text.innerHTML = `<strong>BUFFER EMPTY</strong> — CONSUMERS WAITING (${syncManager.getState().waitingConsumers.length} threads blocked)`;
        } else {
            banner.classList.add('status-banner-normal');
            text.innerHTML = `BUFFER NORMAL — ${state.count} of ${state.capacity} slots filled (${state.capacity - state.count} available)`;
        }
    }

    // Update Synchronization Panel
    function updateSyncUI() {
        const syncState = syncManager.getState();
        
        // Mutex status
        if (syncState.isMutexLocked) {
            elements.mutexStateBadge.className = 'status-pill-badge pill-danger pulse-dot';
            elements.mutexStateBadge.innerHTML = `<span class="dot"></span> LOCKED`;
            elements.mutexOwnerBadge.textContent = `Held by: ${syncState.mutexOwner || 'Thread'}`;
            elements.mutexOwnerBadge.style.display = 'inline-block';
        } else {
            elements.mutexStateBadge.className = 'status-pill-badge pill-success';
            elements.mutexStateBadge.innerHTML = `<span class="dot"></span> UNLOCKED`;
            elements.mutexOwnerBadge.style.display = 'none';
        }

        // Critical Section
        if (syncState.criticalSectionOccupied) {
            elements.criticalSectionBadge.className = 'status-pill-badge pill-warning pulse-dot';
            elements.criticalSectionBadge.innerHTML = `<span class="dot"></span> OCCUPIED`;
            elements.criticalSectionThread.textContent = `Thread: ${syncState.criticalSectionThread}`;
            elements.criticalSectionThread.style.display = 'inline-block';
        } else {
            elements.criticalSectionBadge.className = 'status-pill-badge pill-neutral';
            elements.criticalSectionBadge.innerHTML = `<span class="dot"></span> FREE`;
            elements.criticalSectionThread.style.display = 'none';
        }

        // Semaphores
        elements.semEmptyCount.textContent = syncState.emptySlotsAvailable;
        elements.semFullCount.textContent = syncState.fullItemsAvailable;

        // Waiting Lists
        elements.waitingProducersCount.textContent = syncState.waitingProducers.length;
        if (syncState.waitingProducers.length > 0) {
            elements.waitingProducersList.innerHTML = syncState.waitingProducers
                .map(id => `<span class="waiting-thread-tag prod-tag">${id}</span>`).join(' ');
        } else {
            elements.waitingProducersList.innerHTML = '<span class="text-muted">None</span>';
        }

        elements.waitingConsumersCount.textContent = syncState.waitingConsumers.length;
        if (syncState.waitingConsumers.length > 0) {
            elements.waitingConsumersList.innerHTML = syncState.waitingConsumers
                .map(id => `<span class="waiting-thread-tag cons-tag">${id}</span>`).join(' ');
        } else {
            elements.waitingConsumersList.innerHTML = '<span class="text-muted">None</span>';
        }
    }

    // Update Deadlock Panel
    function updateDeadlockUI() {
        const state = deadlockMonitor.getState();
        
        if (state.isDeadlocked) {
            elements.deadlockBadge.className = 'deadlock-alert-badge alert-danger pulse-warning';
            elements.deadlockBadge.innerHTML = `<span class="icon">⚠️</span> POTENTIAL DEADLOCK DETECTED`;
            elements.deadlockStatusText.textContent = 'Circular wait condition identified in Resource Allocation Graph!';
        } else {
            elements.deadlockBadge.className = 'deadlock-alert-badge alert-safe';
            elements.deadlockBadge.innerHTML = `<span class="icon">✓</span> NO DEADLOCK DETECTED`;
            elements.deadlockStatusText.textContent = 'Resource ordering protocol active. Safe synchronization state.';
        }

        elements.deadlockWaitingThreads.textContent = state.waitingThreadsCount;
        elements.deadlockHeldResources.textContent = state.resourcesHeld.length > 0
            ? state.resourcesHeld.map(r => `${r.threadId} holds ${r.resource}`).join(', ')
            : 'None';
        elements.deadlockRequestedResources.textContent = state.resourcesRequested.length > 0
            ? state.resourcesRequested.map(r => `${r.threadId} requests ${r.resource}`).join(', ')
            : 'None';
        elements.deadlockCircularWait.innerHTML = state.coffmanConditions.circularWait 
            ? '<span class="badge-tag tag-danger">CIRCULAR WAIT PRESENT</span>' 
            : '<span class="badge-tag tag-safe">NO CYCLE (SAFE)</span>';

        // Dependencies list
        if (state.dependencies.length > 0) {
            elements.deadlockDependenciesList.innerHTML = state.dependencies.map(d => {
                const badgeClass = d.type === 'HELD' ? 'dep-held' : (d.type === 'CYCLE' ? 'dep-cycle' : 'dep-wait');
                return `<div class="dep-item font-mono"><span class="dep-from">${d.from}</span> <span class="dep-arrow">→</span> <span class="dep-to ${badgeClass}">${d.to}</span> <span class="dep-type">(${d.type})</span></div>`;
            }).join('');
        } else {
            elements.deadlockDependenciesList.innerHTML = '<div class="text-muted font-mono text-center py-2">System in initial/idle state. No active dependencies.</div>';
        }
    }

    // Update Performance Metrics
    function updateMetricsUI(snapshot = null) {
        const m = snapshot || metrics.getMetrics();
        elements.metricTotalProduced.textContent = m.totalProduced;
        elements.metricTotalConsumed.textContent = m.totalConsumed;
        elements.metricThroughput.textContent = `${m.throughput} /s`;
        elements.metricExecTime.textContent = m.executionTime;
        elements.metricAvgProdWait.textContent = `${m.avgProducerWaitTime} ms`;
        elements.metricAvgConsWait.textContent = `${m.avgConsumerWaitTime} ms`;
        elements.metricBufferUtil.textContent = `${m.bufferUtilization}%`;
    }

    // --- Dynamic Flying Item Particle Animations ---
    function animateItemProducerToBuffer(producerId, item, slotIndex) {
        if (!elements.animationOverlay) return;
        const prodCard = document.getElementById(`producer-card-${producerId}`);
        const slotElem = document.getElementById(`buffer-slot-${slotIndex}`);
        if (!prodCard || !slotElem) return;

        const pRect = prodCard.getBoundingClientRect();
        const sRect = slotElem.getBoundingClientRect();

        const particle = document.createElement('div');
        particle.className = 'flying-item-particle';
        particle.style.background = item.producerColor || '#06b6d4';
        particle.textContent = `#${item.id}`;
        particle.style.left = `${pRect.right - 20}px`;
        particle.style.top = `${pRect.top + pRect.height / 2 - 14}px`;

        elements.animationOverlay.appendChild(particle);

        // Force reflow then translate
        requestAnimationFrame(() => {
            particle.style.transform = `translate(${sRect.left + sRect.width / 2 - (pRect.right - 20)}px, ${sRect.top + sRect.height / 2 - (pRect.top + pRect.height / 2 - 14)}px) scale(1.1)`;
            particle.style.opacity = '0.9';
        });

        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
            if (slotElem) {
                slotElem.classList.add('flash-slot-deposit');
                setTimeout(() => slotElem.classList.remove('flash-slot-deposit'), 400);
            }
        }, 420);
    }

    function animateItemBufferToConsumer(consumerId, item, slotIndex) {
        if (!elements.animationOverlay || !item) return;
        const slotElem = document.getElementById(`buffer-slot-${slotIndex}`);
        const consCard = document.getElementById(`consumer-card-${consumerId}`);
        if (!consCard || !slotElem) return;

        const sRect = slotElem.getBoundingClientRect();
        const cRect = consCard.getBoundingClientRect();

        const particle = document.createElement('div');
        particle.className = 'flying-item-particle';
        particle.style.background = item.producerColor || '#10b981';
        particle.textContent = `#${item.id}`;
        particle.style.left = `${sRect.left + sRect.width / 2 - 18}px`;
        particle.style.top = `${sRect.top + sRect.height / 2 - 14}px`;

        elements.animationOverlay.appendChild(particle);

        // Force reflow then translate
        requestAnimationFrame(() => {
            particle.style.transform = `translate(${cRect.left + 20 - (sRect.left + sRect.width / 2 - 18)}px, ${cRect.top + cRect.height / 2 - (sRect.top + sRect.height / 2 - 14)}px) scale(0.9)`;
            particle.style.opacity = '0.9';
        });

        setTimeout(() => {
            if (particle.parentNode) {
                particle.parentNode.removeChild(particle);
            }
            if (consCard) {
                consCard.classList.add('flash-consume-receive');
                setTimeout(() => consCard.classList.remove('flash-consume-receive'), 400);
            }
        }, 420);
    }

    // --- Live Event Log Helpers ---
    function appendLogEntry(entry) {
        const item = document.createElement('div');
        item.className = `log-entry log-${entry.type.toLowerCase()}`;
        
        // Filter check
        const currentFilter = elements.logFilterSelect.value;
        if (currentFilter !== 'ALL') {
            if (currentFilter === 'PRODUCERS' && !(entry.type === 'PRODUCE' || (entry.metadata.threadId && entry.metadata.threadId.startsWith('P')))) {
                item.style.display = 'none';
            } else if (currentFilter === 'CONSUMERS' && !(entry.type === 'CONSUME' || (entry.metadata.threadId && entry.metadata.threadId.startsWith('C')))) {
                item.style.display = 'none';
            } else if (currentFilter === 'SYNC' && !['LOCK', 'UNLOCK', 'WAIT', 'RESUME'].includes(entry.type)) {
                item.style.display = 'none';
            } else if (currentFilter === 'WARNINGS' && !['WAIT', 'DEADLOCK'].includes(entry.type)) {
                item.style.display = 'none';
            }
        }

        item.innerHTML = `
            <span class="log-time font-mono">[${entry.timeString}]</span>
            <span class="log-badge badge-${entry.type.toLowerCase()}">${entry.type}</span>
            <span class="log-message font-mono">${escapeHtml(entry.message)}</span>
        `;
        
        elements.eventLogContainer.appendChild(item);

        if (logger.isAutoScroll) {
            elements.eventLogContainer.scrollTop = elements.eventLogContainer.scrollHeight;
        }
    }

    function refreshLogsDisplay() {
        elements.eventLogContainer.innerHTML = '';
        const logs = logger.getFilteredLogs();
        logs.forEach(appendLogEntry);
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // --- Flowchart Step Highlighter ---
    function highlightFlowchartStep(action, details) {
        document.querySelectorAll('.flow-step').forEach(step => step.classList.remove('active-step'));
        let targetStepId = null;

        if (action === 'MUTEX_LOCKED') {
            targetStepId = 'flow-lock';
        } else if (action === 'CRITICAL_SECTION_CHANGE' && details.threadId) {
            targetStepId = details.threadId.startsWith('P') ? 'flow-insert' : 'flow-remove';
        } else if (action === 'FULL_SEM_SIGNAL') {
            targetStepId = 'flow-notify-cons';
        } else if (action === 'EMPTY_SEM_SIGNAL') {
            targetStepId = 'flow-notify-prod';
        } else if (action === 'MUTEX_UNLOCKED') {
            targetStepId = 'flow-unlock';
        } else if (action === 'EMPTY_SEM_WAIT' && bufferManager.isFull()) {
            targetStepId = 'flow-wait-full';
        } else if (action === 'FULL_SEM_WAIT' && bufferManager.isEmpty()) {
            targetStepId = 'flow-wait-empty';
        }

        if (targetStepId) {
            const el = document.getElementById(targetStepId);
            if (el) {
                el.classList.add('active-step');
                setTimeout(() => el.classList.remove('active-step'), 600);
            }
        }
    }

    // --- Controls & Simulation Handlers ---
    function startSimulation() {
        if (!isSimRunning) {
            isSimRunning = true;
            isSimPaused = false;
            
            // Lock configuration sliders during run
            toggleConfigInputs(false);
            
            elements.btnStart.disabled = true;
            elements.btnPause.disabled = false;
            elements.btnResume.disabled = true;
            elements.btnReset.disabled = false;
            
            elements.connectionBadge.className = 'conn-badge conn-active';
            elements.connectionBadge.innerHTML = '<span class="status-dot"></span> Simulation Running';

            metrics.start();
            producerManager.start();
            consumerManager.start();
            
            logger.system('--- SIMULATION STARTED ---');

            // Execution timer ticker (100ms)
            if (executionTimerInterval) clearInterval(executionTimerInterval);
            executionTimerInterval = setInterval(() => {
                if (isSimRunning && !isSimPaused) {
                    updateMetricsUI();
                }
            }, 100);
        }
    }

    function pauseSimulation() {
        if (isSimRunning && !isSimPaused) {
            isSimPaused = true;
            producerManager.pause();
            consumerManager.pause();
            metrics.pause();
            
            elements.btnPause.disabled = true;
            elements.btnResume.disabled = false;
            
            elements.connectionBadge.className = 'conn-badge conn-paused';
            elements.connectionBadge.innerHTML = '<span class="status-dot"></span> Simulation Paused';
            logger.system('--- SIMULATION PAUSED ---');
        }
    }

    function resumeSimulation() {
        if (isSimRunning && isSimPaused) {
            isSimPaused = false;
            producerManager.resume();
            consumerManager.resume();
            metrics.resume();
            
            elements.btnPause.disabled = false;
            elements.btnResume.disabled = true;
            
            elements.connectionBadge.className = 'conn-badge conn-active';
            elements.connectionBadge.innerHTML = '<span class="status-dot"></span> Simulation Running';
            logger.system('--- SIMULATION RESUMED ---');
        }
    }

    function resetSimulation() {
        isSimRunning = false;
        isSimPaused = false;
        
        if (executionTimerInterval) {
            clearInterval(executionTimerInterval);
            executionTimerInterval = null;
        }

        producerManager.stop();
        consumerManager.stop();
        
        toggleConfigInputs(true);
        elements.btnStart.disabled = false;
        elements.btnPause.disabled = true;
        elements.btnResume.disabled = true;
        
        elements.connectionBadge.className = 'conn-badge conn-ready';
        elements.connectionBadge.innerHTML = '<span class="status-dot"></span> Simulation Ready';

        initializeSimulation();
        logger.system('--- SIMULATION RESET ---');
    }

    function toggleConfigInputs(enable) {
        elements.inputProducers.disabled = !enable;
        elements.sliderProducers.disabled = !enable;
        elements.inputConsumers.disabled = !enable;
        elements.sliderConsumers.disabled = !enable;
        elements.inputCapacity.disabled = !enable;
        elements.sliderCapacity.disabled = !enable;
        elements.inputItemsPerProd.disabled = !enable;
    }

    // --- Slider & Input Sync Handlers ---
    function syncPair(input, slider, onChange) {
        input.addEventListener('change', () => {
            slider.value = input.value;
            onChange(parseInt(input.value, 10));
        });
        slider.addEventListener('input', () => {
            input.value = slider.value;
            onChange(parseInt(slider.value, 10));
        });
    }

    syncPair(elements.inputProducers, elements.sliderProducers, (val) => {
        numProducers = val;
        if (!isSimRunning) initializeSimulation();
    });

    syncPair(elements.inputConsumers, elements.sliderConsumers, (val) => {
        numConsumers = val;
        if (!isSimRunning) initializeSimulation();
    });

    syncPair(elements.inputCapacity, elements.sliderCapacity, (val) => {
        bufferCapacity = val;
        if (!isSimRunning) initializeSimulation();
    });

    elements.inputItemsPerProd.addEventListener('change', (e) => {
        itemsPerProducer = parseInt(e.target.value, 10) || 15;
        if (!isSimRunning) initializeSimulation();
    });

    elements.sliderProdDelay.addEventListener('input', (e) => {
        productionDelay = parseInt(e.target.value, 10);
        elements.valProdDelay.textContent = `${productionDelay} ms`;
        producerManager.setDelay(productionDelay);
    });

    elements.sliderConsDelay.addEventListener('input', (e) => {
        consumptionDelay = parseInt(e.target.value, 10);
        elements.valConsDelay.textContent = `${consumptionDelay} ms`;
        consumerManager.setDelay(consumptionDelay);
    });

    // --- Button Event Listeners ---
    elements.btnStart.addEventListener('click', startSimulation);
    elements.btnPause.addEventListener('click', pauseSimulation);
    elements.btnResume.addEventListener('click', resumeSimulation);
    elements.btnReset.addEventListener('click', resetSimulation);

    // Preset Scenarios
    function applyPreset(prods, cons, cap, pDelay, cDelay, name) {
        if (isSimRunning) resetSimulation();
        numProducers = prods;
        numConsumers = cons;
        bufferCapacity = cap;
        productionDelay = pDelay;
        consumptionDelay = cDelay;

        elements.inputProducers.value = prods;
        elements.sliderProducers.value = prods;
        elements.inputConsumers.value = cons;
        elements.sliderConsumers.value = cons;
        elements.inputCapacity.value = cap;
        elements.sliderCapacity.value = cap;
        elements.sliderProdDelay.value = pDelay;
        elements.valProdDelay.textContent = `${pDelay} ms`;
        elements.sliderConsDelay.value = cDelay;
        elements.valConsDelay.textContent = `${cDelay} ms`;

        initializeSimulation();
        logger.system(`Applied preset: "${name}"`);
    }

    elements.presetFull.addEventListener('click', () => {
        applyPreset(6, 1, 6, 600, 2400, 'Buffer Full Scenario (Fast Producers, Slow Consumer)');
    });

    elements.presetEmpty.addEventListener('click', () => {
        applyPreset(1, 6, 8, 2500, 600, 'Buffer Empty Scenario (Slow Producer, Fast Consumers)');
    });

    elements.presetBalanced.addEventListener('click', () => {
        applyPreset(3, 3, 8, 1200, 1200, 'Equilibrium Scenario (Balanced Rates)');
    });

    elements.presetStress.addEventListener('click', () => {
        applyPreset(6, 6, 12, 700, 700, 'High Concurrency Scenario (6P & 6C Threads)');
    });

    // Deadlock Simulation Toggle
    let isDeadlockSimulated = false;
    elements.btnSimulateDeadlock.addEventListener('click', () => {
        isDeadlockSimulated = !isDeadlockSimulated;
        deadlockMonitor.simulateDeadlock(isDeadlockSimulated);
        if (isDeadlockSimulated) {
            elements.btnSimulateDeadlock.textContent = 'Resolve Deadlock';
            elements.btnSimulateDeadlock.classList.add('btn-danger-active');
            logger.deadlock('POTENTIAL DEADLOCK DEMONSTRATION: Inverted lock acquisition order simulated.');
        } else {
            elements.btnSimulateDeadlock.textContent = 'Simulate Deadlock Condition';
            elements.btnSimulateDeadlock.classList.remove('btn-danger-active');
            logger.system('Deadlock resolved: Restored standard semaphore acquisition ordering.');
        }
    });

    // Log Controls
    elements.logFilterSelect.addEventListener('change', (e) => {
        logger.setFilter(e.target.value);
    });

    elements.btnClearLogs.addEventListener('click', () => {
        logger.clear();
    });

    elements.btnExportLogs.addEventListener('click', () => {
        const text = logger.exportText();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `producer_consumer_logs_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    elements.btnAutoScrollToggle.addEventListener('click', () => {
        logger.isAutoScroll = !logger.isAutoScroll;
        elements.btnAutoScrollToggle.classList.toggle('active', logger.isAutoScroll);
        elements.btnAutoScrollToggle.textContent = logger.isAutoScroll ? 'Auto-Scroll: ON' : 'Auto-Scroll: OFF';
    });

    // Code & Flowchart View Switcher
    const tabFlowchart = document.getElementById('tabFlowchart');
    const tabCode = document.getElementById('tabCode');
    const viewFlowchart = document.getElementById('viewFlowchart');
    const viewCode = document.getElementById('viewCode');

    if (tabFlowchart && tabCode && viewFlowchart && viewCode) {
        tabFlowchart.addEventListener('click', () => {
            tabFlowchart.classList.add('active');
            tabCode.classList.remove('active');
            viewFlowchart.style.display = 'block';
            viewCode.style.display = 'none';
        });

        tabCode.addEventListener('click', () => {
            tabCode.classList.add('active');
            tabFlowchart.classList.remove('active');
            viewFlowchart.style.display = 'none';
            viewCode.style.display = 'block';
        });
    }

    // Keyboard Shortcuts (Space for Start/Pause, Esc for Reset)
    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if (e.code === 'Space') {
            e.preventDefault();
            if (!isSimRunning) startSimulation();
            else if (isSimPaused) resumeSimulation();
            else pauseSimulation();
        } else if (e.code === 'Escape') {
            resetSimulation();
        }
    });

    // Boot up
    initializeSimulation();
});
