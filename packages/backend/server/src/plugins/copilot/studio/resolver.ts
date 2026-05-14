import { Injectable } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Mutation,
  ObjectType,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { AiJobStatus } from '@prisma/client';

import { CurrentUser } from '../../../core/auth';
import { AccessController } from '../../../core/permission';
import { CopilotType } from '../resolver';
import { CopilotStudioService, StudioJob } from './service';

@ObjectType()
class StudioResultType {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  actionType!: string | null;

  @Field(() => String, { nullable: true })
  scope!: string | null;

  @Field(() => String, { nullable: true })
  summary!: string | null;

  @Field(() => AiJobStatus)
  status!: AiJobStatus;
}

const FinishedStatus: Set<AiJobStatus> = new Set([
  AiJobStatus.finished,
  AiJobStatus.claimed,
]);

@Injectable()
@Resolver(() => CopilotType)
export class CopilotStudioResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly studioService: CopilotStudioService
  ) {}

  private handleJobResult(
    job: StudioJob | null
  ): StudioResultType | null {
    if (job) {
      const { payload: ret, status } = job;
      const finalJob: StudioResultType = {
        id: job.id,
        status,
        actionType: null,
        scope: null,
        summary: null,
      };
      if (FinishedStatus.has(finalJob.status)) {
        finalJob.actionType = ret?.actionType ?? null;
        finalJob.scope = ret?.scope ?? null;
        finalJob.summary = ret?.summary ?? null;
      }
      return finalJob;
    }
    return null;
  }

  @Mutation(() => StudioResultType, { nullable: true })
  async submitStudioJob(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('blobId') blobId: string,
    @Args('actionType') actionType: string,
    @Args('scope') scope: string
  ): Promise<StudioResultType | null> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const jobResult = await this.studioService.submitJob(
      user.id,
      workspaceId,
      blobId,
      { blobId, actionType, scope: scope as 'document' | 'workspace' }
    );

    return this.handleJobResult(jobResult);
  }

  @Mutation(() => StudioResultType, { nullable: true })
  async claimStudioJob(
    @CurrentUser() user: CurrentUser,
    @Args('jobId') jobId: string
  ): Promise<StudioResultType | null> {
    const job = await this.studioService.claimJob(user.id, jobId);
    return this.handleJobResult(job);
  }

  @Mutation(() => Boolean)
  async deleteStudioJob(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('jobId') jobId: string
  ): Promise<boolean> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    return this.studioService.deleteJob(user.id, workspaceId, jobId);
  }

  @ResolveField(() => StudioResultType, {
    nullable: true,
  })
  async documentStudio(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('jobId', { nullable: true })
    jobId?: string,
    @Args('blobId', { nullable: true })
    blobId?: string
  ): Promise<StudioResultType | null> {
    if (!copilot.workspaceId) return null;
    if (!jobId && !blobId) return null;

    await this.ac
      .user(user.id)
      .workspace(copilot.workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const job = await this.studioService.queryJob(
      user.id,
      copilot.workspaceId,
      jobId,
      blobId
    );
    return this.handleJobResult(job);
  }

  @ResolveField(() => [StudioResultType!])
  async documentStudioJobs(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser
  ): Promise<StudioResultType[]> {
    if (!copilot.workspaceId) return [];

    await this.ac
      .user(user.id)
      .workspace(copilot.workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const jobs = await this.studioService.queryJobs(user.id, copilot.workspaceId);
    return jobs.map(j => this.handleJobResult(j)).filter((j): j is StudioResultType => j !== null);
  }
}
