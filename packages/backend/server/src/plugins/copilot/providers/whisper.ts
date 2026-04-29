
import { z } from 'zod';

import {
  CopilotProviderSideError,
  readResponseBufferWithLimit,
  safeFetch,
} from '../../../base';
import { CopilotProvider } from './provider';
import {
  CopilotProviderType,
  ModelInputType,
  ModelOutputType,
  type CopilotChatOptions,
  type CopilotProviderModel,
  type CopilotStructuredOptions,
  type ModelConditions,
  type PromptMessage,
  type StreamObject,
} from './types';
import { promptAttachmentToUrl } from './utils';

export type WhisperConfig = {
  baseURL: string;
  apiKey?: string;
  model?: string;
};

const WhisperSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
});

const WhisperResponseSchema = z.object({
  text: z.string(),
  segments: z.array(WhisperSegmentSchema).optional(),
});

export class WhisperProvider extends CopilotProvider<WhisperConfig> {
  readonly type = CopilotProviderType.Whisper;

  get models(): CopilotProviderModel[] {
    return [
      {
        id: this.config.model || 'whisper-1',
        name: 'Whisper ASR',
        capabilities: [
          {
            input: [ModelInputType.Audio],
            output: [ModelOutputType.Text, ModelOutputType.Structured],
            attachments: {
              kinds: ['audio', 'file'],
              allowRemoteUrls: true,
            },
            structuredAttachments: {
              kinds: ['audio', 'file'],
              allowRemoteUrls: true,
            },
          },
        ],
      },
    ];
  }

  override configured(): boolean {
    return !!this.config.baseURL;
  }

  private handleError(e: any) {
    if (e instanceof CopilotProviderSideError) return e;
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected Whisper response',
    });
  }

  private async getAudioBuffer(messages: PromptMessage[]): Promise<Buffer | null> {
    for (const msg of messages) {
      if (!msg.attachments) continue;
      for (const attachment of msg.attachments) {
        const url = promptAttachmentToUrl(attachment);
        if (url) {
          const parsedUrl = new URL(url);
          // if it's a data url, we'll parse it
          if (parsedUrl.protocol === 'data:') {
            const dataParts = parsedUrl.pathname.split(',');
            return Buffer.from(dataParts[1], 'base64');
          }
          // otherwise fetch it
          const res = await safeFetch(parsedUrl);
          if (res.ok) {
            return await readResponseBufferWithLimit(res, 50 * 1024 * 1024); // 50MB limit
          }
        }
      }
    }
    return null;
  }

  override async structure(
    _cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions = {}
  ): Promise<string> {
    try {
      const buffer = await this.getAudioBuffer(messages);
      if (!buffer) {
        throw new Error('No audio attachment found in prompt messages');
      }

      const form = new FormData();
      form.append('file', new Blob([buffer]) as any, 'audio.wav');
      form.append('model', this.config.model || 'whisper-1');
      form.append('response_format', 'verbose_json');

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.baseURL.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers,
        body: form as any,
        signal: options.signal,
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Whisper API error: ${response.status} ${err}`);
      }

      const json = await response.json();
      const whisperData = WhisperResponseSchema.parse(json);

      // Map Whisper output to Affine's TranscriptResponseSchema
      // [{ "a": "A", "s": 0, "e": 5, "t": "text" }]
      const mappedSegments = (whisperData.segments || []).map(seg => ({
        a: 'A', // Whisper standard endpoint doesn't diarize, assume Speaker A
        s: seg.start,
        e: seg.end,
        t: seg.text.trim(),
      }));

      // if model is used for 'Summarize the meeting structured', it won't work well
      // But transcript audio specifically uses TranscriptionResponseSchema
      return JSON.stringify(mappedSegments);
    } catch (e: any) {
      throw this.handleError(e);
    }
  }

  override async text(
    _cond: ModelConditions,
    _messages: PromptMessage[],
    _options: CopilotChatOptions = {}
  ): Promise<string> {
    throw new Error('Whisper provider only supports structure via audio translation currently for transcription');
  }

  override async *streamText(
    _cond: ModelConditions,
    _messages: PromptMessage[],
    _options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    throw new Error('Not supported');
  }

  override async *streamObject(
    _cond: ModelConditions,
    _messages: PromptMessage[],
    _options: CopilotChatOptions = {}
  ): AsyncIterable<StreamObject> {
    throw new Error('Not supported');
  }
}
