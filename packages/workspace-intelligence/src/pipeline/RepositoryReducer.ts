import { IRepositoryModel } from '../interfaces/IRepositoryModel';
import { RepositoryTransaction } from '../models/RepositoryTransaction';

export interface RepositoryReducer {
  /**
   * Applies a transaction (event + graph patches + metadata) to the read-only repository model,
   * returning a new immutable snapshot or model.
   *
   * Only the reducer is allowed to mutate the underlying graph representations to produce
   * the new immutable view.
   */
  reduce(model: IRepositoryModel, transaction: RepositoryTransaction): IRepositoryModel;
}
