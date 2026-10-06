/** Round a dollar amount to cents. Applied to outputs, never to intermediate values. */
export function roundMoney(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  // Normalise -0 so equality checks and display behave.
  return rounded === 0 ? 0 : rounded;
}
