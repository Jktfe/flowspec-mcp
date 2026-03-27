import { z } from 'zod';
import { upsertLogicBoard } from '../db.js';

export const upsertLogicBoardSchema = z.object({
  projectId: z.string().describe('UUID of the FlowSpec project'),
  boardData: z
    .object({
      nodes: z.array(z.unknown()).describe('Logic board nodes (input, output, process, decision)'),
      edges: z.array(z.unknown()).describe('Edges connecting logic board nodes'),
    })
    .describe('Full logic board state to save'),
});

export async function handleUpsertLogicBoard(args: z.infer<typeof upsertLogicBoardSchema>) {
  try {
    const id = await upsertLogicBoard(args.projectId, args.boardData as { nodes: unknown[]; edges: unknown[] });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ id, success: true }) }],
    };
  } catch (e) {
    return {
      content: [{ type: 'text' as const, text: `Failed to upsert logic board: ${e instanceof Error ? e.message : String(e)}` }],
      isError: true,
    };
  }
}
