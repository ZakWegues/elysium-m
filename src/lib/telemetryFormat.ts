import type Feather from '@expo/vector-icons/Feather';

export type MetricKind = 'percent' | 'bytes' | 'raw';

export type MetricDef = {
  keys: string[];
  label: string;
  kind: MetricKind;
  icon: React.ComponentProps<typeof Feather>['name'];
};

// Confirmado contra payload real do desktop (log [telemetry] no Metro):
// {"type":"telemetry","timestamp":...,"cpu_pct":50,"ram_pct":62,"battery_pct":null,"battery_charging":false}
// Sem campo de disco hoje. battery_pct vem null em desktops sem bateria - tratado à parte
// no card de métricas (não exibido como barra quando null). Mantidas variantes antigas
// como fallback caso o payload mude.
export const METRICS: MetricDef[] = [
  { keys: ['cpu_pct', 'cpu', 'cpuPercent', 'cpuUsage'], label: 'CPU', kind: 'percent', icon: 'cpu' },
  { keys: ['ram_pct', 'ram', 'ramPercent', 'memory', 'memoryPercent'], label: 'RAM', kind: 'percent', icon: 'server' },
  { keys: ['disk_pct', 'disk', 'diskPercent', 'diskUsage'], label: 'Disco', kind: 'percent', icon: 'hard-drive' },
  { keys: ['battery_pct', 'battery', 'batteryPercent', 'batteryLevel'], label: 'Bateria', kind: 'percent', icon: 'battery' },
];

// Campos de metadado/companion que nunca devem aparecer como linha própria na tela -
// timestamp é metadado do frame, battery_charging é consumido junto da métrica de bateria.
export const HIDDEN_KEYS = new Set(['timestamp', 'battery_charging']);

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
