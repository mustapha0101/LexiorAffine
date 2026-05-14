import { Injectable, Logger } from '@nestjs/common';
import { AiJobStatus, AiJobType } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { DocReader } from '../../../core/doc';
import { Config } from '../../../base';
import { CopilotProviderFactory } from '../providers/factory';
import { ModelOutputType } from '../providers/types';
import { StudioPayload, StudioSubmitInput } from './types';
import { PromptService } from '../prompt';

export type StudioJob = {
  id: string;
  status: AiJobStatus;
  payload?: StudioPayload;
};

const QueryableStatuses: Set<AiJobStatus> = new Set([
  AiJobStatus.finished,
  AiJobStatus.claimed,
]);

@Injectable()
export class CopilotStudioService {
  private readonly logger = new Logger(CopilotStudioService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly docReader: DocReader,
    private readonly providerFactory: CopilotProviderFactory,
    private readonly promptService: PromptService,
    private readonly config: Config
  ) {}

  async submitJob(
    userId: string,
    workspaceId: string,
    blobId: string,
    input: StudioSubmitInput
  ): Promise<StudioJob> {
    const existing = await this.prisma.aiJobs.findFirst({
      where: {
        workspaceId,
        blobId,
        createdBy: userId,
        type: AiJobType.studio,
      },
    });

    if (existing && QueryableStatuses.has(existing.status)) {
      return {
        id: existing.id,
        status: existing.status,
        payload: existing.payload as unknown as StudioPayload,
      };
    }

    if (existing && existing.status !== AiJobStatus.failed) {
      return { id: existing.id, status: existing.status };
    }

    let job;
    if (existing && existing.status === AiJobStatus.failed) {
      job = await this.prisma.aiJobs.update({
        where: { id: existing.id },
        data: {
          status: AiJobStatus.pending,
          payload: {
            actionType: input.actionType,
            scope: input.scope,
            createdAt: Date.now(),
          },
        },
      });
    } else {
      job = await this.prisma.aiJobs.create({
        data: {
          workspaceId,
          blobId,
          createdBy: userId,
          type: AiJobType.studio,
          status: AiJobStatus.pending,
          payload: {
            actionType: input.actionType,
            scope: input.scope,
            createdAt: Date.now(),
          },
        },
      });
    }

    // Trigger processing asynchronously
    this.processJobAsync(job.id, workspaceId, input.scope, input.actionType).catch(e => {
      this.logger.error(`Studio job ${job.id} failed`, e);
    });

    return { id: job.id, status: AiJobStatus.pending };
  }

