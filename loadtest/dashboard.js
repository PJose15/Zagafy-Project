import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

/**
 * Task 6.7 — ME-03: k6 Load Test — Dashboard browsing
 *
 * Scenario: 50 concurrent users browsing the dashboard.
 * Target: p95 latency < 2s, zero 5xx.
 *
 * Run: k6 run loadtest/dashboard.js
 * With env: k6 run -e BASE_URL=https://staging.zagafy.com loadtest/dashboard.js
 */

const errorRate = new Rate('errors');
const dashboardLatency = new Trend('dashboard_latency');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 10 },  // ramp up
    { duration: '1m', target: 50 },   // sustained load
    { duration: '30s', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // p95 < 2s
    http_req_failed: ['rate<0.01'],     // <1% errors
    errors: ['rate<0.01'],
  },
};

export default function () {
  // GET dashboard page
  const dashRes = http.get(`${BASE_URL}/`);
  dashboardLatency.add(dashRes.timings.duration);

  check(dashRes, {
    'dashboard status 200': (r) => r.status === 200,
    'dashboard latency < 2s': (r) => r.timings.duration < 2000,
    'no 5xx': (r) => r.status < 500,
  }) || errorRate.add(1);

  // GET health endpoint
  const healthRes = http.get(`${BASE_URL}/api/health`);
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
  });

  sleep(1 + Math.random() * 2); // 1-3s think time
}
