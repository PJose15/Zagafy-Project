import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * Task 6.7 — ME-03: k6 Load Test — Chat API
 *
 * Scenario: 20 concurrent users calling /api/chat.
 * Target: p95 latency < 5s, zero 5xx.
 *
 * Run: k6 run loadtest/chat.js
 * With auth: k6 run -e BASE_URL=https://staging.zagafy.com -e AUTH_TOKEN=<token> loadtest/chat.js
 */

const errorRate = new Rate('errors');
const chatLatency = new Trend('chat_latency');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

export const options = {
  stages: [
    { duration: '20s', target: 5 },   // ramp up
    { duration: '1m', target: 20 },    // sustained load
    { duration: '20s', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],  // p95 < 5s
    http_req_failed: ['rate<0.01'],     // <1% errors
    errors: ['rate<0.01'],
  },
};

const payloads = [
  {
    userInput: 'What should happen next in my story?',
    language: 'English',
    storyContext: 'Chapter 1: Elena discovers a letter in the attic.',
  },
  {
    userInput: 'Help me develop my antagonist.',
    language: 'English',
    storyContext: 'The villain is a former ally who turned against the protagonist.',
  },
  {
    userInput: 'I need a plot twist for chapter 5.',
    language: 'English',
    storyContext: 'The story has been building toward a confrontation in the castle.',
  },
];

export default function () {
  const payload = payloads[Math.floor(Math.random() * payloads.length)];

  const headers = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  const res = http.post(`${BASE_URL}/api/chat`, JSON.stringify(payload), {
    headers,
    timeout: '10s',
  });

  chatLatency.add(res.timings.duration);

  check(res, {
    'chat status 200 or 429': (r) => r.status === 200 || r.status === 429,
    'chat latency < 5s': (r) => r.timings.duration < 5000,
    'no 5xx': (r) => r.status < 500,
  }) || errorRate.add(1);

  sleep(2 + Math.random() * 3); // 2-5s think time
}
