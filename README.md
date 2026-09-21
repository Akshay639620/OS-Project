# Producer-Consumer Synchronization Simulator

> **Operating Systems Project (PBL) — Process Synchronization & Deadlock Monitoring**  
> An academic, modern, interactive web dashboard simulating multi-threaded Producer-Consumer concurrency over a shared bounded buffer with POSIX mutex locks, counting semaphores, and Coffman deadlock analysis.

---

## 📌 Project Overview

In concurrent operating systems, the **Producer-Consumer Problem** (or Bounded-Buffer Problem) is a quintessential synchronization paradigm:
- **Producers** generate discrete data items and attempt to insert them into a finite, shared circular buffer.
- **Consumers** extract data items from the buffer and process them.
- **Critical Section & Race Conditions**: The buffer is shared memory. Simultaneous writes or read-after-write hazards can corrupt buffer pointers (`in` and `out`), causing lost data or undefined behavior.
- **Synchronization Primitives**:
  - `pthread_mutex_t`: Guarantees exclusive, atomic access inside the critical section.
  - `sem_t empty_slots`: Counting semaphore tracking available vacant slots, blocking producers when the buffer is full (`sem_wait`).
  - `sem_t full_items`: Counting semaphore tracking populated items, blocking consumers when the buffer is empty (`sem_wait`).
- **Deadlock Monitoring**: Evaluates Coffman's 4 conditions (*Mutual Exclusion*, *Hold and Wait*, *No Preemption*, *Circular Wait*) and monitors the Resource Allocation Graph (RAG) in real time.

---

## 🖥️ Live UI Features

1. **Modern Dark Glassmorphism Dashboard**:
   - Built with high-contrast electric blue, glowing cyan, and emerald accents.
   - Designed specifically for academic presentations and PBL evaluations.
2. **Interactive Controls & Presets**:
   - Fine-grained sliders for Number of Producers (1–8), Number of Consumers (1–8), Buffer Capacity (4–16), Items Quota, and Delays.
   - One-click demonstration presets:
     - **Buffer Full Demo**: Fast producers and slow consumer demonstrate buffer saturation and producer blocking.
     - **Buffer Empty Demo**: Slow producer and fast consumers demonstrate buffer starvation and consumer blocking.
     - **Equilibrium**: Balanced production and consumption rates.
     - **High Concurrency**: 6 Producers and 6 Consumers stress test.
3. **Animated Circular Bounded Buffer**:
   - Visual circular slots indexed $0 \dots (N-1)$.
   - Dynamic tracking of `in` (producer insertion pointer) and `out` (consumer extraction pointer).
   - Real-time **BUFFER FULL** and **BUFFER EMPTY** visual warning alerts.
   - Flying item particle animations that physically travel from producer cards into buffer slots, and from buffer slots to consumer cards.
4. **Synchronization Monitor**:
   - Mutex state (`LOCKED` with owner thread / `UNLOCKED`).
   - Critical section occupancy indicator (`OCCUPIED` / `FREE`).
   - Active semaphore counter readouts (`sem_empty` and `sem_full`).
   - Waiting threads queues for both producers and consumers.
5. **Deadlock Monitor**:
   - Real-time Resource Allocation Graph (RAG) dependency inspector.
   - Coffman 4-conditions evaluator.
   - Interactive **Simulate Deadlock Condition** toggle to illustrate what happens when lock acquisition order is inverted.
6. **Live Terminal Event Log**:
   - Timestamped concurrency event stream (`[PRODUCE]`, `[CONSUME]`, `[LOCK]`, `[UNLOCK]`, `[WAIT]`, `[RESUME]`).
   - Category filtering (Producers, Consumers, Synchronization, Warnings).
   - Auto-scroll lock and text log export.
