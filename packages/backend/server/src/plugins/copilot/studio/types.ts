export interface StudioPayload {
  actionType: string;
  scope: 'document' | 'workspace';
  summary?: string;
}

export interface StudioSubmitInput {
  blobId: string; // The active document blob id or a dummy if scope=workspace
  actionType: string;
  scope: 'document' | 'workspace';
}
