import { calculateBookingCharge, type BookingCharge } from '@/lib/bookings';

export type BookingCreditPreview = {
  /** Centavos the wallet will actually settle — never more than what's
   * owed, never more than the balance. */
  creditApplied: number;
  /** What's left after credit, before any card/QR fee. */
  remainingCourtAmount: number;
  /** The fee and total on the REMAINDER, not the full price — see
   * charge below for why that distinction is the whole point. */
  charge: BookingCharge;
  fullyCoveredByCredit: boolean;
};

/**
 * What a booking will actually cost once the player's AIR/Rally Credits
 * balance is taken into account — mirrors
 * lib/services/checkoutSession.ts#createCheckoutSessionForUser on the
 * web repo exactly, so the number shown here is provably the number
 * PayMongo will collect, not an estimate that happens to be close.
 *
 * The one non-obvious rule, quoted from that file's own comment because
 * getting it backwards silently overcharges: the processing fee is
 * grossed up from what's left AFTER credit, never from the full court
 * price. "Grossing up from price_amount would over-charge anyone paying
 * partly in credit (a ₱400 booking with ₱100 of credit is collected on
 * ₱300, so its fee is ₱300's, not ₱400's)."
 *
 * This exists because the panel used to show
 * calculateBookingCharge(courtAmount) unconditionally — the full price
 * plus a fee computed on the full price — regardless of any credit
 * balance. A player with ₱300 of credit looking at a ₱700 court saw
 * ₱700, was charged something else entirely, and the gap left their
 * wallet with no announcement anywhere on the screen they were looking
 * at when they committed to it.
 */
export function previewBookingWithCredits(courtAmountCentavos: number, availableCredit: number): BookingCreditPreview {
  const creditApplied = Math.max(0, Math.min(availableCredit, courtAmountCentavos));
  const remainingCourtAmount = courtAmountCentavos - creditApplied;
  const charge = calculateBookingCharge(remainingCourtAmount);
  return {
    creditApplied,
    remainingCourtAmount,
    charge,
    fullyCoveredByCredit: remainingCourtAmount === 0 && courtAmountCentavos > 0,
  };
}
