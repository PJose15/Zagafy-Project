/**
 * Pure-function keystroke metrics collector for auto-detecting flow state.
 * No React dependency — used via ref in flow-editor.
 */

export interface KeystrokeMetrics {
  avgWPM: number;
  peakWPM: number;
  totalPauses: number;
  avgPauseDuration: number;
  deletionAttempts: number;
  deletionRatio: number;
  totalKeystrokes: number;
}

export interface FlowMoment {
  startTime: number; // epoch ms
  endTime: number;   // epoch ms
  avgWPM: number;
  peakWPM: number;
}

const BUFFER_WINDOW_MS = 300_000; // 5 minutes
const PAUSE_THRESHOLD_MS = 2_000; // 2 seconds = a pause
const FLOW_WINDOW_MS = 60_000; // 60-second sliding window for flow detection
const FLOW_MIN_WPM = 30;
const FLOW_MAX_DELETION_RATIO = 0.05; // 5%
const FLOW_MAX_PAUSE_GAP_MS = 3_000; // 3 seconds

// Approximate: 5 chars = 1 word
const CHARS_PER_WORD = 5;

export interface MetricsCollector {
  recordKeystroke(timestamp: number): void;
  recordPause(duration: number): void;
  recordDeletionAttempt(): void;
  getSnapshot(): KeystrokeMetrics;
  getRecentMetrics(windowMs: number): KeystrokeMetrics;
  detectFlowMoments(): FlowMoment[];
  computeAutoFlowScore(): number;
}

