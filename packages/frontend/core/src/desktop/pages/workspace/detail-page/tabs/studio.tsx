import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor';
import {
  AiIcon,
  ChartPanelIcon,
  CardPanelIcon,
  FileIcon,
  PlayIcon,
  ArrowRightSmallIcon,
  SignOutIcon,
  ViewLayersIcon,
  EdgelessIcon,
  FilterIcon,
  ResetIcon,
  CloseIcon,
  PinIcon
} from '@blocksuite/icons/rc';
import React, { useState, useEffect } from 'react';
import { useService } from '@toeverything/infra';
import { WorkspaceService, getAFFiNEWorkspaceSchema } from '@affine/core/modules/workspace';
import { DocsService } from '@affine/core/modules/doc';
import { WorkspaceServerService, DefaultServerService } from '@affine/core/modules/cloud';
import { FetchService } from '@affine/core/modules/cloud/services/fetch';
import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { toast, Switch, Button } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { OrganizeService } from '@affine/core/modules/organize';
import { TagService } from '@affine/core/modules/tag';

import * as styles from './studio.css';

export interface EditorStudioPanelProps {
  editor: AffineEditorContainer | null;
}

const StudioCard = ({ 
  title, 
  icon, 
  bgColor, 
  color, 
  isBeta = false,
  onClick
}: { 
  title: string; 
  icon: React.ReactNode; 
  bgColor: string; 
  color: string;
  isBeta?: boolean;
  onClick?: () => void;
}) => {
  return (
    <div 
      className={styles.card} 
      style={{ backgroundColor: bgColor, color: color }}
      onClick={onClick}
    >
      <div className={styles.cardHeader}>
        <div className={styles.iconWrapper}>{icon}</div>
        <ArrowRightSmallIcon className={styles.arrowIcon} />
      </div>
      <div className={styles.cardTitle}>
        {title}
        {isBeta && <span className={styles.betaBadge}>BÊTA</span>}
      </div>
    </div>
  );
};

const submitStudioJobMutation = `
  mutation submitStudioJob($workspaceId: String!, $blobId: String!, $actionType: String!, $scope: String!) {
    submitStudioJob(blobId: $blobId, workspaceId: $workspaceId, actionType: $actionType, scope: $scope) {
      id
      status
    }
  }
`;

const deleteStudioJobMutation = `
  mutation deleteStudioJob($workspaceId: String!, $jobId: String!) {
    deleteStudioJob(workspaceId: $workspaceId, jobId: $jobId)
  }
`;

export const getStudioJobQuery = `
  query getStudioJob($workspaceId: String!) {
    currentUser {
      copilot(workspaceId: $workspaceId) {
        documentStudioJobs {
          id
          status
          actionType
          summary
        }
      }
    }
  }
`;

