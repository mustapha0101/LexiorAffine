import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { DocReader } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import { Models } from '../../../models';
import {
  documentSyncPendingError,
  workspaceSyncRequiredError,
} from './doc-sync';
import { type ToolError, toolError } from './error';
import { defineTool } from './tool';
import type { CopilotChatOptions } from './types';

const logger = new Logger('DocReadTool');

const isToolError = (result: ToolError | object): result is ToolError =>
  'type' in result && result.type === 'error';

export const buildDocContentGetter = (
  ac: AccessController,
  docReader: DocReader,
  models: Models
) => {
  const getDoc = async (options: CopilotChatOptions, docId?: string) => {
    if (!options?.user || !options?.workspace || !docId) {
      return toolError(
        'Doc Read Failed',
        'Missing workspace, user, or document id for doc_read.'
      );
    }

    const workspace = await models.workspace.get(options.workspace);
    if (!workspace) {
      return workspaceSyncRequiredError();
    }

    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .can('Doc.Read');
    if (!canAccess) {
      logger.warn(
        `User ${options.user} does not have access to doc ${docId} in workspace ${options.workspace}`
      );
      return toolError(
        'Doc Read Failed',
        `You do not have permission to read document ${docId} in this workspace.`
      );
    }

    const docMeta = await models.doc.getAuthors(options.workspace, docId);
    if (!docMeta) {
      return documentSyncPendingError(docId);
    }

    const content = await docReader.getDocMarkdown(
      options.workspace,
      docId,
      true
    );
    if (!content) {
      return documentSyncPendingError(docId);
    }

    let markdownContent = content.markdown;
    try {
      const { readAllBlocksFromDocSnapshot } = await import('../../../core/utils/blocksuite');
      const docRecord = await docReader.getDoc(options.workspace, docId);
      if (docRecord) {
        const result = await readAllBlocksFromDocSnapshot(docId, docRecord.bin);
        const attachments = result.blocks.filter(b => b.flavour === 'affine:attachment' || b.flavour === 'affine:embed');
        if (attachments && attachments.length > 0) {
           const fileNames = attachments.map(a => (a.additional as any)?.name ?? (a.additional as any)?.title ?? 'document_attache').join(', ');
           markdownContent += `\n\n[System Note: This document contains ${attachments.length} attached file(s) (${fileNames}). You MUST IMMEDIATELY invoke the \`docAnalyzeAttachments\` tool to extract and read the contents of these files before answering. DO NOT write any conversational text. DO NOT explain what you are going to do. ONLY output the tool call.]`;
        }
      }
    } catch (e) {
       logger.warn('Failed to parse attachments for doc-read', e);
    }

    return {
      docId,
      title: content.title,
      markdown: markdownContent,
      createdAt: docMeta.createdAt,
      updatedAt: docMeta.updatedAt,
      createdByUser: docMeta.createdByUser,
      updatedByUser: docMeta.updatedByUser,
    };
  };
  return getDoc;
};

type DocReadToolResult = Awaited<
  ReturnType<ReturnType<typeof buildDocContentGetter>>
>;

export const createDocReadTool = (
  getDoc: (targetId?: string) => Promise<DocReadToolResult>
) => {
  return defineTool({
    description:
      'Return the text content of a document (via Markdown) and its metadata. IMPORTANT: This tool DOES NOT extract text from attached files inside the document (like PDFs or Word files). If you need to analyze attachments, you MUST use the `docAnalyzeAttachments` tool instead or in addition to this one.',
    inputSchema: z.object({
      doc_id: z.string().describe('The target doc to read'),
    }),
    execute: async ({ doc_id }) => {
      try {
        const doc = await getDoc(doc_id);
        return isToolError(doc) ? doc : { ...doc };
      } catch (err: any) {
        logger.error(`Failed to read the doc ${doc_id}`, err);
        return toolError('Doc Read Failed', err.message ?? String(err));
      }
    },
  });
};
