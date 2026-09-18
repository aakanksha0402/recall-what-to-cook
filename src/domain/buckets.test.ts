import { describe, expect, it } from 'vitest';
import { bucketFor, medianIntervalDays, type BucketInput } from './buckets';

const now = new Date('2026-09-02T18:00:00');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

function input(over: Partial<BucketInput>): BucketInput {
  return {
    status: 'known',
    origin: 'typed',
    pinned: false,
    isBase: false,
    baseId: null,
    cookDates: [],
    childCookDates: [],
    tweakAddedAt: null,
    forgottenDays: 60,
    now,
    ...over,
  };
}

describe('bucketFor', () => {
  it('retired beats everything', () => {
    expect(bucketFor(input({ status: 'retired', pinned: true })).bucket).toBe('Retired');
  });
  it('rut: three cooks in 30 days, even when pinned', () => {
    const r = bucketFor(input({ pinned: true, cookDates: [ago(2), ago(9), ago(20)] }));
    expect(r.bucket).toBe('Rut');
  });
  it('new: never cooked', () => {
    expect(bucketFor(input({})).bucket).toBe('New');
    expect(bucketFor(input({ origin: 'expansion' })).reason).toContain('proposals');
  });
  it('needs work: a tweak since the last cook', () => {
    expect(bucketFor(input({ cookDates: [ago(10)], tweakAddedAt: ago(3) })).bucket).toBe('NeedsWork');
  });
  it('favourite by time spread, not by count alone', () => {
    const spread = [200, 170, 140, 110, 80, 50].map(ago);
    expect(bucketFor(input({ cookDates: spread })).bucket).toBe('Favourite');
    const clustered = [35, 37, 39, 41, 43, 45].map(ago); // 6 cooks in ~10 days, all one month
    expect(bucketFor(input({ cookDates: clustered })).bucket).not.toBe('Favourite');
  });
  it('forgotten by own rhythm', () => {
    const r = bucketFor(input({ cookDates: [ago(71), ago(95), ago(119), ago(143)] }));
    expect(r.bucket).toBe('Forgotten');
    expect(r.reason).toBe('Forgotten — 71 days, you usually go 24');
  });
  it('forgotten by the 60-day wall', () => {
    expect(bucketFor(input({ cookDates: [ago(88)] })).bucket).toBe('Forgotten');
    expect(bucketFor(input({ cookDates: [ago(30)] })).bucket).toBe('Regular');
  });
  it('pinned is a favourite even when it looks forgotten', () => {
    expect(bucketFor(input({ pinned: true, cookDates: [ago(120)] })).bucket).toBe('Favourite');
  });
  it('a base inherits recency from its children', () => {
    const r = bucketFor(input({ isBase: true, cookDates: [ago(200)], childCookDates: [ago(5), ago(15)] }));
    expect(r.bucket).toBe('Regular');
    expect(r.gapDays).toBe(5);
  });
});

describe('medianIntervalDays', () => {
  it('needs two cooks', () => {
    expect(medianIntervalDays([ago(3)])).toBeNull();
    expect(medianIntervalDays([ago(3), ago(13), ago(43)])).toBe(20);
  });
});