export const EditorStudioPanel = ({ editor }: EditorStudioPanelProps) => {
  const workspaceService = useService(WorkspaceService);
  const navigateHelper = useNavigateHelper();
  const workspaceServerService = useService(WorkspaceServerService);
  const defaultServerService = useService(DefaultServerService);
  const [loading, setLoading] = useState(false);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);
  const [currentScope, setCurrentScope] = useState<'workspace' | 'document'>('document');

  const [generatedDocs, setGeneratedDocs] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('lexior_generated_docs') || '{}');
    } catch {
      return {};
    }
  });

  const saveGeneratedDoc = (jobId: string, docId: string) => {
    setGeneratedDocs(prev => {
      const next = { ...prev, [jobId]: docId };
      localStorage.setItem('lexior_generated_docs', JSON.stringify(next));
      return next;
    });
  };

  const organizeGeneratedDoc = (docId: string) => {
    if (docId === 'generating' || docId === 'error') return;
    try {
      const tagService = workspaceService.workspace.scope.get(TagService);
      const tags = tagService.tagList.tags$.value;
      let analyseTag = tags.find(t => t.value$.value === 'Analyse');
      if (!analyseTag) {
        analyseTag = tagService.tagList.createTag('Analyse', 'Blue');
      }
      analyseTag.tag(docId);

      const organizeService = workspaceService.workspace.scope.get(OrganizeService);
      const rootFolder = organizeService.folderTree.rootFolder;
      const folders = rootFolder.children$.value;
      let analyseFolder = folders.find(f => f.name$.value === 'Analyses');
      if (!analyseFolder) {
        const newFolderId = rootFolder.createFolder('Analyses', rootFolder.indexAt('after'));
        rootFolder.store.createLink(newFolderId, 'doc', docId, 'a0');
      } else {
        const existingChildren = analyseFolder.children$.value;
        const alreadyLinked = existingChildren.some(child => child.data$.value === docId && child.type$.value === 'doc');
        if (!alreadyLinked) {
          analyseFolder.createLink('doc', docId, analyseFolder.indexAt('after'));
        }
      }
    } catch (e) {
      console.error('Failed to tag or organize document', e);
    }
  };

  const serverService = workspaceServerService.server || defaultServerService.server;
  const fetchService = serverService?.scope.get(FetchService);

  const pollJobStatus = async () => {
    if (!fetchService) return;
    const workspaceId = workspaceService.workspace.id;
    const variables: any = { workspaceId };

    try {
      const res = await fetchService.fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'getStudioJob',
          query: getStudioJobQuery,
          variables
        })
      });
      const json = await res.json();
      const jobs = json.data?.currentUser?.copilot?.documentStudioJobs || [];
      setActiveJobs(jobs);
    } catch (e) {
      console.error('Failed to fetch studio job', e);
    }
  };

  useEffect(() => {
    pollJobStatus();
  }, []); // Run once on mount

  useEffect(() => {
    // Poll every 3 seconds to ensure UI stays fresh
    const interval = setInterval(() => {
      pollJobStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    activeJobs.forEach(async (job) => {
      const currentGeneratedDocs = JSON.parse(localStorage.getItem('lexior_generated_docs') || '{}');
      if (job.status === 'finished' && job.summary && !currentGeneratedDocs[job.id]) {
        saveGeneratedDoc(job.id, 'generating'); 
        try {
          const docId = await MarkdownTransformer.importMarkdownToDoc({
            collection: workspaceService.workspace.docCollection,
            schema: getAFFiNEWorkspaceSchema(),
            markdown: job.summary,
            extensions: getStoreManager().config.init().value.get('store')
          });
          if (docId) {
            const docsService = workspaceService.workspace.scope.get(DocsService);
            const titleMap: Record<string, string> = {
              'validate_contract': 'Validation de Contrat',
              'risk_analysis': 'Analyse des Risques',
              'global_synthesis': 'Synthèse Globale',
              'draft_clause': 'Rédaction de Clause',
              'presentation': 'Présentation BÊTA'
            };
            const title = titleMap[job.actionType] || `Analyse Lexior : ${job.actionType}`;
            await docsService.changeDocTitle(docId, title);

            if (job.actionType === 'infographic') {
               setTimeout(async () => {
                 try {
                   const { AIProvider } = await import('@affine/core/blocksuite/ai/provider');
                   if (AIProvider.actions.createImage) {
                     toast("Génération de l'infographie en cours...");
                     const stream = await AIProvider.actions.createImage({
                        input: job.summary,
                        workspaceId: workspaceService.workspace.id,
                        docId: docId,
                     });
                     let imageUrl = '';
                     for await (const chunk of stream) {
                        imageUrl += chunk;
                     }
                     if (imageUrl) {
                       let imageBlob: Blob | undefined = undefined;
                       if (imageUrl.startsWith('data:')) {
                         const parts = imageUrl.split(',');
                         const match = parts[0].match(/:(.*?);/);
                         const mimeString = match ? match[1] : 'image/png';
                         const byteString = atob(parts[1]);
                         const ab = new ArrayBuffer(byteString.length);
                         const ia = new Uint8Array(ab);
                         for (let i = 0; i < byteString.length; i++) {
                           ia[i] = byteString.charCodeAt(i);
                         }
                         imageBlob = new Blob([ab], { type: mimeString });
                       } else if (imageUrl.startsWith('http')) {
                         try {
                           const res = await fetch(imageUrl);
                           imageBlob = await res.blob();
                         } catch (err) {
                           console.error('Failed to fetch image', err);
                         }
                       }
    
                       if (imageBlob) {
                         const sourceId = await workspaceService.workspace.docCollection.blobSync.set(
                           new File([imageBlob], 'infographie.png', { type: imageBlob.type })
                         );
                         const doc = workspaceService.workspace.docCollection.getDoc(docId);
                         if (doc) {
                            doc.load();
                            const noteBlock = doc.getBlocksByFlavour('affine:note')[0];
                            if (noteBlock) {
                               doc.addBlock('affine:image', { sourceId: sourceId }, noteBlock.id);
                               toast("Infographie ajoutée au document !");
                            }
                         }
                       } else {
                           toast("Erreur lors de la récupération de l'image.");
                       }
                     }
                   }
                 } catch (e) {
                    console.error('Failed to generate image automatically', e);
                    toast("Échec de la génération de l'infographie.");
                 }
               }, 0);
            }

            if (job.actionType === 'presentation') {
              docsService.list.setPrimaryMode(docId, 'edgeless');
              saveGeneratedDoc(job.id, docId);
              organizeGeneratedDoc(docId);
              navigateHelper.jumpToPage(workspaceService.workspace.id, docId);
              setTimeout(() => {
                const host = document.querySelector('editor-host') as any;
                if (host) {
                  import('@affine/core/blocksuite/ai/slides').then(({ PPTBuilder }) => {
                    PPTBuilder(host).process(job.summary).catch(console.error);
                  });
                }
              }, 1500);
            } else {
              docsService.list.setPrimaryMode(docId, 'page');
              saveGeneratedDoc(job.id, docId);
              organizeGeneratedDoc(docId);
            }
          } else {
            saveGeneratedDoc(job.id, docId);
          }
        } catch (e) {
          console.error('Failed to auto generate doc:', e);
          saveGeneratedDoc(job.id, 'error');
        }
      }
    });
  }, [activeJobs, workspaceService.workspace.docCollection]);

  const handleAction = async (actionName: string) => {
    if (!fetchService) {
      toast('Impossible de contacter le serveur.');
      return;
    }

    setLoading(true);
    toast(`Démarrage de l'action : ${actionName} (${currentScope})`);

    try {
      const workspaceId = workspaceService.workspace.id;
      // Extract the real document ID if we are in document scope
      const docId = currentScope === 'document' ? editor.doc.id : 'workspace-scope';
      const blobId = `${docId}:${actionName}`;

      const res = await fetchService.fetch('/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          operationName: 'submitStudioJob',
          query: submitStudioJobMutation,
          variables: { workspaceId, blobId, actionType: actionName, scope: currentScope }
        })
      });

      const json = await res.json();
      if (json.errors) {
        throw new Error(json.errors[0]?.message || 'Erreur inconnue');
      }

      // Optimistically show the panel immediately
      if (json.data?.submitStudioJob) {
        setActiveJobs(prev => {
          const newJob = {
            id: json.data.submitStudioJob.id,
            status: json.data.submitStudioJob.status || 'pending',
            actionType: actionName,
            summary: null
          };
          const exists = prev.find(j => j.id === newJob.id);
          if (exists) {
            return prev.map(j => j.id === newJob.id ? newJob : j);
          }
          return [newJob, ...prev];
        });
      }

      toast('La tâche a été soumise au Lexior IA.');
      pollJobStatus(); // refresh UI immediately
    } catch (e: any) {
      toast(`Erreur: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!fetchService) return;
    try {
      const workspaceId = workspaceService.workspace.id;
      
      // Optimistically remove from UI
      setActiveJobs(prev => prev.filter(j => j.id !== jobId));

      await fetchService.fetch('/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operationName: 'deleteStudioJob',
          query: deleteStudioJobMutation,
          variables: { workspaceId, jobId }
        })
      });
      
    } catch (e) {
      console.error('Failed to delete job', e);
      pollJobStatus(); // revert on failure
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>Studio</div>

      <div className={styles.pinToggle}>
        <Switch 
          checked={currentScope === 'workspace'} 
          onChange={(checked) => setCurrentScope(checked ? 'workspace' : 'document')} 
        />
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '4px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--affine-text-primary)' }}>
            {currentScope === 'workspace' ? "Tous les documents" : "Document en cours"}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--affine-text-secondary)' }}>
            {currentScope === 'workspace' ? "Analyse étendue à tout le dossier" : "Analyse limitée à ce document"}
          </span>
        </div>
      </div>
      
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Général</div>
        <div className={styles.grid}>
          <StudioCard title="Résumé audio" icon={<PlayIcon />} bgColor="#EDF2FF" color="#3B5BDB" onClick={() => handleAction('audio')} />
          <StudioCard title="Présentation" icon={<EdgelessIcon />} bgColor="#FFF3E0" color="#E67700" isBeta onClick={() => handleAction('presentation')} />
          <StudioCard title="Résumé vidéo" icon={<PlayIcon />} bgColor="#EBFBEE" color="#2B8A3E" onClick={() => handleAction('video')} />
          <StudioCard title="Carte mentale" icon={<ChartPanelIcon />} bgColor="#F3F0FF" color="#6741D9" onClick={() => handleAction('mindmap')} />
          <StudioCard title="Rapports" icon={<FileIcon />} bgColor="#FFF4E6" color="#D9480F" onClick={() => handleAction('report')} />
          <StudioCard title="Fiches..." icon={<CardPanelIcon />} bgColor="#FFF0F6" color="#A61E4D" onClick={() => handleAction('cards')} />
          <StudioCard title="Quiz" icon={<FilterIcon />} bgColor="#E3FAFC" color="#0B7285" onClick={() => handleAction('quiz')} />
          <StudioCard title="Infographie" icon={<ChartPanelIcon />} bgColor="#F8F0FC" color="#862E9C" isBeta onClick={() => handleAction('infographic')} />
        </div>
      </div>

      <div className={styles.section} style={{ marginTop: '24px' }}>
        <div className={styles.sectionTitle}>Actions Juridiques (Dossier)</div>
        <div className={styles.grid}>
          <StudioCard title="Valider Contrat" icon={<SignOutIcon />} bgColor="#E6FCF5" color="#087F5B" onClick={() => handleAction('validate_contract')} />
          <StudioCard title="Analyse Risques" icon={<AiIcon />} bgColor="#FFF5F5" color="#C92A2A" onClick={() => handleAction('risk_analysis')} />
          <StudioCard title="Synthèse globale" icon={<ViewLayersIcon />} bgColor="#F4FCE3" color="#5C940D" onClick={() => handleAction('dossier_summary')} />
          <StudioCard title="Rédiger Clause" icon={<FileIcon />} bgColor="#E7F5FF" color="#1864AB" onClick={() => handleAction('draft_clause')} />
        </div>
      </div>

      <div style={{ marginTop: '32px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {activeJobs.map((job) => (
          <div key={job.id} className={styles.statusPanel} style={{ marginTop: 0 }}>
            <div className={styles.statusHeader}>
              {(job.status === 'pending' || job.status === 'running') ? (
                <>
                  <ResetIcon className={styles.spinner} />
                  <span>Analyse en cours : {job.actionType}...</span>
                </>
              ) : job.status === 'failed' ? (
                <>
                  <span style={{ color: 'red' }}>Action échouée : {job.actionType}</span>
                </>
              ) : (
                <>
                  <span style={{ color: 'green', fontWeight: 600 }}>Action terminée : {job.actionType}</span>
                </>
              )}
              
              <div 
                className={styles.deleteButton} 
                onClick={() => handleDeleteJob(job.id)}
                title="Supprimer cette tâche"
              >
                <CloseIcon />
              </div>
            </div>
            {job.summary && (
              <div className={styles.summaryContent} style={{ marginTop: '12px', padding: '16px', background: 'var(--affine-background-secondary)', borderRadius: '8px', border: '1px solid var(--affine-border-color)' }}>
                {generatedDocs[job.id] && generatedDocs[job.id] !== 'generating' && generatedDocs[job.id] !== 'error' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                    <div style={{ color: 'var(--affine-text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                      Le rapport d'analyse a été généré et sauvegardé dans votre espace.
                    </div>
                    <Button 
                      variant="primary" 
                      onClick={() => navigateHelper.jumpToPage(workspaceService.workspace.id, generatedDocs[job.id])}
                      style={{ width: '100%' }}
                    >
                      Ouvrir le rapport d'analyse
                    </Button>
                  </div>
                ) : generatedDocs[job.id] === 'generating' ? (
                  <div style={{ color: 'var(--affine-text-secondary)', fontSize: '13px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <ResetIcon className={styles.spinner} /> Création automatique du document en cours...
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ color: 'var(--affine-text-secondary)', fontSize: '13px' }}>
                      Une erreur est survenue lors de la création automatique. Vous pouvez le créer manuellement :
                    </div>
                    <Button 
                      variant="primary" 
                      onClick={async () => {
                        try {
                          saveGeneratedDoc(job.id, 'generating');
                          let markdownToImport = job.summary;
                          if (job.actionType === 'infographic') {
                             try {
                                 const { AIProvider } = await import('@affine/core/blocksuite/ai/provider');
                                 if (AIProvider.actions.createImage) {
                                   toast("Génération de l'infographie en cours...");
                                   const imageUrl = await AIProvider.actions.createImage({
                                      input: "Generate an infographic based on this text:\n" + job.summary,
                                      workspaceId: workspaceService.workspace.id,
                                   });
                                   if (imageUrl) {
                                      markdownToImport = `${job.summary}\n\n![Infographie](${imageUrl})`;
                                   }
                                 }
                               } catch (e) {
                                  console.error('Failed to generate image automatically', e);
                               }
                            }
                            const docId = await MarkdownTransformer.importMarkdownToDoc({
                              collection: workspaceService.workspace.docCollection,
                              schema: getAFFiNEWorkspaceSchema(),
                              markdown: markdownToImport,
                              extensions: getStoreManager().config.init().value.get('store')
                            });
                          if (docId) {
                            const docsService = workspaceService.workspace.scope.get(DocsService);
                            const titleMap: Record<string, string> = {
                              'validate_contract': 'Validation de Contrat',
                              'risk_analysis': 'Analyse des Risques',
                              'global_synthesis': 'Synthèse Globale',
                              'draft_clause': 'Rédaction de Clause',
                              'presentation': 'Présentation BÊTA'
                            };
                            const title = titleMap[job.actionType] || `Analyse Lexior : ${job.actionType}`;
                            await docsService.changeDocTitle(docId, title);
                            
                            if (job.actionType === 'presentation') {
                              docsService.list.setPrimaryMode(docId, 'edgeless');
                              saveGeneratedDoc(job.id, docId);
                              organizeGeneratedDoc(docId);
                              navigateHelper.jumpToPage(workspaceService.workspace.id, docId);
                              setTimeout(() => {
                                const host = document.querySelector('editor-host') as any;
                                if (host) {
                                  import('@affine/core/blocksuite/ai/slides').then(({ PPTBuilder }) => {
                                    PPTBuilder(host).process(job.summary).catch(console.error);
                                  });
                                }
                              }, 1500);
                            } else {
                              docsService.list.setPrimaryMode(docId, 'page');
                              saveGeneratedDoc(job.id, docId);
                              organizeGeneratedDoc(docId);
                            }
                          } else {
                            saveGeneratedDoc(job.id, docId);
                          }
                        } catch (err) {
                          saveGeneratedDoc(job.id, 'error');
                          toast("Erreur lors de la création du document");
                        }
                      }}
                    >
                      Convertir en Document Officiel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
};
