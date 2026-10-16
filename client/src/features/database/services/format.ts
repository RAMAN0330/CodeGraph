import type { HealthStatus } from '../types';
import type { Tone } from '../components/ui/dbkit';

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'Not available';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Math.abs(bytes), i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${bytes < 0 ? '-' : ''}${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function signedBytes(bytes: number): string {
  return `${bytes >= 0 ? '+' : ''}${formatBytes(bytes)}`;
}

export function healthTone(status: HealthStatus | undefined): Tone {
  if (status === 'healthy') return 'good';
  if (status === 'warning') return 'warn';
  if (status === 'critical') return 'bad';
  return 'neutral';
}

export function severityTone(severity: string): Tone {
  if (severity === 'critical' || severity === 'high') return 'bad';
  if (severity === 'medium' || severity === 'warning') return 'warn';
  return 'neutral';
}
