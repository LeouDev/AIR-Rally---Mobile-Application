import type { CreditTransaction } from '@/lib/database.types';
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

const TRANSACTION_LABELS: Record<CreditTransaction['transaction_type'], string> = {
  cancellation_compensation: 'Cancellation credit',
  admin_adjustment: 'Adjustment',
  promotion_bonus: 'Bonus',
  booking_payment: 'Applied to booking',
};

export function creditTransactionLabel(transaction: CreditTransaction): string {
  return transaction.description || TRANSACTION_LABELS[transaction.transaction_type];
}
