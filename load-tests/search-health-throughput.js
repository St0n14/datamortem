import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.API_BASE_URL ?? 'http://localhost:8080';

export const options = {
  scenarios: {
    ramped_search: {
      executor: 'ramping-arrival-rate',
      startRate: Number(__ENV.START_RATE ?? 5),
      timeUnit: '1s',
      preAllocatedVUs: Number(__ENV.VUS ?? 20),
      maxVUs: Number(__ENV.MAX_VUS ?? 200),
      stages: [
        { target: Number(__ENV.MID_RATE ?? 20), duration: '1m' },
        { target: Number(__ENV.PEAK_RATE ?? 60), duration: '2m' },
        { target: 0, duration: '1m' },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    'http_req_duration{endpoint:search-health}': ['p(95)<600', 'p(99)<1200'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/search/health`, {
    tags: { endpoint: 'search-health' },
  });

  check(res, {
    'search health 200': (r) => r.status === 200,
    'cluster info present': (r) => !!r.json()?.cluster_name,
  });
}
