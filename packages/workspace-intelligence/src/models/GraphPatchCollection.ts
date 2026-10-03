import { GraphPatch } from './GraphPatch';

export interface GraphPatchStatistics {
  nodesAdded: number;
  nodesRemoved: number;
  nodesUpdated: number;
  edgesAdded: number;
  edgesRemoved: number;
}

export interface GraphPatchCollection {
  patches: GraphPatch[];
  statistics: GraphPatchStatistics;
  generationTime: number; // Duration in ms it took to generate the patches
  affectedGraphs: string[];
  snapshotVersion: string; // The snapshot version these patches were generated against
  eventSequence: number; // Sequence number of the command/event that triggered this
}
