/**
 * The share calculator for an Open Play game — port of the web's
 * eventSplit.ts. AIR/Rally does NOT collect these shares: one person
 * books and pays the venue, and this only tells the group what an even
 * split comes to. How they settle up is entirely between the players.
 */

export type SplitBreakdown = {
  totalAmount: number;
  playerCount: number;
  sharePerPlayer: number;
  organiserRemainder: number;
};

/** Rounded UP so collected shares can never total less than the bill —
 * any rounding difference lands on the organiser as a small credit. */
export function calculateSplit(totalAmount: number, playerCount: number): SplitBreakdown {
  const players = Math.max(1, Math.floor(playerCount));
  const total = Math.max(0, Math.round(totalAmount));

  const sharePerPlayer = Math.ceil(total / players);
  const collectedFromOthers = sharePerPlayer * (players - 1);
  const organiserRemainder = total - collectedFromOthers;

  return { totalAmount: total, playerCount: players, sharePerPlayer, organiserRemainder };
}

/** ₱1,234.50 — same convention as formatCentavos. */
export function formatShare(amountMinorUnits: number, currency = 'PHP'): string {
  const symbol = currency === 'PHP' ? '₱' : `${currency} `;
  return `${symbol}${(amountMinorUnits / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
