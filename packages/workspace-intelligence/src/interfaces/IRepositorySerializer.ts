import { RepositorySnapshot } from '../models/RepositorySnapshot';

export interface IRepositorySerializer {
  /**
   * Serializes a snapshot into a Uint8Array format
   */
  serialize(snapshot: RepositorySnapshot): Uint8Array;

  /**
   * Deserializes a Uint8Array format into a RepositorySnapshot
   */
  deserialize(data: Uint8Array): RepositorySnapshot;
}
