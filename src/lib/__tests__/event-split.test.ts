import { calculateSplit, formatShare } from '@/lib/event-split';

describe('calculateSplit', () => {
  it('splits ₱500 four ways at ₱125 each', () => {
    expect(calculateSplit(50000, 4)).toMatchObject({ sharePerPlayer: 12500, playerCount: 4 });
  });

  it('splits ₱500 eight ways at ₱62.50 each', () => {
    expect(calculateSplit(50000, 8).sharePerPlayer).toBe(6250);
  });

  it('charges one player the whole amount', () => {
    expect(calculateSplit(50000, 1)).toMatchObject({ sharePerPlayer: 50000, organiserRemainder: 50000 });
  });

  it('rounds the share up so the group is never short', () => {
    const split = calculateSplit(10000, 3);
    expect(split.sharePerPlayer).toBe(3334);
    expect(split.sharePerPlayer * 3).toBeGreaterThanOrEqual(10000);
  });

  it('leaves the rounding difference with the organiser, never the group', () => {
    const split = calculateSplit(10000, 3);
    expect(split.organiserRemainder).toBe(10000 - 3334 * 2);
    expect(split.organiserRemainder).toBeLessThan(split.sharePerPlayer);
  });

  it('never divides by zero or a negative head count', () => {
    expect(calculateSplit(50000, 0).playerCount).toBe(1);
    expect(calculateSplit(50000, -3).playerCount).toBe(1);
  });

  it('handles a free court without producing NaN', () => {
    expect(calculateSplit(0, 4)).toMatchObject({ sharePerPlayer: 0, organiserRemainder: 0 });
  });
});

describe('formatShare', () => {
  it('formats pesos with two decimals', () => {
    expect(formatShare(6250)).toBe('₱62.50');
  });

  it('groups thousands', () => {
    expect(formatShare(123450)).toBe('₱1,234.50');
  });
});
