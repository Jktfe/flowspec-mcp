import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export type FlowSpecMode = 'cloud' | 'local';

export const MODE: FlowSpecMode = (process.env.FLOWSPEC_MODE as FlowSpecMode) ?? 'cloud';

export const LOCAL_API_BASE = process.env.FLOWSPEC_LOCAL_URL ?? 'http://localhost:3456';

/** Read the local API auth token from the desktop server's token file. */
export function getLocalAuthToken(): string | null {
  try {
    const tokenPath = join(homedir(), 'Library', 'Application Support', 'com.flowspec.app', 'auth-token');
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return null;
  }
}
