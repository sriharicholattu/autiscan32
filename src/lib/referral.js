// ── REFERRAL CODE SYSTEM ──
// These codes give first-time clinic registrations a free trial period.
// Add more codes here as needed before sharing them.

export const REFERRAL_CODES = {
  'AUTISCAN2025': { plan: 'professional', trialDays: 30, label: 'Professional — 30 Days Free' },
  'CLINIC2026':   { plan: 'starter',      trialDays: 30, label: 'Starter — 30 Days Free' },
  'EARLYBIRD':    { plan: 'professional', trialDays: 60, label: 'Professional — 60 Days Free' },
  'DEMO123':      { plan: 'starter',      trialDays: 14, label: 'Starter — 14 Days Free Trial' },
}

// How to generate a referral code — just add an entry above with a unique key.
// Share the code with clinics. They enter it during registration.
// The free trial activates Professional/Starter for trialDays with no payment.

export function validateReferralCode(code) {
  if (!code || !code.trim()) return null
  return REFERRAL_CODES[code.trim().toUpperCase()] || null
}

export function trialExpiryDate(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export function isTrialActive(expiryISO) {
  if (!expiryISO) return false
  return new Date(expiryISO) > new Date()
}

export function trialDaysLeft(expiryISO) {
  if (!expiryISO) return 0
  const diff = new Date(expiryISO) - new Date()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
