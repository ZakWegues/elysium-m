import type Feather from '@expo/vector-icons/Feather';

export type MetricKind = 'percent' | 'bytes' | 'raw';

export type MetricDef = {
  keys: string[];
  label: string;
  kind: MetricKind;
  icon: React.ComponentProps<typeof Feather>['name'];
};

// Variantes de nome já usadas no fallback genérico de TelemetryScreen desde a Fase 4 —
// não é um chute novo, é o que já roda em produção. Nomes de campo exatos do payload
// ainda não foram confirmados contra o código-fonte do desktop (repo separado).
export const METRICS: MetricDef[] = [
  { keys: ['cpu', 'cpuPercent', 'cpuUsage'], label: 'CPU', kind: 'percent', icon: 'cpu' },
  { keys: ['ram', 'ramPercent', 'memory', 'memoryPercent'], label: 'RAM', kind: 'percent', icon: 'server' },
  { keys: ['disk', 'diskPercent', 'diskUsage'], label: 'Disco', kind: 'percent', icon: 'hard-drive' },
  { keys: ['battery', 'batteryPercent', 'batteryLevel'], label: 'Bateria', kind: 'percent', icon: 'battery' },
];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function findMetric(key: string): MetricDef | undefined {
  return METRICS.find((m) => m.keys.includes(key));
}
