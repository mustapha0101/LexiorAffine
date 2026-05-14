import { z } from 'zod';

export const StudioResponseSchema = z.object({
  summary: z.string().describe('Le rapport généré par l\'IA'),
});
