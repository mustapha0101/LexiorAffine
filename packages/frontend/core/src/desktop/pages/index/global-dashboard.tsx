import { getAFFiNEWorkspaceSchema, WorkspacesService } from '@affine/core/modules/workspace';
import { useLiveData, useService } from '@toeverything/infra';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { Button } from '@affine/component';
import { WorkspaceProfileService } from '@affine/core/modules/workspace/services/profile';
import { WorkspaceFlavoursService } from '@affine/core/modules/workspace/services/flavours';
import { DocsService } from '@affine/core/modules/doc';
import { OrganizeService } from '@affine/core/modules/organize';
import { TagService } from '@affine/core/modules/tag';
import { ZipTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { useRef, useState } from 'react';

import * as Y from 'yjs';

const openDB = () => new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('LexiorTemplateDB', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('templates');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const saveTemplate = async (blob: Blob) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readwrite');
    const store = tx.objectStore('templates');
    const req = store.put(blob, 'workspace_template');
    req.onsuccess = resolve;
    req.onerror = reject;
  });
};

const getTemplate = async (): Promise<Blob | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readonly');
    const store = tx.objectStore('templates');
    const req = store.get('workspace_template');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = reject;
  });
};

const getRootUpdate = async (): Promise<Uint8Array | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('templates', 'readonly');
    const store = tx.objectStore('templates');
    const req = store.get('root_update');
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = reject;
  });
};
  
