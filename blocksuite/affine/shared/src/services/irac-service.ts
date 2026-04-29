import { createIdentifier } from '@blocksuite/global/di';
import type { AttachmentBlockModel } from '@blocksuite/affine-model';

export type IracStatus = 'idle' | 'processing' | 'failed' | 'finished';

export interface IracService {
  mount(model: AttachmentBlockModel): void;
  unmount(model: AttachmentBlockModel): void;
  getJobStatus(modelId: string): IracStatus;
  onChangeJobStatus(modelId: string, cb: (status: IracStatus) => void): () => void;
  startJob?(model: AttachmentBlockModel): void;
}

export const IracProvider = createIdentifier<IracService>('AffineIracService');

export const IracExtension = (service: IracService) => {
  return {
    setup: (di: any) => {
      di.addImpl(IracProvider, () => service);
    },
  };
};
