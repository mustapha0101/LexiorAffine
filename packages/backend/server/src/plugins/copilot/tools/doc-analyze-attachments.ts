import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { toolError } from './error';
import { defineTool } from './tool';
import type { CopilotProviderFactory } from '../providers/factory';
import type { PromptMessage } from '../providers/types';

const logger = new Logger('DocAnalyzeAttachmentsTool');

export const createDocAnalyzeAttachmentsTool = (
  getDocBlocks: (docId: string) => Promise<any[]>,
  getBlobContent: (blobId: string) => Promise<string | undefined>,
  getBlobRaw: (blobId: string) => Promise<Buffer | undefined>,
  factory: CopilotProviderFactory,
  model: string
) => {
  return defineTool({
    description:
      'Analyze and extract information from all attached documents (PDF, Word, Excel, etc.) within a specific document. IMPORTANT: If the user asks you to analyze the current document, and the `<current_document_context>` is empty, you MUST IMMEDIATELY use this tool with the provided `doc_id`. Use this tool when the user asks to analyze attachments or extract details from files inside a document, to do so precisely without missing details and without token overload via a Map-Reduce approach.',
    inputSchema: z.object({
      doc_id: z.string().describe('The ID of the document containing the attachments'),
      query: z.string().describe('The user query or instructions for what details to extract from the attachments'),
    }),
    execute: async ({ doc_id, query }) => {
      try {
        const blocks = await getDocBlocks(doc_id);
        const attachments = blocks.filter(b => b.flavour === 'affine:attachment' || b.flavour === 'affine:embed');
        
        if (!attachments || attachments.length === 0) {
           return {
              status: 'No attachments found',
              message: `No attachments were found in document ${doc_id}.`
           };
        }

        const provider = await factory.getProviderByModel(model);
        if (!provider) {
           return toolError('Provider Not Found', `Failed to initialize LLM provider for model ${model}.`);
        }

        const intermediateResults: { fileName: string; summary: string }[] = [];

        // Map Phase
        for (const attachment of attachments) {
           const blobId = attachment.additional?.blobId ?? attachment.additional?.sourceId ?? attachment.blob?.[0];
           const fileName = attachment.additional?.name ?? attachment.additional?.title ?? 'document.pdf';
           
           if (!blobId) {
             intermediateResults.push({ fileName, summary: `No blob ID found for this attachment. Debug info: ${JSON.stringify({ additional: attachment.additional, blob: attachment.blob })}` });
             continue;
           }

           let text = await getBlobContent(blobId);
           const mapMessages: PromptMessage[] = [];

           if (!text || text.trim() === '') {
             const rawBuffer = await getBlobRaw(blobId);
             if (!rawBuffer) {
               intermediateResults.push({ fileName, summary: 'No extracted text or raw file data found for this attachment.' });
               continue;
             }
             
             const ext = fileName.split('.').pop()?.toLowerCase();
             let parsedFallbackText: string | null = null;
             
             if (ext === 'md' || ext === 'txt' || ext === 'csv' || ext === 'json') {
               parsedFallbackText = rawBuffer.toString('utf-8');
             } else if (ext === 'xlsx' || ext === 'pptx' || ext === 'docx' || ext === 'pdf' || ext === 'odt' || ext === 'odp' || ext === 'ods') {
               try {
                 const { parseOffice } = await import('officeparser');
                 const ast = await parseOffice(rawBuffer);
                 parsedFallbackText = ast.toText();
               } catch (err: any) {
                 logger.warn(`Could not parse ${ext} file cleanly. Error or missing officeparser: ${err.message}. Please install officeparser.`);
               }
             }

             if (parsedFallbackText && parsedFallbackText.trim() !== '') {
               mapMessages.push(
                 { role: 'system', content: 'You are a meticulous data extraction agent. Analyze the provided document text and extract all details relevant to the user query. Be highly precise and do not miss any details.' },
                 { role: 'user', content: `User Query: ${query}\n\nDocument Filename: ${fileName}\n\nText Content:\n${parsedFallbackText}` }
               );
             } else {
               let mimeType = 'application/pdf'; // Default to PDF to prevent model rejection
               if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
               else if (ext === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
               else if (ext === 'md' || ext === 'txt') mimeType = 'text/plain';
               else if (ext === 'png') mimeType = 'image/png';
               else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';

               mapMessages.push(
                 { role: 'system', content: 'You are a meticulous data extraction agent. Analyze the attached document and extract all details relevant to the user query. Be highly precise and do not miss any details.' },
                 { role: 'user', content: `User Query: ${query}\n\nDocument Filename: ${fileName}`, attachments: [{ kind: 'bytes', data: rawBuffer.toString('base64'), mimeType }] }
               );
             }
           } else {
             mapMessages.push(
               { role: 'system', content: 'You are a meticulous data extraction agent. Analyze the provided document text and extract all details relevant to the user query. Be highly precise and do not miss any details.' },
               { role: 'user', content: `User Query: ${query}\n\nDocument Filename: ${fileName}\n\nText Content:\n${text}` }
             );
           }

           try {
             const mapResult = await provider.text({ modelId: model }, mapMessages);
             intermediateResults.push({ fileName, summary: mapResult });
           } catch (e: any) {
             logger.error(`Failed to analyze attachment ${fileName} (${blobId})`, e);
             intermediateResults.push({ fileName, summary: `Error analyzing file: ${e.message}` });
           }
        }

        // Reduce Phase
        const reduceMessages: PromptMessage[] = [
           { role: 'system', content: 'You are an intelligent synthesis agent. You are provided with extracted details from multiple attachments. Synthesize these details into a comprehensive, cohesive, and accurate final response that perfectly answers the user query. Be precise and do not hallucinate.' },
           { role: 'user', content: `User Query: ${query}\n\nIntermediate Analyses:\n\n${intermediateResults.map(r => `--- File: ${r.fileName} ---\n${r.summary}`).join('\n\n')}` }
        ];

        const finalResult = await provider.text({ modelId: model }, reduceMessages);

        return {
           status: 'success',
           analyzedFilesCount: attachments.length,
           synthesis: finalResult
        };

      } catch (err: any) {
        logger.error(`Failed to analyze attachments for doc ${doc_id}`, err);
        return toolError('Doc Analyze Attachments Failed', err.message ?? String(err));
      }
    },
  });
};
