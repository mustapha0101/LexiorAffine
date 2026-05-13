import { toast } from '@affine/component';
import {
  ImageIcon,
  LanguageIcon,
  MindmapIcon,
  PenIcon,
  SendIcon,
} from '@blocksuite/icons/lit';

import { actionToHandler } from '../../actions/edgeless-handler.js';
import { AIMindMapIconWithAnimation } from '../../_common/icons.js';
import { AIProvider } from '../../provider/ai-provider.js';
import completeWritingWithAI from './templates/completeWritingWithAI.zip';
import freelyCommunicateWithAI from './templates/freelyCommunicateWithAI.zip';
import readAforeign from './templates/readAforeign.zip';
import redHat from './templates/redHat.zip';
import TidyMindMapV3 from './templates/TidyMindMapV3.zip';

import type { EditorHost } from '@blocksuite/affine/std';

export const AIPreloadConfig: {
  icon: any;
  text: string;
  testId: string;
  handler: (host?: EditorHost) => void;
}[] = [
  {
    icon: MindmapIcon(),
    text: 'Générer la Théorie de la Cause (MindMap)',
    testId: 'generate-theory-of-case-mindmap',
    handler: async () => {
      const mainHost = document.querySelector('editor-host') as any;
      if (!mainHost) return;
      try {
        let isEdgeless = false;
        try {
          const { GfxControllerIdentifier } = await import('@blocksuite/affine/std/gfx');
          isEdgeless = mainHost.std.has(GfxControllerIdentifier);
        } catch (e) {}

        if (isEdgeless) {
          const { actionToHandler, getContentFromSelected } = await import('../../actions/edgeless-handler.js');
          const handler = actionToHandler(
            'brainstormMindmap',
            AIMindMapIconWithAnimation,
            undefined,
            async (host, ctx) => {
              const elements = ctx.get().selectedElements || [];
              const content = await getContentFromSelected(host, elements);
              return { input: "Théorie de la cause détaillée pour ce dossier. Contexte:\n" + content };
            }
          );
          handler(mainHost);
        } else {
          const { actionToHandler } = await import('../../actions/doc-handler.js');
          const handler = actionToHandler(
            'brainstormMindmap',
            AIMindMapIconWithAnimation,
            { promptContext: "Théorie de la cause détaillée pour ce dossier. Contexte:" } as any
          );
          handler(mainHost);
        }
      } catch (e) {
        toast('Action failed', 'error');
        console.error(e);
      }
    },
  },
  {
    icon: LanguageIcon(),
    text: 'Classer le Document (Témoignage, Preuve, Contrat)',
    testId: 'classify-legal-document',
    handler: (host?: EditorHost) => {
      if (!host) return;
      document.dispatchEvent(new CustomEvent('request-legal-classification', { detail: { pageId: host.store.id } }));
    },
  },
  {
    icon: ImageIcon(),
    text: 'Schématiser la Chronologie des Faits',
    testId: 'schematize-fact-timeline',
    handler: async () => {
      const mainHost = document.querySelector('editor-host') as any;
      if (!mainHost) return;
      try {
        let isEdgeless = false;
        try {
          const { GfxControllerIdentifier } = await import('@blocksuite/affine/std/gfx');
          isEdgeless = mainHost.std.has(GfxControllerIdentifier);
        } catch (e) {}

        if (isEdgeless) {
          const { actionToHandler, getContentFromSelected } = await import('../../actions/edgeless-handler.js');
          const handler = actionToHandler(
            'brainstormMindmap',
            AIMindMapIconWithAnimation,
            undefined,
            async (host, ctx) => {
              const elements = ctx.get().selectedElements || [];
              const content = await getContentFromSelected(host, elements);
              return { input: "Schématise la chronologie complète et détaillée des événements du dossier. Contexte:\n" + content };
            }
          );
          handler(mainHost);
        } else {
          const { actionToHandler } = await import('../../actions/doc-handler.js');
          const handler = actionToHandler(
            'brainstormMindmap',
            AIMindMapIconWithAnimation,
            { promptContext: "Schématise la chronologie complète et détaillée des événements du dossier. Contexte:" } as any
          );
          handler(mainHost);
        }
      } catch (e) {
        toast('Action failed', 'error');
        console.error(e);
      }
    },
  },
  {
    icon: PenIcon(),
    text: 'Analyser les Contradictions (Détecteur de Mensonges)',
    testId: 'analyze-contradictions',
    handler: async () => {
      const mainHost = document.querySelector('editor-host') as any;
      if (!mainHost) return;
      try {
        let isEdgeless = false;
        try {
          const { GfxControllerIdentifier } = await import('@blocksuite/affine/std/gfx');
          isEdgeless = mainHost.std.has(GfxControllerIdentifier);
        } catch (e) {}

        if (isEdgeless) {
          const { actionToHandler, getContentFromSelected } = await import('../../actions/edgeless-handler.js');
          const handler = actionToHandler(
            'brainstormMindmap',
            AIMindMapIconWithAnimation,
            undefined,
            async (host, ctx) => {
              const elements = ctx.get().selectedElements || [];
              const content = await getContentFromSelected(host, elements);
              return { input: "Dresse une carte mentale des contradictions et incohérences dans les témoignages et les faits. Contexte:\n" + content };
            }
          );
          handler(mainHost);
        } else {
          const { actionToHandler } = await import('../../actions/doc-handler.js');
          const handler = actionToHandler(
            'brainstormMindmap',
            AIMindMapIconWithAnimation,
            { promptContext: "Dresse une carte mentale des contradictions et incohérences dans les témoignages et les faits. Contexte:" } as any
          );
          handler(mainHost);
        }
      } catch (e) {
        toast('Action failed', 'error');
        console.error(e);
      }
    },
  },
  {
    icon: SendIcon(),
    text: 'Interroger le Dossier (Recherche CanLII/A2AJ)',
    testId: 'interrogate-case-files',
    handler: async () => {
      const mainHost = document.querySelector('editor-host') as any;
      if (!mainHost) return;
      try {
        let isEdgeless = false;
        try {
          const { GfxControllerIdentifier } = await import('@blocksuite/affine/std/gfx');
          isEdgeless = mainHost.std.has(GfxControllerIdentifier);
        } catch (e) {}

        if (isEdgeless) {
          const { actionToHandler, getContentFromSelected } = await import('../../actions/edgeless-handler.js');
          const handler = actionToHandler(
            'brainstorm',
            AIPenIconWithAnimation,
            undefined,
            async (host, ctx) => {
              const elements = ctx.get().selectedElements || [];
              const content = await getContentFromSelected(host, elements);
              return { input: "Fais une recherche jurisprudentielle (CanLII) pertinente et l'analyse juridique applicable à ce dossier. Contexte:\n" + content };
            }
          );
          handler(mainHost);
        } else {
          const { actionToHandler } = await import('../../actions/doc-handler.js');
          const handler = actionToHandler(
            'brainstorm',
            AIPenIconWithAnimation,
            { promptContext: "Fais une recherche jurisprudentielle (CanLII) pertinente et l'analyse juridique applicable à ce dossier. Contexte:" } as any
          );
          handler(mainHost);
        }
      } catch (e) {
        toast('Action failed', 'error');
        console.error(e);
      }
    },
  },
];
