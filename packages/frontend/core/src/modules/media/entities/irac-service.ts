import { IracService as BlockSuiteIracService } from '@blocksuite/affine-shared/services';
import type { AttachmentBlockModel } from '@blocksuite/affine-model';
import { AiJobStatus } from '@affine/graphql';

import { WorkspaceServerService, DefaultServerService } from '../../cloud';
import { FetchService } from '../../cloud/services/fetch';
import { WorkspaceService } from '../../workspace';
import { Text } from '@blocksuite/store';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';

const submitDocumentIracMutation = `
  mutation submitDocumentIrac($workspaceId: String!, $blobId: String!, $type: String) {
    submitDocumentIrac(blobId: $blobId, workspaceId: $workspaceId, type: $type) {
      id
      status
    }
  }
`;

const getDocumentIracQuery = `
  query documentIrac($workspaceId: String!, $jobId: String, $blobId: String) {
    currentUser {
      copilot(workspaceId: $workspaceId) {
        documentIrac(jobId: $jobId, blobId: $blobId) {
          id
          status
          issue
          rule
          application
          conclusion
        }
      }
    }
  }
`;

const claimDocumentIracMutation = `
  mutation claimDocumentIrac($jobId: String!) {
    claimDocumentIrac(jobId: $jobId) {
      id
      status
      issue
      rule
      application
      conclusion
    }
  }
`;

import { IracService as BlockSuiteIracService, IracStatus } from '@blocksuite/affine-shared/services';

export class IracAttachmentService implements BlockSuiteIracService {
  private processingBlobs = new Set<string>();
  private readonly subscriptions: { unsubscribe: () => void }[] = [];
  private statuses = new Map<string, IracStatus>();
  private listeners = new Map<string, Set<(status: IracStatus) => void>>();

  onChangeJobStatus(modelId: string, cb: (status: IracStatus) => void): () => void {
    if (!this.listeners.has(modelId)) this.listeners.set(modelId, new Set());
    this.listeners.get(modelId)!.add(cb);
    return () => {
       this.listeners.get(modelId)?.delete(cb);
    };
  }

  getJobStatus(modelId: string): IracStatus {
    return this.statuses.get(modelId) || 'idle';
  }

