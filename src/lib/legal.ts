/**
 * Mirrors the web's src/lib/legal.ts — single source of truth for which
 * User Agreement version is currently required at signup. Bump this
 * alongside the web's own constant whenever the actual terms change.
 */
export const CURRENT_AGREEMENT_VERSION = '2026-08-17';

/** Shown on the in-app legal document screen, same wording as web's
 * /terms and /privacy pages. */
export const LEGAL_REVIEW_STATUS = 'Pending review by qualified counsel';
