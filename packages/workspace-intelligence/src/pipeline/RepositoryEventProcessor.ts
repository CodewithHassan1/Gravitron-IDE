import { RepositoryCommand } from '../events/RepositoryCommand';
import { GraphPatchCollection } from '../models/GraphPatchCollection';

export interface IRepositoryEventProcessor {
  /**
   * Consumes a repository command (intent), triggers parsing via IParser and diffing via GraphBuilder,
   * and emits a deterministic GraphPatchCollection.
   *
   * @param command The incoming command (e.g. IndexRequested)
   * @returns A collection of patches that represent the changes
   */
  process(command: RepositoryCommand): Promise<GraphPatchCollection>;
}
