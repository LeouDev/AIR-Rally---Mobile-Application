import { calculateBookingCharge, PROCESSING_FEE_PERCENT } from '@/lib/bookings';

describe('calculateBookingCharge', () => {
  it("reproduces PayMongo's own charge exactly: a ₱400 court becomes ₱406.09", () => {
    // Observed on a real pass_on_fees checkout — matches the web's own
    // anchor case (lib/services/__tests__/bookingFee.test.ts). If this
    // drifts, confirmations break.
    expect(calculateBookingCharge(40000)).toEqual({
      courtAmount: 40000,
      processingFeeAmount: 609,
      totalChargedAmount: 40609,
    });
  });

  it('leaves AIR/Rally whole after PayMongo takes its cut', () => {
    for (const court of [100, 8000, 40000, 999999]) {
      const { totalChargedAmount } = calculateBookingCharge(court);
      const paymongoTakes = totalChargedAmount * PROCESSING_FEE_PERCENT;
      const netToPlatform = totalChargedAmount - paymongoTakes;
      expect(netToPlatform).toBeGreaterThanOrEqual(court - 1);
    }
  });

  it('keeps courtAmount + processingFeeAmount === totalChargedAmount exactly', () => {
    for (const court of [1, 99, 100, 8000, 40000, 999999]) {
      const c = calculateBookingCharge(court);
      expect(c.courtAmount + c.processingFeeAmount).toBe(c.totalChargedAmount);
    }
  });

  it('charges nothing on a zero-price court rather than inventing a fee', () => {
    expect(calculateBookingCharge(0)).toEqual({ courtAmount: 0, processingFeeAmount: 0, totalChargedAmount: 0 });
  });

  it('matches the live court prices used for UAT', () => {
    expect(calculateBookingCharge(8000).totalChargedAmount).toBe(8122);
    expect(calculateBookingCharge(9000).totalChargedAmount).toBe(9137);
    expect(calculateBookingCharge(10000).totalChargedAmount).toBe(10152);
    expect(calculateBookingCharge(12000).totalChargedAmount).toBe(12183);
    expect(calculateBookingCharge(15000).totalChargedAmount).toBe(15228);
    expect(calculateBookingCharge(20000).totalChargedAmount).toBe(20305);
  });
});
