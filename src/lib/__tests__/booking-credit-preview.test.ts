import { previewBookingWithCredits } from '@/lib/booking-credit-preview';
import { calculateBookingCharge, PROCESSING_FEE_PERCENT } from '@/lib/bookings';

describe('previewBookingWithCredits', () => {
  it('applies no credit and matches the plain charge when the wallet is empty', () => {
    const preview = previewBookingWithCredits(70000, 0);
    expect(preview.creditApplied).toBe(0);
    expect(preview.remainingCourtAmount).toBe(70000);
    expect(preview.charge).toEqual(calculateBookingCharge(70000));
    expect(preview.fullyCoveredByCredit).toBe(false);
  });

  it('grosses the fee up from the post-credit remainder, not the full price — the exact case the server comment names', () => {
    // "a ₱400 booking with ₱100 of credit is collected on ₱300, so its
    // fee is ₱300's, not ₱400's" — lib/services/checkoutSession.ts.
    const preview = previewBookingWithCredits(40000, 10000);
    expect(preview.creditApplied).toBe(10000);
    expect(preview.remainingCourtAmount).toBe(30000);
    expect(preview.charge).toEqual(calculateBookingCharge(30000));
    // Pinned independently of calculateBookingCharge's own implementation,
    // so a bug in that shared function can't hide behind agreeing with
    // itself here.
    expect(preview.charge.processingFeeAmount).toBe(Math.round(30000 / (1 - PROCESSING_FEE_PERCENT)) - 30000);
  });

  it('never applies more credit than the balance holds', () => {
    const preview = previewBookingWithCredits(40000, 10000000);
    expect(preview.creditApplied).toBe(40000);
    expect(preview.remainingCourtAmount).toBe(0);
  });

  it('never applies more credit than the booking is worth', () => {
    // A ₱2000 wallet against a ₱400 court must not go negative or apply
    // more than the booking actually costs.
    const preview = previewBookingWithCredits(40000, 200000);
    expect(preview.creditApplied).toBe(40000);
    expect(preview.remainingCourtAmount).toBe(0);
  });

  it('reports fully covered — and therefore no card fee at all — only when the remainder hits zero', () => {
    const covered = previewBookingWithCredits(40000, 40000);
    expect(covered.fullyCoveredByCredit).toBe(true);
    expect(covered.charge.processingFeeAmount).toBe(0);
    expect(covered.charge.totalChargedAmount).toBe(0);

    const notCovered = previewBookingWithCredits(40000, 39999);
    expect(notCovered.fullyCoveredByCredit).toBe(false);
  });

  it('never reports fully covered for a free/zero-price booking with no credit involved', () => {
    // courtAmount 0, credit 0 → remainder 0 too, but nothing was actually
    // "covered by credit" here; there was nothing to cover.
    const preview = previewBookingWithCredits(0, 0);
    expect(preview.fullyCoveredByCredit).toBe(false);
  });

  it('clamps a negative balance to zero credit applied rather than adding to the price', () => {
    // Defensive: a balance should never be negative, but a preview must
    // not silently increase what someone owes if it somehow were.
    const preview = previewBookingWithCredits(40000, -500);
    expect(preview.creditApplied).toBe(0);
    expect(preview.remainingCourtAmount).toBe(40000);
  });
});
