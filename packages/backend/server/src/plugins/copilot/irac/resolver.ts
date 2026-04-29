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
import { CopilotIracService, IracJob } from './service';

@ObjectType()
class IracResultType {
  @Field(() => ID)
  id!: string;

  @Field(() => String, { nullable: true })
  issue!: string | null;

  @Field(() => String, { nullable: true })
  rule!: string | null;

  @Field(() => String, { nullable: true })
  application!: string | null;

  @Field(() => String, { nullable: true })
  conclusion!: string | null;

  @Field(() => AiJobStatus)
  status!: AiJobStatus;
}

const FinishedStatus: Set<AiJobStatus> = new Set([
  AiJobStatus.finished,
  AiJobStatus.claimed,
]);

@Injectable()
@Resolver(() => CopilotType)
export class CopilotIracResolver {
  constructor(
    private readonly ac: AccessController,
    private readonly iracService: CopilotIracService
  ) {}

  private handleJobResult(
    job: IracJob | null
  ): IracResultType | null {
    if (job) {
      const { irac: ret, status } = job;
      const finalJob: IracResultType = {
        id: job.id,
        status,
        issue: null,
        rule: null,
        application: null,
        conclusion: null,
      };
      if (FinishedStatus.has(finalJob.status)) {
        finalJob.issue = ret?.issue ?? null;
        finalJob.rule = ret?.rule ?? null;
        finalJob.application = ret?.application ?? null;
        finalJob.conclusion = ret?.conclusion ?? null;
      }
      return finalJob;
    }
    return null;
  }

  @Mutation(() => IracResultType, { nullable: true })
  async submitDocumentIrac(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('blobId') blobId: string,
    @Args('type', { nullable: true }) type?: string
  ): Promise<IracResultType | null> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const jobResult = await this.iracService.submitJob(
      user.id,
      workspaceId,
      blobId,
      { blobId, type }
    );

    return this.handleJobResult(jobResult);
  }

  @Mutation(() => IracResultType, { nullable: true })
  async claimDocumentIrac(
    @CurrentUser() user: CurrentUser,
    @Args('jobId') jobId: string
  ): Promise<IracResultType | null> {
    const job = await this.iracService.claimJob(user.id, jobId);
    return this.handleJobResult(job);
  }

  @ResolveField(() => IracResultType, {
    nullable: true,
  })
  async documentIrac(
    @Parent() copilot: CopilotType,
    @CurrentUser() user: CurrentUser,
    @Args('jobId', { nullable: true })
    jobId?: string,
    @Args('blobId', { nullable: true })
    blobId?: string
  ): Promise<IracResultType | null> {
    if (!copilot.workspaceId) return null;
    if (!jobId && !blobId) return null;

    await this.ac
      .user(user.id)
      .workspace(copilot.workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');

    const job = await this.iracService.queryJob(
      user.id,
      copilot.workspaceId,
      jobId,
      blobId
    );
    return this.handleJobResult(job);
  }
}
