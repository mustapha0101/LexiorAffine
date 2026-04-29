import type {
  MeetingSummaryV2Type,
  NormalizedTranscriptSegmentType,
} from '@affine/graphql';

import type { TranscriptionResult } from './types';

type TranscriptionPayloadLike = {
  title?: string | null;
  summary?: string | null;
  actions?: string | null;
  transcription?:
    | {
        speaker: string;
        start: string;
        end: string;
        transcription: string;
      }[]
    | null;
  normalizedSegments?: NormalizedTranscriptSegmentType[] | null;
  summaryJson?: MeetingSummaryV2Type | null;
};

function formatSection(title: string, items: string[]) {
  if (!items.length) {
    return [];
  }

  return [`## ${title}`, ...items.map(item => `- ${item}`)];
}

export function summaryJsonToMarkdown(
  summaryJson?: MeetingSummaryV2Type | null
) {
  if (!summaryJson) {
    return '';
  }

  return [
    ...formatSection('Points Clés', summaryJson.keyPoints),
    ...formatSection('Décisions', summaryJson.decisions),
    ...formatSection('Questions Ouvertes', summaryJson.openQuestions),
    ...formatSection('Blocages', summaryJson.blockers),
  ]
    .join('\n')
    .trim();
}

export function actionItemsToMarkdown(
  summaryJson?: MeetingSummaryV2Type | null
) {
  if (!summaryJson?.actionItems.length) {
    return '';
  }

  return summaryJson.actionItems
    .map(item => {
      const suffix = [item.owner, item.deadline].filter(Boolean).join(' · ');
      return `- [ ] ${item.description}${suffix ? ` (${suffix})` : ''}`;
    })
    .join('\n')
    .trim();
}

function normalizedSegmentsToResult(
  normalizedSegments?: NormalizedTranscriptSegmentType[] | null
) {
  return (
    normalizedSegments?.map(segment => ({
      speaker: segment.speaker,
      start: segment.start,
      end: segment.end,
      transcription: segment.text,
    })) ?? []
  );
}

export function buildTranscriptionResult(
  payload: TranscriptionPayloadLike
): TranscriptionResult {
  return {
    title: payload.summaryJson?.title ?? payload.title ?? '',
    summary: payload.summaryJson ? summaryJsonToMarkdown(payload.summaryJson) : (payload.summary ?? ''),
    actions: payload.summaryJson ? actionItemsToMarkdown(payload.summaryJson) : (payload.actions ?? ''),
    segments: payload.normalizedSegments ? normalizedSegmentsToResult(payload.normalizedSegments) : (payload.transcription ?? []),
  };
}
