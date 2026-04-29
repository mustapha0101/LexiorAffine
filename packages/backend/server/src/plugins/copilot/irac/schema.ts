import { z } from 'zod';

export const IracResponseSchema = z.object({
  issue: z.string(),
  rule: z.string(),
  application: z.string(),
  conclusion: z.string(),
});
