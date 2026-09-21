/**
 * PerformanceMonitor & LiveMetricsChart
 * Tracks throughput, execution time, wait times, buffer utilization,
 * and renders a high-performance live Canvas chart.
 */

class PerformanceMonitor {
    constructor() {
        this.totalProduced = 0;
        this.totalConsumed = 0;
        this.startTime = null;
        this.pausedDuration = 0;
        this.pauseStart = null;
        this.isRunning = false;
        this.isPaused = false;
        
        this.producerWaitRecords = []; // ms durations
        this.consumerWaitRecords = []; // ms durations
        
        this.currentBufferUtilization = 0;
        this.chartData = []; // [{ time, produced, consumed, bufferCount }]
        this.maxChartPoints = 40;
        
        this.listeners = [];
    }

    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.push(callback);
        }
    }

    notify() {
        const snapshot = this.getMetrics();
        this.listeners.forEach(cb => cb(snapshot));
    }

    start() {
        if (!this.isRunning) {
            this.startTime = Date.now();
            this.pausedDuration = 0;
            this.pauseStart = null;
            this.isRunning = true;
            this.isPaused = false;
            this.chartData = [{ time: 0, produced: 0, consumed: 0, bufferCount: 0 }];
        }
    }

    pause() {
        if (this.isRunning && !this.isPaused) {
            this.isPaused = true;
            this.pauseStart = Date.now();
        }
    }

    resume() {
        if (this.isRunning && this.isPaused) {
            this.isPaused = false;
            if (this.pauseStart) {
                this.pausedDuration += (Date.now() - this.pauseStart);
                this.pauseStart = null;
            }
        }
    }

    recordProduce() {
        this.totalProduced++;
        this.notify();
    }

    recordConsume() {
        this.totalConsumed++;
        this.notify();
    }

    recordProducerWait(durationMs) {
        if (durationMs > 0) {
            this.producerWaitRecords.push(durationMs);
            if (this.producerWaitRecords.length > 200) this.producerWaitRecords.shift();
        }
    }

    recordConsumerWait(durationMs) {
        if (durationMs > 0) {
            this.consumerWaitRecords.push(durationMs);
            if (this.consumerWaitRecords.length > 200) this.consumerWaitRecords.shift();
        }
    }

    updateBufferUtilization(percent, count = 0) {
        this.currentBufferUtilization = percent;
        this.recordChartPoint(count);
        this.notify();
    }

    recordChartPoint(bufferCount = 0) {
        if (!this.isRunning) return;
        const execSec = this.getExecutionSeconds();
        this.chartData.push({
            time: Math.round(execSec * 10) / 10,
            produced: this.totalProduced,
            consumed: this.totalConsumed,
            bufferCount
        });
        if (this.chartData.length > this.maxChartPoints) {
            this.chartData.shift();
        }
    }

    getExecutionSeconds() {
        if (!this.startTime) return 0;
        let totalElapsed = Date.now() - this.startTime - this.pausedDuration;
        if (this.isPaused && this.pauseStart) {
            totalElapsed -= (Date.now() - this.pauseStart);
        }
        return Math.max(0, totalElapsed / 1000);
    }

    formatExecutionTime() {
        const secs = this.getExecutionSeconds();
        const mins = Math.floor(secs / 60);
        const remSecs = (secs % 60).toFixed(1);
        return `${mins > 0 ? mins + 'm ' : ''}${remSecs}s`;
    }

    getThroughput() {
        const secs = this.getExecutionSeconds();
        if (secs < 0.5) return 0;
        return (this.totalConsumed / secs).toFixed(1);
    }

    getAvgProducerWait() {
        if (this.producerWaitRecords.length === 0) return 0;
        const sum = this.producerWaitRecords.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.producerWaitRecords.length);
    }

    getAvgConsumerWait() {
        if (this.consumerWaitRecords.length === 0) return 0;
        const sum = this.consumerWaitRecords.reduce((a, b) => a + b, 0);
        return Math.round(sum / this.consumerWaitRecords.length);
    }

    getMetrics() {
        return {
            totalProduced: this.totalProduced,
            totalConsumed: this.totalConsumed,
            throughput: this.getThroughput(),
            executionTime: this.formatExecutionTime(),
            executionSeconds: this.getExecutionSeconds(),
            avgProducerWaitTime: this.getAvgProducerWait(),
            avgConsumerWaitTime: this.getAvgConsumerWait(),
            bufferUtilization: this.currentBufferUtilization,
            chartData: [...this.chartData]
        };
    }

    reset() {
        this.totalProduced = 0;
        this.totalConsumed = 0;
        this.startTime = null;
        this.pausedDuration = 0;
        this.pauseStart = null;
        this.isRunning = false;
        this.isPaused = false;
        this.producerWaitRecords = [];
        this.consumerWaitRecords = [];
        this.currentBufferUtilization = 0;
        this.chartData = [];
        this.notify();
    }
}

class LiveMetricsChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.setupRetina();
        window.addEventListener('resize', () => this.setupRetina());
    }

    setupRetina() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const width = rect.width > 0 ? rect.width : (this.canvas.clientWidth > 0 ? this.canvas.clientWidth : 600);
        const height = rect.height > 0 ? rect.height : (this.canvas.clientHeight > 0 ? this.canvas.clientHeight : 180);
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        if (this.ctx) {
            this.ctx.scale(dpr, dpr);
        }
        this.width = width;
        this.height = height;
    }

    draw(data = []) {
        if (!this.ctx || !this.canvas) return;
        const ctx = this.ctx;
        const w = this.width || this.canvas.clientWidth || 400;
        const h = this.height || this.canvas.clientHeight || 180;

        ctx.clearRect(0, 0, w, h);

        if (data.length < 2) {
            // Draw placeholder grid
            this.drawGrid(ctx, w, h);
            ctx.fillStyle = '#64748b';
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Live metrics chart will plot when simulation runs...', w / 2, h / 2);
            return;
        }

        this.drawGrid(ctx, w, h);

        // Find max value for Y-axis scale
        const maxVal = Math.max(
            10,
            ...data.map(d => Math.max(d.produced, d.consumed, d.bufferCount || 0))
        ) * 1.15;

        const padding = { top: 20, right: 20, bottom: 25, left: 35 };
        const plotW = w - padding.left - padding.right;
        const plotH = h - padding.top - padding.bottom;

        const getX = (index) => padding.left + (index / (data.length - 1)) * plotW;
        const getY = (val) => padding.top + plotH - (val / maxVal) * plotH;

        // Draw Line Helper
        const drawSeries = (key, strokeColor, fillColor) => {
            ctx.beginPath();
            data.forEach((d, i) => {
                const x = getX(i);
                const y = getY(d[key]);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Gradient area under curve
            if (fillColor) {
                const lastX = getX(data.length - 1);
                const firstX = getX(0);
                const bottomY = padding.top + plotH;
                ctx.lineTo(lastX, bottomY);
                ctx.lineTo(firstX, bottomY);
                ctx.closePath();
                ctx.fillStyle = fillColor;
                ctx.fill();
            }
        };

        // Draw series
        // Buffer Count (Purple dashed/subtle)
        drawSeries('bufferCount', '#a855f7', 'rgba(168, 85, 247, 0.08)');
        // Produced Items (Cyan)
        drawSeries('produced', '#06b6d4', 'rgba(6, 182, 212, 0.12)');
        // Consumed Items (Emerald)
        drawSeries('consumed', '#10b981', 'rgba(16, 185, 129, 0.12)');

        // Draw endpoints dots
        const lastIdx = data.length - 1;
        const lastData = data[lastIdx];

        this.drawEndpointDot(ctx, getX(lastIdx), getY(lastData.produced), '#06b6d4');
        this.drawEndpointDot(ctx, getX(lastIdx), getY(lastData.consumed), '#10b981');
    }

    drawGrid(ctx, w, h) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 1;

        // Horizontal lines
        const lines = 4;
        for (let i = 0; i <= lines; i++) {
            const y = 20 + (i / lines) * (h - 45);
            ctx.beginPath();
            ctx.moveTo(35, y);
            ctx.lineTo(w - 20, y);
            ctx.stroke();
        }
    }

    drawEndpointDot(ctx, x, y, color) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// Export for browser module or global scope
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PerformanceMonitor, LiveMetricsChart };
} else {
    window.PerformanceMonitor = PerformanceMonitor;
    window.LiveMetricsChart = LiveMetricsChart;
}
