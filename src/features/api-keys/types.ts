/** Display shape for a key. The secret itself never appears after creation. */
export type ApiKeySummary = {
  id: string;
  name: string;
  /** e.g. "rsn_3f9a2b1c…9d2e" — enough to recognise, useless to use. */
  maskedKey: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
