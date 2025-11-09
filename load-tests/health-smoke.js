import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.API_BASE_URL ?? 'http://localhost:8080';
const SLEEP_TIME = Number(__ENV.SLEEP ?? 0.5);

const healthLatency = new Trend('health_latency');

export const options = {
  vus: Number(__ENV.VUS ?? 25),
  duration: __ENV.DURATION ?? '2m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<400'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/health`, {
    tags: { endpoint: 'health' },
  });

  healthLatency.add(res.timings.duration);

  check(res, {
    'health status is 200': (r) => r.status === 200,
    'response has ok flag': (r) => r.json()?.status === 'ok',
  });

  sleep(SLEEP_TIME);
}
