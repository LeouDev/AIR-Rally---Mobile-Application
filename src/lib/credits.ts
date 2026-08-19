import type { CreditTransaction, CreditTransactionType } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

/** No wallet row means no credit has ever moved — a zero balance, not an
 * error, same as the web app. */
export async function getCreditBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('user_credit_wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.balance ?? 0;
}

/** The caller's own credit history, newest first. RLS scopes this to the
 * caller — every row is written by a service-role RPC, never the client. */
export async function listCreditTransactions(userId: string, limit = 50): Promise<CreditTransaction[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type CreditHistoryEntry = CreditTransaction & {
  /** Wallet balance immediately AFTER this transaction, in integer minor units. */
  runningBalance: number;
};

/**
 * Attaches a running balance to each ledger row — port of the web's
 * withRunningBalance(). Anchored to the wallet's own balance and walked
 * BACKWARDS rather than summed forwards from zero: the wallet balance is
 * trigger-maintained and is the number checkout spends against, so an
 * independent forward sum over a possibly-truncated page would silently
 * disagree with it.
 *
 * `transactions` must be newest-first, as listCreditTransactions returns
 * them.
 */
export function withRunningBalance(transactions: CreditTransaction[], currentBalance: number): CreditHistoryEntry[] {
  let balanceAfter = currentBalance;
  return transactions.map((transaction) => {
    const entry = { ...transaction, runningBalance: balanceAfter };
    balanceAfter -= transaction.amount;
    return entry;
  });
}

const TYPE_LABELS: Record<CreditTransactionType, string> = {
  cancellation_compensation: 'Booking cancelled',
  admin_adjustment: 'Adjustment',
  promotion_bonus: 'Bonus',
  booking_payment: 'Paid for a booking',
};

/** The ledger's own description when it has one — falls back to a plain
 * label rather than showing a raw enum. */
export function creditEntryLabel(transaction: CreditTransaction): string {
  return transaction.description?.trim() || TYPE_LABELS[transaction.transaction_type];
}

/** Signed, always explicit about direction: "+₱400.00" / "−₱400.00". */
export function formatCreditAmount(amountMinorUnits: number): string {
  const sign = amountMinorUnits < 0 ? '−' : '+';
  return `${sign}₱${(Math.abs(amountMinorUnits) / 100).toFixed(2)}`;
}

export function formatCreditBalance(amountMinorUnits: number): string {
  return `₱${(amountMinorUnits / 100).toFixed(2)}`;
}
