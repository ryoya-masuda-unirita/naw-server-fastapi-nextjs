import { describe, expect, it } from 'vitest';
import { buildTokenUsageDateRange, formatApiDateTimeUtc } from './api-datetime.util';

describe('api-datetime.util', () => {
  it('formatApiDateTimeUtc uses YYYY-MM-DDTHH:mm:ssZ without milliseconds', () => {
    const formatted = formatApiDateTimeUtc(new Date('2025-05-28T15:04:05.123Z'));
    expect(formatted).toBe('2025-05-28T15:04:05Z');
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('buildTokenUsageDateRange for today uses UTC day start and current time as to', () => {
    const now = new Date('2025-05-28T10:30:00.000Z');
    const { from, to } = buildTokenUsageDateRange('today', now);
    expect(from).toBe('2025-05-28T00:00:00Z');
    expect(to).toBe('2025-05-28T10:30:00Z');
  });

  it('buildTokenUsageDateRange for month uses first day of month UTC', () => {
    const now = new Date('2025-05-28T10:30:00.000Z');
    const { from, to } = buildTokenUsageDateRange('month', now);
    expect(from).toBe('2025-05-01T00:00:00Z');
    expect(to).toBe('2025-05-28T10:30:00Z');
  });
});