/** Create a keystroke metrics collector for tracking WPM, pauses, deletions, and flow state. */
export function createMetricsCollector(): MetricsCollector {
  const keystrokeTimestamps: number[] = [];
  const pauseDurations: number[] = [];
  let deletionAttempts = 0;
  let totalKeystrokes = 0;

  function pruneOldEntries(now: number) {
    const cutoff = now - BUFFER_WINDOW_MS;
    while (keystrokeTimestamps.length > 0 && keystrokeTimestamps[0] < cutoff) {
      keystrokeTimestamps.shift();
    }
  }

  function recordKeystroke(timestamp: number) {
    // Auto-detect pauses from gaps between keystrokes
    if (keystrokeTimestamps.length > 0) {
      const lastTs = keystrokeTimestamps[keystrokeTimestamps.length - 1];
      const gap = timestamp - lastTs;
      if (gap >= PAUSE_THRESHOLD_MS) {
        pauseDurations.push(gap);
      }
    }
    keystrokeTimestamps.push(timestamp);
    totalKeystrokes++;
    pruneOldEntries(timestamp);
  }

  function recordPause(duration: number) {
    if (duration >= PAUSE_THRESHOLD_MS) {
      pauseDurations.push(duration);
    }
  }

  function recordDeletionAttempt() {
    deletionAttempts++;
  }

  function computeWPMInWindow(start: number, end: number): number {
    const strokes = keystrokeTimestamps.filter(t => t >= start && t <= end);
    if (strokes.length < 2) return 0;
    const durationMin = (end - start) / 60_000;
    if (durationMin <= 0) return 0;
    const words = strokes.length / CHARS_PER_WORD;
    return words / durationMin;
  }

  function getSnapshot(): KeystrokeMetrics {
    if (keystrokeTimestamps.length < 2) {
      return {
        avgWPM: 0,
        peakWPM: 0,
        totalPauses: pauseDurations.length,
        avgPauseDuration: pauseDurations.length > 0
          ? pauseDurations.reduce((a, b) => a + b, 0) / pauseDurations.length
          : 0,
        deletionAttempts,
        deletionRatio: totalKeystrokes > 0 ? deletionAttempts / totalKeystrokes : 0,
        totalKeystrokes,
      };
    }

    const first = keystrokeTimestamps[0];
    const last = keystrokeTimestamps[keystrokeTimestamps.length - 1];
    const totalMin = (last - first) / 60_000;

    const avgWPM = totalMin > 0
      ? (keystrokeTimestamps.length / CHARS_PER_WORD) / totalMin
      : 0;

    // Compute peak WPM using sliding 60s windows
    let peakWPM = 0;
    const step = 10_000; // 10s step
    for (let windowStart = first; windowStart <= last - FLOW_WINDOW_MS; windowStart += step) {
      const wpm = computeWPMInWindow(windowStart, windowStart + FLOW_WINDOW_MS);
      if (wpm > peakWPM) peakWPM = wpm;
    }
    // Also check a window ending at the last keystroke
    if (last - first >= FLOW_WINDOW_MS) {
      const wpm = computeWPMInWindow(last - FLOW_WINDOW_MS, last);
      if (wpm > peakWPM) peakWPM = wpm;
    }
    // If session shorter than a full window, use avgWPM as peak
    if (peakWPM === 0) peakWPM = avgWPM;

    return {
      avgWPM: Math.round(avgWPM * 10) / 10,
      peakWPM: Math.round(peakWPM * 10) / 10,
      totalPauses: pauseDurations.length,
      avgPauseDuration: pauseDurations.length > 0
        ? Math.round(pauseDurations.reduce((a, b) => a + b, 0) / pauseDurations.length)
        : 0,
      deletionAttempts,
      deletionRatio: totalKeystrokes > 0
        ? Math.round((deletionAttempts / totalKeystrokes) * 1000) / 1000
        : 0,
      totalKeystrokes,
    };
  }

  function detectFlowMoments(): FlowMoment[] {
    if (keystrokeTimestamps.length < 10) return [];

    const first = keystrokeTimestamps[0];
    const last = keystrokeTimestamps[keystrokeTimestamps.length - 1];
    if (last - first < FLOW_WINDOW_MS) return [];

    const moments: FlowMoment[] = [];
    const step = 10_000; // 10s step

    for (let windowStart = first; windowStart <= last - FLOW_WINDOW_MS; windowStart += step) {
      const windowEnd = windowStart + FLOW_WINDOW_MS;
      const windowStrokes = keystrokeTimestamps.filter(t => t >= windowStart && t <= windowEnd);

      if (windowStrokes.length < 5) continue;

      const wpm = computeWPMInWindow(windowStart, windowEnd);
      if (wpm < FLOW_MIN_WPM) continue;

      // Check deletion ratio in this window
      // We approximate using global ratio since we don't track per-window deletions
      const globalRatio = totalKeystrokes > 0 ? deletionAttempts / totalKeystrokes : 0;
      if (globalRatio > FLOW_MAX_DELETION_RATIO) continue;

      // Check for long pause gaps within window
      let hasLongGap = false;
      for (let i = 1; i < windowStrokes.length; i++) {
        if (windowStrokes[i] - windowStrokes[i - 1] > FLOW_MAX_PAUSE_GAP_MS) {
          hasLongGap = true;
          break;
        }
      }
      if (hasLongGap) continue;

      // Merge with previous moment if overlapping
      const prev = moments[moments.length - 1];
      if (prev && windowStart <= prev.endTime) {
        prev.endTime = windowEnd;
        prev.avgWPM = Math.round(((prev.avgWPM + wpm) / 2) * 10) / 10;
        if (wpm > prev.peakWPM) prev.peakWPM = Math.round(wpm * 10) / 10;
      } else {
        moments.push({
          startTime: windowStart,
          endTime: windowEnd,
          avgWPM: Math.round(wpm * 10) / 10,
          peakWPM: Math.round(wpm * 10) / 10,
        });
      }
    }

    return moments;
  }

  function computeAutoFlowScore(): number {
    const snapshot = getSnapshot();
    const flowMoments = detectFlowMoments();

    if (snapshot.totalKeystrokes < 10) return 0;

    // Score components (each 0-100, weighted):
    // 1. WPM factor (30%): higher WPM = better flow
    const wpmScore = Math.min(100, (snapshot.avgWPM / 60) * 100);

    // 2. Consistency factor (25%): low pause count = better
    const pauseRate = snapshot.totalKeystrokes > 0
      ? snapshot.totalPauses / (snapshot.totalKeystrokes / 100)
      : 0;
    const consistencyScore = Math.max(0, 100 - pauseRate * 20);

    // 3. Deletion restraint (15%): low deletion ratio = better
    const deletionScore = Math.max(0, 100 - snapshot.deletionRatio * 500);

    // 4. Flow moment coverage (30%): what % of session had flow moments
    const first = keystrokeTimestamps[0];
    const last = keystrokeTimestamps[keystrokeTimestamps.length - 1];
    const sessionDuration = last - first;
    let flowDuration = 0;
    for (const m of flowMoments) {
      flowDuration += m.endTime - m.startTime;
    }
    const coverageScore = sessionDuration > 0
      ? Math.min(100, (flowDuration / sessionDuration) * 150) // slight boost so 67% coverage = 100
      : 0;

    const raw = wpmScore * 0.30 + consistencyScore * 0.25 + deletionScore * 0.15 + coverageScore * 0.30;
    return Math.round(Math.max(0, Math.min(100, raw)));
  }

  function getRecentMetrics(windowMs: number): KeystrokeMetrics {
    const now = keystrokeTimestamps.length > 0 ? keystrokeTimestamps[keystrokeTimestamps.length - 1] : Date.now();
    const cutoff = now - windowMs;
    const recentStrokes = keystrokeTimestamps.filter(t => t >= cutoff);

    if (recentStrokes.length < 2) {
      return {
        avgWPM: 0, peakWPM: 0, totalPauses: 0, avgPauseDuration: 0,
        deletionAttempts: 0, deletionRatio: 0, totalKeystrokes: recentStrokes.length,
      };
    }

    const first = recentStrokes[0];
    const last = recentStrokes[recentStrokes.length - 1];
    const totalMin = (last - first) / 60_000;
    const avgWPM = totalMin > 0 ? (recentStrokes.length / CHARS_PER_WORD) / totalMin : 0;

    // Count pauses in window
    let recentPauses = 0;
    let pauseSum = 0;
    for (let i = 1; i < recentStrokes.length; i++) {
      const gap = recentStrokes[i] - recentStrokes[i - 1];
      if (gap >= PAUSE_THRESHOLD_MS) {
        recentPauses++;
        pauseSum += gap;
      }
    }

    return {
      avgWPM: Math.round(avgWPM * 10) / 10,
      peakWPM: Math.round(avgWPM * 10) / 10, // Simplified for recent window
      totalPauses: recentPauses,
      avgPauseDuration: recentPauses > 0 ? Math.round(pauseSum / recentPauses) : 0,
      deletionAttempts,
      deletionRatio: totalKeystrokes > 0 ? Math.round((deletionAttempts / totalKeystrokes) * 1000) / 1000 : 0,
      totalKeystrokes: recentStrokes.length,
    };
  }

  return {
    recordKeystroke,
    recordPause,
    recordDeletionAttempt,
    getSnapshot,
    getRecentMetrics,
    detectFlowMoments,
    computeAutoFlowScore,
  };
}
