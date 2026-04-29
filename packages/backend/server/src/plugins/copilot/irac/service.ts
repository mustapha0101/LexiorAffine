import { Injectable } from '@nestjs/common';
import { AiJobStatus, AiJobType } from '@prisma/client';
import type { JsonValue } from '@prisma/client/runtime/library';

import {
  EventBus,
  JobQueue,
  OnEvent,
  OnJob,
  readBufferWithLimit,
  OneMB,
} from '../../../base';
import { WorkspaceBlobStorage } from '../../../core/storage';
import { Models } from '../../../models';
import { PromptService } from '../prompt/service';
import { CopilotProviderFactory } from '../providers/factory';
import { ModelOutputType } from '../providers/types';
import { IracResponseSchema } from './schema';
import type { IracPayload, IracSubmitInput } from './types';

export type IracJob = {
  id: string;
  status: AiJobStatus;
  irac?: IracPayload;
};

const QueryableStatuses: Set<AiJobStatus> = new Set([
  AiJobStatus.finished,
  AiJobStatus.claimed,
]);

@Injectable()
export class CopilotIracService {
  constructor(
    private readonly event: EventBus,
    private readonly models: Models,
    private readonly job: JobQueue,
    private readonly prompt: PromptService,
    private readonly providerFactory: CopilotProviderFactory,
    private readonly workspaceStorage: WorkspaceBlobStorage
  ) {}

  private async getModel() {
    // We are borrowing the generic model selection strategy.
    const prompt = await this.prompt.get('Summary'); // Or whatever existing prompt is best default, maybe 'Chat'
    return prompt?.model; 
  }

  async submitJob(
    userId: string,
    workspaceId: string,
    blobId: string,
    _input?: IracSubmitInput
  ): Promise<IracJob> {
    const type = _input?.type;
    const existing = await this.models.copilotJob.getWithUser(
      userId,
      workspaceId,
      undefined,
      blobId,
      AiJobType.irac
    );
    
    if (existing) {
      // If already exists and finished/failed, return current state
      if (existing.status === AiJobStatus.finished) {
        const job = await this.queryJob(userId, workspaceId, existing.id);
        if (!job) throw new Error('Job not found');
        return job;
      } else if (existing.status === AiJobStatus.failed) {
        // Re-dispatch if failed or canceled
        const payload: IracPayload = { issue: '', rule: '', application: '', conclusion: '' };
        const model = await this.getModel();
        return await this.executeJob(existing.id, payload, model, blobId, type);
      } else {
        // Job is pending, running, or claimed.
        // Force re-dispatch to avoid jobs stuck forever in running state after a server restart.
        const payload: IracPayload = { issue: '', rule: '', application: '', conclusion: '' };
        const model = await this.getModel();
        return await this.executeJob(existing.id, payload, model, blobId, type);
      }
    }

    const { id: jobId } = await this.models.copilotJob.create({
      workspaceId,
      blobId,
      createdBy: userId,
      type: AiJobType.irac,
    });

    const payload: IracPayload = {
      issue: '',
      rule: '',
      application: '',
      conclusion: '',
    };
    const model = await this.getModel();
    return await this.executeJob(jobId, payload, model, blobId, type);
  }

  async executeJob(
    jobId: string,
    payload: IracPayload,
    modelId?: string,
    blobId?: string,
    type?: string
  ): Promise<IracJob> {
    const status = AiJobStatus.running;
    await this.models.copilotJob.update(jobId, {
      status,
      payload: payload as unknown as JsonValue,
    });

    // We assume the frontend extracted text or we extract text here.
    // For now, let's pass blobId so we can fetch the blob content in the job queue.
    await this.job.add('copilot.irac.submit', {
      jobId,
      payload,
      modelId,
      blobId,
    });

    return { id: jobId, status };
  }

  async claimJob(
    userId: string,
    jobId: string
  ): Promise<IracJob | null> {
    const status = await this.models.copilotJob.claim(jobId, userId);
    if (status === AiJobStatus.claimed) {
      const dbJob = await this.models.copilotJob.get(jobId);
      if (!dbJob) return null;
      const job = await this.queryJob(userId, dbJob.workspaceId, jobId);
      return job ? { ...job, status } : null;
    }
    return null;
  }