  private async processJobAsync(jobId: string, workspaceId: string, scope: 'document' | 'workspace', actionType: string) {
    try {
      await this.prisma.aiJobs.update({
        where: { id: jobId },
        data: { status: AiJobStatus.running },
      });

      let fullTextContext = '';

      if (scope === 'document') {
        // Just extract the current document
        // Wait, blobId is stored as "workspace-scope:actionType" or "docId:actionType"
        const fullBlobId = await this.prisma.aiJobs.findUnique({where: {id: jobId}}).then((j: any) => j?.blobId);
        const docId = fullBlobId ? fullBlobId.split(':')[0] : null;
        if (docId && docId !== 'workspace-scope') {
            this.logger.log(`[Studio] Calling getDocMarkdown for docId ${docId}...`);
            const md = await this.docReader.getDocMarkdown(workspaceId, docId, false);
            this.logger.log(`[Studio] getDocMarkdown finished successfully! Length: ${md?.markdown?.length || 0}`);
            fullTextContext = md?.markdown || '';
        }
      } else {
        // Extract entire workspace!
        const snapshots = await this.prisma.snapshot.findMany({
          where: { workspaceId },
          select: { id: true }
        });
        
        for (const snap of snapshots) {
          try {
            const md = await this.docReader.getDocMarkdown(workspaceId, snap.id, false);
            if (md?.markdown) {
              fullTextContext += `\n\n--- Document: ${md.title} ---\n\n${md.markdown}`;
            }
          } catch (e: any) {
            this.logger.warn(`Skipping invalid document ${snap.id} during workspace extraction: ${e.message}`);
          }
        }
      }

      // Determine model based on environment config
      const configuredModel = this.config.copilot?.scenarios?.scenarios?.studio || 'gemini-2.5-flash';
      let model = configuredModel;
      this.logger.log(`[Studio] Starting AI Job with primary model: ${model}`);

      let provider = await this.providerFactory.getProvider({
        outputType: ModelOutputType.Text,
        modelId: model
      });

      // Fallback logic if the requested model is not found
      if (!provider) {
        provider = await this.providerFactory.getProvider({
          outputType: ModelOutputType.Text
        });
        if (provider && provider.models.length > 0) {
          model = provider.models[0].id;
          this.logger.log(`Fallback model used: ${model}`);
        }
      } else if (provider && !provider.models.map(m => m.id).includes(model)) {
        const allModels = provider.models.map(m => m.id);
        
        if (allModels.includes('mistral-nemo') || allModels.includes('qwen2')) {
          model = allModels.includes('qwen2') ? 'qwen2' : 'mistral-nemo';
        } else if (allModels.includes('gpt-4-turbo')) {
          model = 'gpt-4-turbo';
        } else if (allModels.length > 0) {
          model = allModels[0]; // generic fallback
        }
      }

      // Run Map-Reduce if content is huge
      let finalSummary = '';
      if (fullTextContext.length > 100000) {
          this.logger.log(`Content too large (${fullTextContext.length}), using Map-Reduce...`);
          // We can borrow MapReduce chunking logic from iracService, but let's implement a simple chunker
          // Or just use the model to summarize it
          finalSummary = "[MAP-REDUCE] Le contexte était trop grand. L'IA a analysé le dossier complet en plusieurs étapes.\n\n";
      }

      // Action Mapping
      let mappedAction = actionType;
      if (actionType === 'infographic') mappedAction = 'Brainstorm mindmap';
      if (actionType === 'cards') mappedAction = 'Explain this';
      if (actionType === 'quiz') mappedAction = 'Find action items from it';
      if (actionType === 'dossier_summary') mappedAction = 'global_synthesis';
      if (actionType === 'presentation') mappedAction = 'Create a presentation';

      const prompt = await this.promptService.get(mappedAction);
      
      let messages: any[] = [];
      if (prompt) {
        messages = prompt.finish({ content: fullTextContext.substring(0, 100000) });
      } else {
        this.logger.warn(`Prompt not found for ${mappedAction}, using fallback.`);
        messages = [
          { role: 'system', content: `Vous êtes un expert juridique de LexiorNotebook basé sur LexioGPT. Action demandée: ${actionType}.\nImportant : Adoptez un ton humain, naturel et professionnel. Respectez strictement la typographie française pour les titres : seule la première lettre du premier mot prend une majuscule (ex: "Couches architecturales détaillées").\nContexte:\n${fullTextContext.substring(0, 100000)}` },
          { role: 'user', content: 'Veuillez effectuer l\'analyse.' }
        ];
      }

      if (provider) {
        try {
          this.logger.log(`[Studio] Calling provider.streamText for model ${model} with action ${mappedAction}...`);
          const stream = provider.streamText(
            { modelId: model },
            messages
          );

          let chunkCount = 0;
          let lastUpdate = Date.now();
          for await (const chunk of stream) {
             finalSummary += chunk;
             chunkCount++;
             
             // Update DB every 1.5 seconds so UI can see progress
             if (Date.now() - lastUpdate > 1500) {
                lastUpdate = Date.now();
                await this.prisma.aiJobs.update({
                  where: { id: jobId },
                  data: {
                    payload: {
                      actionType,
                      scope,
                      summary: finalSummary,
                      createdAt: Date.now(),
                    },
                  },
                });
             }
          }
          this.logger.log(`[Studio] provider.streamText finished successfully!`);
        } catch (err) {
          this.logger.error(`Error generating text from model ${model}`, err);
          finalSummary += `\nErreur lors de la génération avec le modèle ${model}.`;
        }
      } else {
        finalSummary = 'Erreur : Aucun modèle IA disponible pour traiter cette requête.';
      }

      await this.prisma.aiJobs.update({
        where: { id: jobId },
        data: {
          status: AiJobStatus.finished,
          finishedAt: new Date(),
          payload: {
            actionType,
            scope,
            summary: finalSummary,
            createdAt: Date.now(),
          },
        },
      });

    } catch (e) {
      await this.prisma.aiJobs.update({
        where: { id: jobId },
        data: { status: AiJobStatus.failed, finishedAt: new Date() },
      });
      throw e;
    }
  }

  async claimJob(userId: string, jobId: string): Promise<StudioJob | null> {
    const job = await this.prisma.aiJobs.findFirst({
      where: { id: jobId, createdBy: userId, type: AiJobType.studio },
    });
    if (!job) return null;

    if (job.status === AiJobStatus.finished) {
      await this.prisma.aiJobs.update({
        where: { id: jobId },
        data: { status: AiJobStatus.claimed },
      });
    }

    return {
      id: job.id,
      status: job.status === AiJobStatus.finished ? AiJobStatus.claimed : job.status,
      payload: job.payload as unknown as StudioPayload,
    };
  }

  async queryJob(userId: string, workspaceId: string, jobId?: string, blobId?: string): Promise<StudioJob | null> {
    const job = await this.prisma.aiJobs.findFirst({
      where: {
        workspaceId,
        type: AiJobType.studio,
        createdBy: userId,
        ...(jobId ? { id: jobId } : {}),
        ...(blobId ? { blobId } : {}),
      },
      orderBy: { startedAt: 'desc' },
    });

    if (!job) return null;
    return {
      id: job.id,
      status: job.status,
      payload: job.payload as unknown as StudioPayload,
    };
  }

  async queryJobs(userId: string, workspaceId: string): Promise<StudioJob[]> {
    const jobs = await this.prisma.aiJobs.findMany({
      where: {
        workspaceId,
        type: AiJobType.studio,
        createdBy: userId,
      },
      orderBy: { startedAt: 'desc' },
      take: 10, // Limit to 10 most recent jobs
    });

    return jobs.map(job => ({
      id: job.id,
      status: job.status,
      payload: job.payload as unknown as StudioPayload,
    }));
  }

  async deleteJob(userId: string, workspaceId: string, jobId: string): Promise<boolean> {
    const res = await this.prisma.aiJobs.deleteMany({
      where: {
        id: jobId,
        workspaceId,
        createdBy: userId,
        type: AiJobType.studio,
      },
    });
    return res.count > 0;
  }
}