7. **Performance Telemetry & Live Canvas Chart**:
   - Real-time calculation of Throughput (items/sec), Execution Time, Buffer Utilization, and Average Wait Times for both producers and consumers.
   - 60 FPS HTML5 Canvas graph rendering cumulative production, consumption, and buffer fill curves over time.
8. **OS Flowchart & C/C++ POSIX Reference Tab**:
   - Visual flowchart tracking active thread synchronization steps in real time.
   - Dual-tab view with C/C++ POSIX implementation code for defense questions.

---

## 📂 Project Architecture

The project strictly separates the OS simulation engine from the DOM/UI rendering layer, allowing the local JavaScript simulation to be swapped for a C++ multithreaded backend in the future without modifying UI logic.

```
producer-consumer-simulator/
└── frontend/
    ├── index.html            # Main simulator interface
    ├── css/
    │   └── style.css         # Modern dark dashboard styling & animations
    └── js/
        ├── app.js            # UI orchestrator, button bindings, animations
        ├── buffer.js         # BufferManager: Circular bounded buffer & pointer arithmetic
        ├── synchronization.js# SynchronizationManager: Mutex & Counting Semaphores
        ├── producer.js       # ProducerManager & ProducerThread state machines
        ├── consumer.js       # ConsumerManager & ConsumerThread state machines
        ├── deadlock.js       # DeadlockMonitor: Coffman condition & RAG analyzer
        ├── metrics.js        # PerformanceMonitor & LiveMetricsChart (Canvas)
        └── logger.js         # EventLogger: Real-time terminal log & filtering
```

---

## 🚀 How to Run

### Option 1: Direct Browser Open (No installation required)
Simply double-click or open `producer-consumer-simulator/frontend/index.html` in any modern web browser (Chrome, Edge, Firefox, Safari).

### Option 2: Local Web Server (Recommended)
Using Python:
```bash
cd "producer-consumer-simulator/frontend"
python3 -m http.server 8000
```
Then visit `http://localhost:8000` in your browser.

Using Node `npx serve`:
```bash
cd "producer-consumer-simulator/frontend"
npx serve .
```

---

## 🧪 Demonstration Guide for Evaluators

1. **Demonstrating Normal Execution**:
   - Click **START SIMULATION**.
   - Watch producers generate items (cyan badge), acquire mutex, deposit items into circular buffer slots, and signal consumers.
   - Observe the live canvas telemetry chart plotting produced and consumed curves.
2. **Demonstrating Buffer Full Condition**:
   - Click the preset **"Buffer Full Demo"**.
   - Click **START SIMULATION**.
   - Notice the buffer quickly fills up to 100%.
   - The buffer flashes the banner: `BUFFER FULL — PRODUCERS WAITING`.
   - The producer cards shift to the `Waiting (Buffer Full)` state, and are listed under `Waiting Producers` in the Synchronization Monitor.
   - As soon as the single consumer extracts an item, a slot is freed (`sem_post(&empty)`), instantly waking up the first waiting producer.
3. **Demonstrating Buffer Empty Condition**:
   - Click the preset **"Buffer Empty Demo"**.
   - Click **START SIMULATION**.
   - Notice consumers rapidly consume items until the buffer is empty.
   - The buffer flashes the banner: `BUFFER EMPTY — CONSUMERS WAITING`.
   - The consumer cards shift to `Waiting (Buffer Empty)` until the slow producer deposits a new item (`sem_post(&full)`).
4. **Demonstrating Deadlock Prevention & Detection**:
   - In standard execution, point out the Deadlock Monitor showing `✓ NO DEADLOCK DETECTED` because of strict resource acquisition order (`sem_wait` before `mutex_lock`).
   - Click **"Simulate Deadlock Condition"** to demonstrate an inverted lock scenario (where a thread holds the mutex while blocked on an empty slot, creating a circular wait cycle).
   - Point out the Deadlock Monitor switching to `⚠️ POTENTIAL DEADLOCK DETECTED` with circular wait flagged in the Resource Allocation Graph.

