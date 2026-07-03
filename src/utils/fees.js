/**
 * Legion's fee schedule: one disclosed fee per contract, tiered by amount,
 * split evenly between both parties by default. No fees on unfunded/cancelled contracts.
 */
export function feeRate(amount) {
  if (amount < 1000) return 0.025;
  if (amount < 25000) return 0.015;
  return 0.0075;
}

export function calculateFee(amount) {
  const rate = feeRate(amount);
  const total = Math.round(amount * rate * 100) / 100;
  return { rate, total, perParty: Math.round((total / 2) * 100) / 100 };
}
