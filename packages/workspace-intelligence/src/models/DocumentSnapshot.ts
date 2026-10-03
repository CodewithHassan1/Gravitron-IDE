import { DocumentId } from './EntityIds';

export interface DocumentMetadata {
  [key: string]: any;
}

export interface DocumentSnapshot {
  readonly id: DocumentId;
  readonly uri: string;
  readonly version: number;
  readonly language: string;
  readonly hash: string;
  readonly size: number;
  readonly textMetadata?: DocumentMetadata;
  readonly parseMetadata?: DocumentMetadata;
}
