import { z } from 'zod';

/** Same format the `week_id` `CHECK` constraint enforces (`migrations/*_init-schema.sql`). */
export const historyParamsSchema = z.object({
  weekId: z.string().regex(/^\d{4}-W\d{2}$/),
});

export type HistoryParams = z.infer<typeof historyParamsSchema>;
