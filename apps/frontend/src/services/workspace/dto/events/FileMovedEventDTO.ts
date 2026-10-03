export interface FileMovedEventDTO {
  readonly type: 'moved';
  readonly id: string;
  readonly newParentId: string;
}