  async queryJob(
    userId: string,
    workspaceId: string,
    jobId?: string,
    blobId?: string
  ) {
    const job = await this.models.copilotJob.getWithUser(
      userId,
      workspaceId,
      jobId,
      blobId,
      AiJobType.irac
    );

    if (!job) {
      return null;
    }

    const ret: IracJob = {
      id: job.id,
      status: job.status,
    };

    if (QueryableStatuses.has(job.status)) {
      try {
        ret.irac = IracResponseSchema.parse(job.payload) as IracPayload;
      } catch {
        ret.irac = job.payload as unknown as IracPayload; // fallback
      }
    }

    return ret;
  }

  @OnJob('copilot.irac.submit')
  async generateIrac({
    jobId,
    modelId,
    blobId,
    type,
  }: {
    jobId: string;
    modelId?: string;
    blobId?: string;
    type?: string;
  }) {
    try {
      const dbJob = await this.models.copilotJob.get(jobId);
      if (!dbJob) throw new Error(`Job not found: ${jobId}`);
      const workspaceId = dbJob.workspaceId;

      const actualModelId = modelId?.startsWith('gemini') ? modelId : 'gemini-2.5-flash';
      const provider = await this.providerFactory.getProvider(
        {
          outputType: ModelOutputType.Structured,
          modelId: actualModelId,
        }
      );

      if (!provider) {
         throw new Error('No Copilot provider available for IRAC generation');
      }

      let instruction = "Tu es un assistant juridique expert. Analyse le document fourni et extrais un IRAC (Problème de droit, Règle de droit, Application, Conclusion). Retourne uniquement un objet JSON valide avec les clés strictes : issue, rule, application, conclusion. Tout le contenu généré à l'intérieur du JSON doit être obligatoirement rédigé en français.";
      if (type === 'summary') {
        instruction = `Tu es un assistant analytique expert. Génère un résumé complet de ce document en français. Identifie les points clés et les conclusions principales.
Retourne le résultat dans un format JSON valide correspondant exactement à cette structure : {"issue": "", "rule": "", "application": "", "conclusion": "<Ton résumé détaillé en Markdown avec des points et titres>"}.
C'est TRÈS IMPORTANT de mettre TOUT le résumé généré uniquement dans la propriété "conclusion", et de laisser les autres champs vides.`;
      }
      
      let attachments: any[] = [];
      if (blobId && workspaceId) {
        const { body } = await this.workspaceStorage.get(workspaceId, blobId);
        if (body) {
          const buffer = await readBufferWithLimit(body as any, 50 * OneMB);
          attachments.push({
            kind: 'bytes',
            data: buffer.toString('base64'),
            mimeType: 'application/pdf',
          });
        }
      }

      const result = await provider.structure(
        { modelId: actualModelId },
        [
          { role: 'system' as const, content: instruction },
          { role: 'user' as const, content: "Veuillez analyser le document attaché.", attachments }
        ],
        { schema: IracResponseSchema }
      );

      let cleanResult = result.trim();
      const match = cleanResult.match(/```json([\s\S]*?)```/i) || cleanResult.match(/```([\s\S]*?)```/);
      if (match) {
        cleanResult = match[1].trim();
      }
      const parsed: IracPayload = IracResponseSchema.parse(JSON.parse(cleanResult));

      await this.models.copilotJob.update(jobId, {
        payload: parsed as unknown as JsonValue,
      });

      this.event.emit('workspace.file.irac.finished', {
        jobId,
      });
      return;
    } catch (error: any) {
      console.error("IRAC generation failed:", error);
      this.event.emit('workspace.file.irac.failed', {
        jobId,
        error: error?.message || String(error)
      });
      throw error;
    }
  }

  @OnEvent('workspace.file.irac.finished')
  async onFileIracFinish({
    jobId,
  }: { jobId: string }) {
    await this.models.copilotJob.update(jobId, {
      status: AiJobStatus.finished,
    });
  }

  @OnEvent('workspace.file.irac.failed')
  async onFileIracFailed({
    jobId,
    error,
  }: { jobId: string, error?: string }) {
    const updateData: any = { status: AiJobStatus.failed };
    if (error) {
      updateData.payload = { error } as unknown as JsonValue;
    }
    await this.models.copilotJob.update(jobId, updateData);
  }
}
