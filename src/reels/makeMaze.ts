import { generateMaze, type Maze } from '../lib/maze';
import { fetchSilhouette, maskGrid } from '../lib/shape';
import { assignShapeGates } from './gates';
import { solutionRoute } from './route';

export interface BuiltMaze {
  maze: Maze;
  route: number[];
  subject: string;
  source: 'icon' | 'procedural';
  seed: number;
}

/**
 * One themed silhouette maze plus its checked solution.
 * Catalog icons are preferred. After two misses, a procedural shape is
 * used so a slow icon service cannot stall the studio.
 */
export async function makeReelMaze(
  theme: string,
  cols: number,
  rotation: number,
  seed: number,
): Promise<BuiltMaze> {
  let last = 'Could not build a maze.';
  for (let attempt = 0; attempt < 5; attempt++) {
    const s = ((seed + attempt * 977) >>> 0) || 1;
    const forceProcedural = attempt >= 2;
    try {
      const sil = await fetchSilhouette(theme, s, {
        themeFallback: theme,
        iconRotation: rotation + attempt,
        forceProcedural,
      });
      const maze = generateMaze(maskGrid(sil, cols, cols), cols, cols, s);
      assignShapeGates(maze, s);
      const route = solutionRoute(maze);
      return {
        maze,
        route,
        subject: sil.subject?.trim() || theme,
        source: sil.source,
        seed: s,
      };
    } catch (err) {
      last = err instanceof Error ? err.message : last;
    }
  }
  throw new Error(
    `Couldn't make a ${theme} maze (${last}). Try again or pick another theme.`,
  );
}
