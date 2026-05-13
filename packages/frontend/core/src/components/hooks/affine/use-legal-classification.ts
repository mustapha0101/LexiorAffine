import { useEffect } from 'react';
import type { Store } from '@blocksuite/affine/store';
import { TagService } from '@affine/core/modules/tag';
import { useService } from '@toeverything/infra';
import { toast } from '@affine/component';
import { EditorService } from '@affine/core/modules/editor';

import { DocsService } from '@affine/core/modules/doc';

export function useLegalClassificationInterceptor(page: Store) {
  const tagService = useService(TagService);
  const docsService = useService(DocsService);

  useEffect(() => {
    const handleClassify = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail.pageId !== page.id) return;
      
      const blockId = customEvent.detail?.blockId;
      if (blockId) {
        const block = page.getBlock(blockId);
        if (!block) return;
      }
      
      toast("Scan juridique du document en cours par l'IA...", { duration: 3000 });

      const runAiClassification = async () => {
        let textContent = '';
        try {
          if (blockId) {
            const block = page.getBlock(blockId);
            if (block) {
              const m = block.model as any;
              const title = m.name || m.title || m.caption || '';
              const text = m.text?.toString() || '';
              textContent = `Pièce jointe / Élément sélectionné : ${title} ${text}`.trim();
            }
          } else {
            const blocks = Array.from(page.blocks.values());
            textContent = blocks.map((b: any) => b.text?.toString() || b.model?.text?.toString() || '').join('\n').trim();
          }
        } catch (e) {
          console.error(e);
        }

        if (!textContent || textContent === 'Pièce jointe / Élément sélectionné :') {
          textContent = "Document ou pièce vide";
        }

        const prompt = `Voici un texte ou le titre d'une pièce jointe. Détermine à quelle catégorie juridique il appartient parmi ces 4 catégories: Audience, Preuve, Pièce, Correspondance. Réponds UNIQUEMENT avec le nom de la catégorie exacte et rien d'autre. Contenu: ${textContent.substring(0, 4000)}`;

        try {
          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'LexiorGPT-mini-128k-ccq:latest',
              prompt: prompt,
              stream: false
            })
          });
          const data = await response.json();
          let predictedCategory = data.response?.trim() || '';

          const legalTags = ['Audience', 'Preuve', 'Pièce', 'Correspondance'];
          let finalClassification = 'Pièce'; // fallback
          for (const t of legalTags) {
            if (predictedCategory.toLowerCase().includes(t.toLowerCase())) {
              finalClassification = t;
              break;
            }
          }

          const currentTags = tagService.tagList.tagIdsByPageId$(page.id).value || [];
          const tagsList = tagService.tagList.tags$.value || [];
          let classTag = tagsList.find((t: any) => t.value$.value.toLowerCase() === finalClassification.toLowerCase());
          if (!classTag) {
            classTag = tagService.tagList.createTag(finalClassification, tagService.randomTagColor());
          }

          if (!currentTags.includes(classTag.id)) {
            classTag.tag(page.id);
            toast(`✓ Document classifié par l'IA : ${finalClassification}`);
          } else {
            toast(`✓ Document déjà classifié en tant que "${finalClassification}"`);
          }
        } catch (error) {
          console.error('Ollama classification failed', error);
          toast("Erreur de connexion à l'IA locale (Ollama).", { duration: 5000 });
        }
      };

      runAiClassification();
    };

    document.addEventListener('request-legal-classification', handleClassify);

    return () => {
      document.removeEventListener('request-legal-classification', handleClassify);
    };
  }, [page, tagService, docsService]);
}
