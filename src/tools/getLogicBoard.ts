import { z } from 'zod';
import { getLogicBoard } from '../db.js';

export const getLogicBoardSchema = z.object({
  projectId: z.string().describe('UUID of the FlowSpec project'),
});

export async function handleGetLogicBoard(args: z.infer<typeof getLogicBoardSchema>) {
  const board = await getLogicBoard(args.projectId);
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(board, null, 2) }],
  };
}
