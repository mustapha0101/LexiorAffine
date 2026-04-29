import { IracExtension } from '@blocksuite/affine-shared/services';
import type { FrameworkProvider } from '@toeverything/infra';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspaceServerService, DefaultServerService } from '@affine/core/modules/cloud';
import { IracAttachmentService } from '@affine/core/modules/media/entities/irac-service';

export function patchIracService(framework: FrameworkProvider) {
  const workspaceService = framework.get(WorkspaceService);
  const workspaceServerService = framework.get(WorkspaceServerService);
  const defaultServerService = framework.get(DefaultServerService);

  const iracService = new IracAttachmentService(
    workspaceService,
    workspaceServerService,
    defaultServerService
  );

  return IracExtension(iracService);
}
