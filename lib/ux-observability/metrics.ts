/**
 * UX Observability — metrics for CLS, TTI, FCP, LCP, INP, navigation.
 * Dev-only by default; can be enabled for analytics.
 */

const PREFIX = '[UX-metrics]';

function isDev(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
}

function getRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location?.pathname ?? '';
}

export type WebVitalsReport = (metric: { name: string; value: number; rating: string; delta: number; id: string; navigationType: string; route: string }) => void;

/**
 * Reports a single web vital with route (for dashboards / telemetry).
 * In dev, logs to console; optionally pass onReport to send to analytics.
 */
function reportMetric(
  metric: { name: string; value: number; rating?: string; delta?: number; id?: string; navigationType?: string },
  onReport?: WebVitalsReport
): void {
  const route = getRoute();
  if (isDev()) {
    const valueStr = metric.name === 'CLS' ? metric.value.toFixed(4) : `${Math.round(metric.value)}`;
    console.debug(`${PREFIX} ${metric.name}`, valueStr, 'route=' + route, metric.rating ?? '');
  }
  onReport?.({
    name: metric.name,
    value: metric.value,
    rating: metric.rating ?? 'good',
    delta: metric.delta ?? 0,
    id: metric.id ?? '',
    navigationType: metric.navigationType ?? 'navigate',
    route,
  });
}

/**
 * Subscribes to FCP, LCP, CLS, INP and reports with route-level telemetry.
 * Call once when the app mounts (e.g. in root layout client component).
 * Optional onReport callback can send metrics to your analytics.
 */
export function reportWebVitals(onReport?: WebVitalsReport): void {
  if (typeof window === 'undefined') return;

  import('web-vitals')
    .then(({ onCLS, onFCP, onLCP, onINP }) => {
      onCLS((m) => reportMetric(m, onReport));
      onFCP((m) => reportMetric(m, onReport));
      onLCP((m) => reportMetric(m, onReport));
      onINP((m) => reportMetric(m, onReport));
    })
    .catch(() => {});
}

let clsReported = false;

/**
 * Observes Cumulative Layout Shift (CLS) in the main shell.
 * Prefer reportWebVitals() for full FCP/LCP/CLS/INP + route telemetry.
 * Call once when the app mounts.
 */
export function observeCLS(_containerSelector = 'main'): () => void {
  if (typeof window === 'undefined') return () => {};

  let clsValue = 0;
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const e = entry as { hadRecentInput?: boolean; value?: number };
      if (!e.hadRecentInput && typeof e.value === 'number') {
        clsValue += e.value;
      }
    }
  });

  try {
    observer.observe({ type: 'layout-shift', buffered: true });
  } catch {
    return () => {};
  }

  const report = () => {
    if (clsValue > 0 && isDev() && !clsReported) {
      clsReported = true;
      console.debug(`${PREFIX} CLS`, clsValue.toFixed(4), 'route=' + getRoute());
    }
  };

  const timeout = setTimeout(report, 3000);
  return () => {
    clearTimeout(timeout);
    observer.disconnect();
  };
}

/**
 * Reports time-to-interactive for the main pane.
 * Call when the main content is ready.
 */
export function reportTTI(label: string, startMark?: string): void {
  if (typeof performance === 'undefined' || !performance.measure) return;
  if (!isDev()) return;

  try {
    const measureName = `ux-tti-${label}`;
    performance.measure(measureName, startMark ?? 'navigationStart', undefined);
    const measure = performance.getEntriesByName(measureName).pop();
    if (measure) {
      console.debug(`${PREFIX} TTI ${label}`, `${Math.round(measure.duration)}ms`);
    }
  } catch {
    // ignore
  }
}
