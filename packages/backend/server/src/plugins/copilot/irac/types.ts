export interface IracPayload {
  issue: string;
  rule: string;
  application: string;
  conclusion: string;
  rawResponse?: string;
}

export interface IracSubmitInput {
  blobId: string;
  type?: string;
}

declare global {
  interface Events {
    'workspace.file.irac.finished': {
      jobId: string;
    };
    'workspace.file.irac.failed': {
      jobId: string;
      error?: string;
    };
  }
  interface Jobs {
    'copilot.irac.submit': {
      jobId: string;
      payload: IracPayload;
      modelId?: string;
      blobId?: string;
      type?: string;
    };
  }
}
