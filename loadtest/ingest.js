import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * Task 6.7 — ME-03: k6 Load Test — Ingest API (file upload)
 *
 * Scenario: 10 concurrent users uploading files to /api/ingest.
 * Target: zero 5xx, successful processing.
 *
 * Run: k6 run loadtest/ingest.js
 */

const errorRate = new Rate('errors');
const ingestLatency = new Trend('ingest_latency');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '15s', target: 3 },   // ramp up
    { duration: '1m', target: 10 },    // sustained load
    { duration: '15s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],     // <5% errors (uploads are heavier)
    errors: ['rate<0.05'],
  },
};

// Simulate a text payload (k6 doesn't have native file creation,
// so we send a JSON body mimicking the ingest API's text input)
function generateTextPayload(sizeKB) {
  const paragraph = 'The old manuscript contained secrets that had been hidden for centuries. ' +
    'Each page revealed more about the mysterious family that once lived in the estate. ';
  const repeats = Math.ceil((sizeKB * 1024) / paragraph.length);
  return paragraph.repeat(repeats).slice(0, sizeKB * 1024);
}

const smallPayload = generateTextPayload(50);   // 50KB
const mediumPayload = generateTextPayload(500);  // 500KB

export default function () {
  const payload = Math.random() > 0.5 ? smallPayload : mediumPayload;

  const headers = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const body = JSON.stringify({
    text: payload,
    filename: `test-upload-${__VU}-${__ITER}.txt`,
    type: 'text/plain',
  });

  const res = http.post(`${BASE_URL}/api/ingest`, body, {
    headers,
    timeout: '30s',
  });

  ingestLatency.add(res.timings.duration);

  check(res, {
    'ingest status 200 or 429': (r) => r.status === 200 || r.status === 429,
    'no 5xx': (r) => r.status < 500,
  }) || errorRate.add(1);

  sleep(3 + Math.random() * 5); // 3-8s think time (heavier operation)
}
