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
              message: `TELL THE USER EXACTLY THIS: "Erreur de synchronisation : Le serveur n'a détecté aucune pièce jointe dans ce document (doc_id: ${doc_id}). Il se peut que le document ne soit pas encore sauvegardé sur le serveur backend. J'ai examiné ${blocks.length} blocs au total."`
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

            let extractedText = await getBlobContent(blobId);
            const rawBuffer = await getBlobRaw(blobId);

            if ((!extractedText || extractedText.trim() === '') && rawBuffer) {
              const ext = fileName.split('.').pop()?.toLowerCase();
              if (ext === 'md' || ext === 'txt' || ext === 'csv' || ext === 'json') {
                extractedText = rawBuffer.toString('utf-8');
              } else if (ext === 'pdf') {
                try {
                  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
                  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(rawBuffer) });
                  const pdfDocument = await loadingTask.promise;
                  let fullText = '';
                  for (let i = 1; i <= pdfDocument.numPages; i++) {
                    const page = await pdfDocument.getPage(i);
                    const textContent = await page.getTextContent();
                    fullText += textContent.items.map((s: any) => s.str).join(' ') + '\n';
                  }
                  extractedText = fullText;
                  
                  // OCR FALLBACK
                  if (!extractedText || extractedText.trim() === '') {
                    console.log(`DocAnalyze: No text found in ${fileName}, starting OCR...`);
                    try {
                      const pdf2img = require('pdf-img-convert');
                      const Tesseract = require('tesseract.js');
                      const imageBuffers = await pdf2img.convert(rawBuffer, { scale: 2.0 });
                      let ocrText = '';
                      for (let i = 0; i < imageBuffers.length; i++) {
                        const { data: { text } } = await Tesseract.recognize(imageBuffers[i], 'fra');
                        ocrText += text + '\n\n';
                      }
                      extractedText = ocrText;
                      console.log(`DocAnalyze: OCR completed for ${fileName}`);
                    } catch (ocrErr: any) {
                      console.error(`DocAnalyze: OCR Failed for ${fileName}`, ocrErr);
                      extractedText = "PDF PARSING SUCCESSFUL BUT NO TEXT FOUND (SCANNED PDF) AND OCR FAILED.";
                    }
                  }
                } catch (err: any) {
                  extractedText = `PDF PARSING ERROR: ${err.message}\n${err.stack}`;
                }
              } else if (ext === 'xlsx' || ext === 'pptx' || ext === 'docx' || ext === 'odt' || ext === 'odp' || ext === 'ods') {
                try {
                  const { parseOffice } = await import('officeparser');
                  const parsedResult = await parseOffice(rawBuffer);
                  if (typeof parsedResult === 'string') {
                    extractedText = parsedResult;
                  } else if (parsedResult && typeof (parsedResult as any).toText === 'function') {
                    extractedText = (parsedResult as any).toText();
                  } else {
                    extractedText = String(parsedResult);
                  }
                } catch (err: any) {
                  logger.warn(`Could not parse ${ext} file cleanly. Error or missing officeparser: ${err.message}. Please install officeparser.`);
                }
              }
            }

            try {
              if (extractedText && extractedText.trim() !== '') {
                // We have text! Chunk it.
                const chunkSize = 8000;
                const overlap = 500;
                const chunks: string[] = [];
                for (let i = 0; i < extractedText.length; i += (chunkSize - overlap)) {
                  chunks.push(extractedText.substring(i, Math.min(i + chunkSize, extractedText.length)));
                  if (i + chunkSize >= extractedText.length) break;
                }

                const chunkSummaries: string[] = [];
                const batchSize = 3;
                for (let i = 0; i < chunks.length; i += batchSize) {
                  const batch = chunks.slice(i, i + batchSize);
                  const batchResults = await Promise.all(batch.map(async (chunk, idx) => {
                    const chunkIndex = i + idx + 1;
                    const mapMessages: PromptMessage[] = [
                      { role: 'system', content: 'You are a meticulous data extraction agent. Analyze the provided document text chunk and extract all details relevant to the user query. Be highly precise and do not miss any details.' },
                      { role: 'user', content: `User Query: ${query}\n\nDocument Filename: ${fileName} (Chunk ${chunkIndex} of ${chunks.length})\n\nText Content:\n${chunk}` }
                    ];
                    return provider.text({ modelId: model }, mapMessages);
                  }));
                  chunkSummaries.push(...batchResults);
                }

                if (chunkSummaries.length === 1) {
                  intermediateResults.push({ fileName, summary: chunkSummaries[0] });
                } else {
                  // File-level reduce
                  const fileReduceMessages: PromptMessage[] = [
                    { role: 'system', content: 'You are an intelligent synthesis agent. Synthesize the chunked extractions of this document into a comprehensive file summary that answers the user query.' },
                    { role: 'user', content: `User Query: ${query}\n\nDocument Filename: ${fileName}\n\nChunk Summaries:\n${chunkSummaries.map((s, i) => `--- Chunk ${i + 1} ---\n${s}`).join('\n\n')}` }
                  ];
                  const fileSummary = await provider.text({ modelId: model }, fileReduceMessages);
                  intermediateResults.push({ fileName, summary: fileSummary });
                }

              } else if (rawBuffer) {
                // Binary attachment (e.g., image)
                const ext = fileName.split('.').pop()?.toLowerCase();
                let mimeType = 'application/pdf'; // Default to PDF to prevent model rejection
                if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                else if (ext === 'xlsx') mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
                else if (ext === 'md' || ext === 'txt') mimeType = 'text/plain';
                else if (ext === 'png') mimeType = 'image/png';
                else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';

                const mapMessages: PromptMessage[] = [
                  { role: 'system', content: 'You are a meticulous data extraction agent. Analyze the attached document and extract all details relevant to the user query. Be highly precise and do not miss any details.' },
                  { role: 'user', content: `User Query: ${query}\n\nDocument Filename: ${fileName}`, attachments: [{ kind: 'bytes', data: rawBuffer.toString('base64'), mimeType }] }
                ];
                const mapResult = await provider.text({ modelId: model }, mapMessages);
                intermediateResults.push({ fileName, summary: mapResult });
              } else {
                logger.warn(`Missing blob buffer for attachment ${fileName} (blobId: ${blobId})`);
                intermediateResults.push({ fileName, summary: `TELL THE USER EXACTLY THIS: "Le document binaire n'est pas encore synchronisé sur le serveur. Veuillez patienter quelques secondes pour l'upload ou vérifier votre connexion."` });
              }
            } catch (err: any) {
              logger.error(`Error processing attachment ${fileName}: ${err.message}`, err.stack);
              intermediateResults.push({ fileName, summary: `TELL THE USER EXACTLY THIS: "Erreur interne lors du traitement du fichier ${fileName}: ${err.message}"` });
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