  private setStatus(modelId: string, status: IracStatus) {
    this.statuses.set(modelId, status);
    const setCb = this.listeners.get(modelId);
    if (setCb) setCb.forEach(cb => cb(status));
  }

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly defaultServerService: DefaultServerService
  ) {}

  private get serverService() {
    return this.workspaceServerService.server || this.defaultServerService.server;
  }

  private get fetchService() {
    return this.serverService?.scope.get(FetchService);
  }

  mount(model: AttachmentBlockModel) {
    console.log('[IRAC] Service Mounted!', model.id);
    
    this.subscriptions.push(
      model.props.sourceId$.subscribe(sourceId => {
        const type = model.props.type || '';
        const isDoc = type.includes('pdf') || type.includes('word') || type.includes('document');

        console.log('[IRAC] sourceId updated:', sourceId, 'type:', type, 'isDoc:', isDoc);

        if (!sourceId || !isDoc) {
             return;
        }

        if (!this.processingBlobs.has(sourceId)) {
          // DO NOT auto-trigger. Let the user click the button!
          // We just initialize status if needed.
          // this.processingBlobs.add(sourceId);
          // this.processIrac(sourceId, model).catch(e => console.error('[IRAC] Crash:', e));
        }
      })
    );
  }

  public startJob(model: AttachmentBlockModel, type: string = 'irac') {
    const sourceId = model.props.sourceId$.value;
    if (!sourceId || this.processingBlobs.has(sourceId)) {
        console.log('[IRAC] startJob ignored. sourceId:', sourceId, 'processing:', this.processingBlobs.has(sourceId));
        return;
    }
    console.log('[IRAC] Manual startJob triggered for', sourceId, 'with type:', type);
    this.processingBlobs.add(sourceId);
    this.processIrac(sourceId, model, type).catch(e => console.error('[IRAC] Crash:', e));
  }

  unmount(model: AttachmentBlockModel) {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions.length = 0;
  }

  private async processIrac(blobId: string, model: AttachmentBlockModel, type: string) {
    const fetchService = this.fetchService;
    console.log('[IRAC] processIrac started. fetchService:', !!fetchService, 'serverService:', !!this.serverService);
    if (!fetchService) return;

    const workspaceId = this.workspaceService.workspace.id;
    const store = model.store || (model as any).doc;
    const targetParent = model.parent;
    const index = targetParent ? targetParent.children.findIndex((x: any) => x.id === model.id) : 0;
    const parentId = targetParent ? targetParent.id : undefined;

    let hasCompleted = false;

    // Check if Callout block already exists as child of attachment block
    for (const child of model.children) {
      if (child.flavour === 'affine:callout') {
         hasCompleted = true; // Wait, actually we shouldn't block it forever if they want to re-run it, but this is fine for now
         break;
      }
    }

    if (hasCompleted) {
       this.setStatus(model.id, 'finished');
       return;
    }
    
    this.setStatus(model.id, 'processing');

    try {
      // 1. Submit Job
      const submitRes = await fetchService.fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          operationName: 'submitDocumentIrac',
          query: submitDocumentIracMutation,
          variables: { workspaceId, blobId, type }
        })
      });

      const submitJson = await submitRes.json();
      
      const jobId = submitJson?.data?.submitDocumentIrac?.id;

      if (!jobId) {
        throw new Error('Failed to create IRAC parsing job: ' + JSON.stringify(submitJson?.errors || submitJson));
      }

      // 2. Poll for status
      let status: AiJobStatus = AiJobStatus.running;
      let result: any = null;
      let retries = 0;

      while (retries < 60) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s

        const pollRes = await fetchService.fetch('/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            operationName: 'documentIrac',
            query: getDocumentIracQuery,
            variables: { workspaceId, jobId, blobId }
          })
        });

        const pollJson = await pollRes.json();
        const iracJob = pollJson?.data?.currentUser?.copilot?.documentIrac;

        if (iracJob) {
          status = iracJob.status as AiJobStatus;
          if (status === AiJobStatus.finished || status === AiJobStatus.failed) {
            break;
          }
        }
        retries++;
      }

      if (status !== AiJobStatus.finished) {
        this.setStatus(model.id, 'failed');
        console.error('L\'analyse IRAC a échoué sur le serveur. Veuillez vérifier les quotas API ou réessayer plus tard.');
        return;
      }

      // 3. Claim result
      const claimRes = await fetchService.fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          operationName: 'claimDocumentIrac',
          query: claimDocumentIracMutation,
          variables: { jobId }
        })
      });

      const claimJson = await claimRes.json();
      result = claimJson?.data?.claimDocumentIrac;

      if (result) {
        // 4. Append to blocksuite doc
        await this.fillIracResult(model, result, type);
        this.setStatus(model.id, 'finished');
      } else {
          throw new Error('No result returned from claim check: ' + JSON.stringify(claimJson?.errors || claimJson));
      }
    } catch (e: any) {
      console.error('Failed to process IRAC', e);
      this.setStatus(model.id, 'failed');
    } finally {
      this.processingBlobs.delete(blobId);
    }
  }

  private addCalloutBlock(store: any, emoji: string, title: string, parentId?: string) {
    const calloutId = store.addBlock(
      'affine:callout',
      { emoji },
      parentId
    );
    store.addBlock(
      'affine:paragraph',
      {
        type: 'h6',
        text: new Text([{ insert: title }]),
      },
      calloutId
    );
    return calloutId;
  }

  private addParagraph(store: any, text: string, parentId?: string) {
    if (!text) return;
    store.addBlock(
      'affine:paragraph',
      { text: new Text(text) },
      parentId
    );
  }

  private async fillIracResult(model: AttachmentBlockModel, result: any, type: string) {
    const store = model.store || (model as any).doc;
    
    // Attachment blocks in BlockSuite can't hold Callout blocks directly! 
    // They can hold affine:transcription blocks, which in turn can hold Callouts.
    const transcriptionBlockId = store.addBlock(
      'affine:transcription',
      { transcription: {} },
      model.id
    );
    const parentId = transcriptionBlockId; // Attach as child to the transcription block!
    
    const fill = async () => {
        try {
            if (type === 'summary') {
                const calloutId = this.addCalloutBlock(store, '📑', 'Résumé', parentId);
                // Insert the conclusion containing markdown summary
                const markdownContent = result.conclusion || result.rawResponse;
                if (markdownContent) {
                    await MarkdownTransformer.importMarkdownToBlock({
                      doc: store,
                      blockId: calloutId,
                      markdown: markdownContent,
                      extensions: getStoreManager().config.init().value.get('store'),
                    });
                }
            } else {
                const calloutId = this.addCalloutBlock(store, '⚖️', 'Analyse Juridique IRAC (Générée)', parentId);
                
                if (result.issue) {
                    this.addParagraph(store, 'Issue (Problème Juridique):', calloutId);
                    this.addParagraph(store, result.issue, calloutId);
                }
                if (result.rule) {
                    this.addParagraph(store, 'Rule (Règle de Droit):', calloutId);
                    this.addParagraph(store, result.rule, calloutId);
                }
                if (result.application) {
                    this.addParagraph(store, 'Application:', calloutId);
                    this.addParagraph(store, result.application, calloutId);
                }
                if (result.conclusion) {
                    this.addParagraph(store, 'Conclusion:', calloutId);
                    this.addParagraph(store, result.conclusion, calloutId);
                }
            } // Close else block
        } catch (fillErr: any) {
            console.error('Fill error:', fillErr);
            throw fillErr;
        }
    };

    await fill();
  }
}