export const GlobalDashboard = () => {
  const workspacesService = useService(WorkspacesService);
  const profileService = useService(WorkspaceProfileService);
  const { jumpToPage } = useNavigateHelper();
  
  const workspaces = useLiveData(workspacesService.list.workspaces$);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  const handleCreateClient = async () => {
    const clientName = window.prompt("Nom du nouveau client :", "Nouveau Client");
    if (!clientName) return; // Annulé par l'utilisateur

    try {
      const meta = await workspacesService.create('local', async (docCollection) => {
        docCollection.meta.initialize();
        docCollection.doc.getMap('meta').set('name', clientName);
      });

      // Ouvrir le workspace pour initialiser l'arborescence
      const { workspace } = workspacesService.open({ metadata: meta });
      await workspace.engine.doc.waitForDocReady(workspace.id);

      // Check if there is a template
      const templateBlob = await getTemplate();
      if (templateBlob) {
        // Apply rootUpdate first to get folders and tags
        const rootUpdate = await getRootUpdate();
        if (rootUpdate) {
          Y.applyUpdate(workspace.docCollection.doc, rootUpdate);
        }

        // Import docs from the template
        await ZipTransformer.importDocs(
          workspace.docCollection,
          getAFFiNEWorkspaceSchema(),
          templateBlob
        );
        // Wait a bit to ensure indexing
        await new Promise(r => setTimeout(r, 500));
        jumpToPage(meta.id, 'all');
        return;
      }

      // -----------------------------------------------------
      // Fallback: Default initialization if no template is set
      // -----------------------------------------------------
      const docsService = workspace.scope.get(DocsService);
      const organizeService = workspace.scope.get(OrganizeService);
      const tagService = workspace.scope.get(TagService);

      // Création des Tags Juridiques
      const tagEnCours = tagService.tagList.createTag('En cours', 'Blue');
      const tagUrgent = tagService.tagList.createTag('Urgent', 'Red');
      const tagPlaide = tagService.tagList.createTag('Plaidé', 'Green');
      const tagDelibere = tagService.tagList.createTag('En délibéré', 'Purple');

      // Création des Modèles (Templates)
      const tplNotes = docsService.createDoc({ title: '📝 Modèle - Note d\'audience', isTemplate: true });
      const tplFacture = docsService.createDoc({ title: '💶 Modèle - Facture', isTemplate: true });

      // Création des Documents
      const docNotes = docsService.createDoc({ title: '📝 Notes d\'audience' });
      docNotes.setMeta({ tags: [tagEnCours.id] });
      
      const docFactures = docsService.createDoc({ title: '💶 Facture Initiale' });
      const docPieces = docsService.createDoc({ title: '📁 Bordereau de pièces' });
      const docConclu = docsService.createDoc({ title: '⚖️ Conclusions (Projet)' });
      docConclu.setMeta({ tags: [tagUrgent.id] });

      // Attendre un peu que RxJS popule les listes
      await new Promise(r => setTimeout(r, 100));

      // Création des Dossiers dans l'OrganizeService
      const rootFolder = organizeService.folderTree.rootFolder;
      
      const procId = rootFolder.createFolder('⚖️ Actes de procédure', rootFolder.indexAt('after'));
      const procFolder = organizeService.folderTree.folderNode$(procId).value;
      procFolder?.createLink('doc', docConclu.id, procFolder.indexAt('after'));
      
      const piecesId = rootFolder.createFolder('📁 Pièces du dossier', rootFolder.indexAt('after'));
      const piecesFolder = organizeService.folderTree.folderNode$(piecesId).value;
      piecesFolder?.createLink('doc', docPieces.id, piecesFolder.indexAt('after'));

      const adminId = rootFolder.createFolder('💶 Administratif & Facturation', rootFolder.indexAt('after'));
      const adminFolder = organizeService.folderTree.folderNode$(adminId).value;
      adminFolder?.createLink('doc', docFactures.id, adminFolder.indexAt('after'));
      
      const corresId = rootFolder.createFolder('📝 Correspondances', rootFolder.indexAt('after'));
      const corresFolder = organizeService.folderTree.folderNode$(corresId).value;
      corresFolder?.createLink('doc', docNotes.id, corresFolder.indexAt('after'));

      const modelesId = rootFolder.createFolder('⚙️ Modèles du Cabinet', rootFolder.indexAt('after'));
      const modelesFolder = organizeService.folderTree.folderNode$(modelesId).value;
      modelesFolder?.createLink('doc', tplNotes.id, modelesFolder.indexAt('after'));
      modelesFolder?.createLink('doc', tplFacture.id, modelesFolder.indexAt('after'));

      // Navigation vers le nouveau dashboard client
      jumpToPage(meta.id, 'all');
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfigTemplate = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsImporting(true);
      try {
        const blob = new Blob([file], { type: 'application/zip' });
        await saveTemplate(blob);
        alert('Modèle de Workspace enregistré avec succès ! Tous les nouveaux clients seront basés sur ce modèle.');
      } catch (e) {
        console.error(e);
        alert('Erreur lors de la sauvegarde du modèle.');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'var(--affine-font-family)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <h1 style={{ fontSize: '32px', margin: '0 0 8px 0' }}>⚖️ Le Cabinet Lexior</h1>
          <p style={{ color: 'var(--affine-text-secondary-color)', margin: 0 }}>Supervision globale de vos clients et dossiers.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".zip" 
            style={{ display: 'none' }} 
            onChange={handleTemplateUpload} 
          />
          <Button size="large" onClick={handleConfigTemplate} loading={isImporting}>
            ⚙️ Configurer le Modèle
          </Button>
          <Button size="large" type="primary" onClick={handleCreateClient}>
            + Nouveau Client
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px' }}>
        {workspaces.map(ws => {
          const profile = profileService.getProfile(ws);
          return (
            <WorkspaceCard 
              key={ws.id} 
              workspaceId={ws.id} 
              profile={profile} 
              onClick={() => jumpToPage(ws.id, 'all')} 
            />
          );
        })}
      </div>
    </div>
  );
};

const WorkspaceCard = ({ workspaceId, profile, onClick }: any) => {
  const info = useLiveData(profile.profile$);
  
  return (
    <div 
      onClick={onClick}
      style={{ 
        border: '1px solid var(--affine-border-color)', 
        borderRadius: '12px', 
        padding: '24px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        background: 'var(--affine-background-primary-color)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}
      onMouseOver={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseOut={e => (e.currentTarget.style.transform = 'none')}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ 
          width: '40px', height: '40px', borderRadius: '8px', 
          background: 'var(--affine-primary-color)', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px', fontWeight: 'bold', marginRight: '16px'
        }}>
          {info?.name ? info.name.charAt(0).toUpperCase() : 'C'}
        </div>
        <h3 style={{ margin: 0, fontSize: '18px' }}>{info?.name || 'Client Sans Nom'}</h3>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
        <div style={{ background: 'var(--affine-background-secondary-color)', padding: '8px', borderRadius: '6px' }}>
          <div style={{ color: 'var(--affine-text-secondary-color)', marginBottom: '4px' }}>Tâches</div>
          <div style={{ fontWeight: 'bold' }}>{info?.clientMetrics?.todos || 0} en attente</div>
        </div>
        <div style={{ background: 'var(--affine-background-secondary-color)', padding: '8px', borderRadius: '6px' }}>
          <div style={{ color: 'var(--affine-text-secondary-color)', marginBottom: '4px' }}>Urgences</div>
          <div style={{ fontWeight: 'bold', color: info?.clientMetrics?.urgent ? 'var(--affine-error-color)' : 'inherit' }}>
            {info?.clientMetrics?.urgent || 0} dossiers
          </div>
        </div>
      </div>
    </div>
  );
};
