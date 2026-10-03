export interface FileRenamedEventDTO {
  readonly type: 'renamed';
  readonly id: string;
  readonly newName: string;
  readonly newPath: string;
}
