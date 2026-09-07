export function isSwipeBetaEnabled(
  environment: { SWIPE_BETA_ENABLED?: string } = process.env as unknown as {
    SWIPE_BETA_ENABLED?: string;
  }
) {
  return environment.SWIPE_BETA_ENABLED?.trim().toLowerCase() !== 'false';
}
