import { WorkbenchService, ViewBody, ViewHeader, ViewTitle } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService, LiveData } from '@toeverything/infra';
import { DocsService } from '@affine/core/modules/doc';
import { TagService } from '@affine/core/modules/tag';
import { useMemo, useEffect, useState } from 'react';
import type { DocRecord } from '@affine/core/modules/doc/entities/record';
import { WorkspaceProfileService } from '@affine/core/modules/workspace/services/profile';
import { WorkspacesService, WorkspaceService } from '@affine/core/modules/workspace';
import { JournalService } from '@affine/core/modules/journal/services/journal';
import { Button } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { EditorJournalPanel } from '../detail-page/tabs/journal';
import { ViewSidebarTab, ViewService } from '@affine/core/modules/workbench';
import { TodayIcon, AiIcon, ArrowRightSmallIcon, CloseIcon } from '@blocksuite/icons/rc';

export const CabinetPage = () => {
  const t = useI18n();
  const docsService = useService(DocsService);
  const tagService = useService(TagService);
  const workbench = useService(WorkbenchService).workbench;
  const workspacesService = useService(WorkspacesService);
  const workspaceService = useService(WorkspaceService);
  const profileService = useService(WorkspaceProfileService);
  const journalService = useService(JournalService);
  const viewService = useService(ViewService);

  const docs = useLiveData(docsService.list.docs$);
  const tagMetas = useLiveData(tagService.tagList.tagMetas$);

  const allJournalDates = useLiveData(journalService.allJournalDates$);
  const evenementsMapLiveData$ = useMemo(() => LiveData.from(docsService.propertyValues$('custom:date_audience'), new Map()), [docsService]);
  const evenementsMap = useLiveData(evenementsMapLiveData$);

  const timelineEventsLiveData$ = useMemo(() => LiveData.from(docsService.propertyValues$('custom:events_timeline'), new Map()), [docsService]);
  const timelineEventsMap = useLiveData(timelineEventsLiveData$);

  const docSummaryLiveData$ = useMemo(() => LiveData.from(docsService.propertyValues$('custom:doc_summary'), new Map()), [docsService]);
  const docSummaryMap = useLiveData(docSummaryLiveData$);

  const [isExtractingTimeline, setIsExtractingTimeline] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);

  const [dashboardEvents, setDashboardEvents] = useState<{ id: string, title: string, date: string }[]>([]);

  useEffect(() => {
    const yArray = workspaceService.workspace.rootYDoc.getArray('custom_dashboard_events');
    const update = () => {
      const arr = yArray.toArray();
      const parsed = arr.map(str => {
        try { return JSON.parse(str as string); } catch { return null; }
      }).filter(Boolean);
      setDashboardEvents(parsed);
    };
    update();
    yArray.observe(update);
    return () => yArray.unobserve(update);
  }, [workspaceService]);

  const [smartBrief, setSmartBrief] = useState(() => localStorage.getItem(`lexior_brief_${workspaceService.workspace.id}`) || "");
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);

  const extractTimelineEvents = async () => {
    if (isExtractingTimeline) return;
    setIsExtractingTimeline(true);
    setExtractionProgress(0);

    const targetDocs = docs.filter(d => !d.trash$.value && (!timelineEventsMap || !timelineEventsMap.has(d.id) || !timelineEventsMap.get(d.id) || timelineEventsMap.get(d.id) === '[]' || !docSummaryMap || !docSummaryMap.has(d.id)));

    try {
      for (let i = 0; i < targetDocs.length; i++) {
        const docRecord = targetDocs[i];
        setExtractionProgress(Math.round(((i) / targetDocs.length) * 100));

        const page = workspaceService.workspace.docCollection.getDoc(docRecord.id)?.getStore();
        if (!page) continue;
        await page.load();
        const blocks = Object.values(page.blocks.value);
        const textContent = blocks.map((b: any) => b.text?.toString() || b.model?.text?.toString() || '').join('\n').trim();

        if (textContent.length > 50) {
          const prompt = `Agis comme un juriste expert. Analyse ce document. Ton but est double :
1. Fais un résumé d'une seule phrase courte (maximum 15 mots) du contenu de ce document.
2. Extraire TOUTES les dates clés pour constituer la chronologie (timeline) du litige ou du dossier. Concentre-toi sur l'ESSENTIEL : Faits générateurs, actes de procédure, audiences et échéances futures.

Retourne le résultat STRICTEMENT en format JSON valide, sous forme d'un objet avec les clés :
- 'summary' (chaîne de caractères: résumé court du document)
- 'events' (tableau d'objets avec les clés 'date' format YYYY-MM-DD, 'title' description concise, et 'category' parmi "Faits", "Procédure", "Audience", "Échéance").

Ne retourne aucun autre texte que l'objet JSON.
Texte à analyser : ${textContent.substring(0, 4000)}`;

          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'LexiorGPT-mini-128k-ccq:latest',
              prompt: prompt,
              stream: false,
              format: 'json'
            })
          });
          const data = await response.json();
          const jsonResponse = data.response?.trim() || '{}';
          
          try {
             const parsed = JSON.parse(jsonResponse);
             let eventsArr = [];
             let summaryStr = "";

             if (Array.isArray(parsed)) {
               eventsArr = parsed;
             } else if (parsed && typeof parsed === 'object') {
               eventsArr = Array.isArray(parsed.events) ? parsed.events : [];
               summaryStr = typeof parsed.summary === 'string' ? parsed.summary : "";
             }

             if (eventsArr && eventsArr.length > 0) {
               docRecord.setCustomProperty('custom:events_timeline', JSON.stringify(eventsArr));
             } else {
               docRecord.setCustomProperty('custom:events_timeline', '[]');
             }

             if (summaryStr) {
               docRecord.setCustomProperty('custom:doc_summary', summaryStr);
             }
          } catch (e) {
             console.error("Failed to parse LLM timeline response", jsonResponse);
             docRecord.setCustomProperty('custom:events_timeline', '[]');
          }
        } else {
           docRecord.setCustomProperty('custom:events_timeline', '[]');
           docRecord.setCustomProperty('custom:doc_summary', 'Document trop court pour être résumé.');
        }
      }
      setExtractionProgress(100);
    } catch (e: any) {
      console.error("Timeline Extraction Error:", e);
      alert("Erreur lors de l'extraction de la chronologie : " + (e.message || String(e)));
    } finally {
      setIsExtractingTimeline(false);
      setTimeout(() => setExtractionProgress(0), 2000);
    }
  };

  const { timeline, pastEvents, futureEvents, allEvents, mixedEvents, urgences, piecesMaitresses, aiBrief, prochainEvenement, futureEventsList } = useMemo(() => {
    const recentDocs: { doc: DocRecord; matchedTags: string[]; updatedDate: number; title: string; isJournal: boolean }[] = [];
    const urgencesList: { doc: DocRecord; title: string }[] = [];
    const piecesList: { doc: DocRecord; title: string }[] = [];
    
    const parsedTimelineEvents: { date: Date; title: string; category: string; docId: string; docTitle: string }[] = [];
    const futureEventsList: { date: Date; title: string; diffDays: number; docId: string; isDoc: boolean }[] = [];

    let closestEvent: { date: Date; title: string; diffDays: number } | null = null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Only use explicit 'custom:date_audience' properties for upcoming events

    docs.forEach(doc => {
      const isTrash = doc.trash$.value;
      if (isTrash) return;
      
      const meta = doc.meta$.value;
      const docTags = meta?.tags || [];
      const title = meta?.title || 'Sans titre';
      const updatedDate = meta?.updatedDate || 0;
      const matched: string[] = [];

      let isUrgent = false;
      let isPiece = false; // Désormais, on se base strictement sur les tags pour plus de précision
      
      docTags.forEach(tagId => {
        const tagObj = tagMetas.find(t => t.id === tagId);
        if (!tagObj) return;
        const name = tagObj.name.toLowerCase();
        matched.push(tagObj.name);
        if (name.includes('urgent') || name.includes('à faire')) isUrgent = true;
        if (name.includes('pièce') || name.includes('piece') || name.includes('conclusion') || name.includes('assignation')) isPiece = true;
      });

      // Fallback intelligent : si pas de tag mais que le titre est explicite, on le considère quand même comme pièce pour aider l'utilisateur
      if (!isPiece && (title.toLowerCase().includes('conclusions') || title.toLowerCase().includes('assignation'))) {
        isPiece = true;
      }

      // Option 3 : Propriété "custom:date_audience"
      if (evenementsMap && evenementsMap.has(doc.id)) {
        const dateVal = evenementsMap.get(doc.id);
        if (dateVal) {
          const dateObj = new Date(dateVal);
          if (!isNaN(dateObj.getTime()) && dateObj >= today) {
            const diffTime = dateObj.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            futureEventsList.push({
              date: dateObj,
              title: title,
              diffDays,
              docId: doc.id,
              isDoc: true
            });
            
            if (!closestEvent || diffDays < closestEvent.diffDays) {
              closestEvent = {
                date: dateObj,
                title: title,
                diffDays
              };
            }
          }
        }
      }

      if (timelineEventsMap && timelineEventsMap.has(doc.id)) {
        const eventsJsonStr = timelineEventsMap.get(doc.id);
        if (eventsJsonStr) {
          try {
            const eventsArr = JSON.parse(eventsJsonStr);
            if (Array.isArray(eventsArr)) {
              eventsArr.forEach((ev: any) => {
                if (ev.date && ev.title) {
                  const evDate = new Date(ev.date);
                  if (!isNaN(evDate.getTime())) {
                    parsedTimelineEvents.push({
                      date: evDate,
                      title: ev.title,
                      category: ev.category || 'Événement',
                      docId: doc.id,
                      docTitle: title
                    });
                  }
                }
              });
            }
          } catch (e) {
            console.error("Invalid events JSON in doc", doc.id, e);
          }
        }
      }

      const isJournal = !!journalService.journalDate$(doc.id).value || !!title.match(/^\d{4}-\d{2}-\d{2}$/);
      recentDocs.push({ doc, matchedTags: matched, updatedDate, title, isJournal });

      if (isUrgent) urgencesList.push({ doc, title });
      if (isPiece) piecesList.push({ doc, title });
    });

    dashboardEvents.forEach(ev => {
      const dateObj = new Date(ev.date);
      if (!isNaN(dateObj.getTime()) && dateObj >= today) {
        const diffTime = dateObj.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        futureEventsList.push({
          date: dateObj,
          title: ev.title,
          diffDays,
          docId: ev.id,
          isDoc: false
        });
        
        if (!closestEvent || diffDays < closestEvent.diffDays) {
          closestEvent = {
            date: dateObj,
            title: ev.title,
            diffDays
          };
        }
      }
    });

    recentDocs.sort((a, b) => b.updatedDate - a.updatedDate);
    
    // Génération dynamique d'un résumé intelligent (AI Brief) basé sur l'état du dossier
    let aiBriefText = "Maître, le dossier est actuellement vide. N'hésitez pas à importer des pièces pour que je puisse en faire l'analyse.";
    if (recentDocs.length > 0) {
      const docsCount = recentDocs.length;
      let phase = "Le dossier est en cours de constitution";
      if (piecesList.length > 0) phase = "Nous sommes en phase active avec des pièces maîtresses identifiées";
      if (closestEvent) phase = "Attention, nous sommes en préparation d'échéance imminente";

      const urgenceText = urgencesList.length > 0 
        ? `Je vous signale ${urgencesList.length} action(s) urgente(s) nécessitant votre attention.` 
        : `Le dossier est sain, aucune urgence n'est signalée.`;

      const eventText = closestEvent 
        ? `Veuillez noter que la prochaine échéance (${closestEvent.title}) est prévue dans ${closestEvent.diffDays} jour(s).` 
        : `Il n'y a pour le moment aucune échéance procédurale à venir dans le calendrier.`;

      const recentNames = recentDocs.slice(0, 2).map(d => `"${d.title}"`).join(' et ');
      aiBriefText = `Maître, j'ai analysé les ${docsCount} documents de ce dossier. ${phase}. ${urgenceText} ${eventText} Vos travaux les plus récents ont principalement porté sur : ${recentNames}.`;
    }

    const allEventsSorted = parsedTimelineEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
    const pastEvents = allEventsSorted.filter(e => e.date < today);
    const futureEvents = allEventsSorted.filter(e => e.date >= today);

    let allEvents = [
      ...futureEvents.map(e => ({ ...e, type: 'future' })),
      ...pastEvents.map(e => ({ ...e, type: 'past' }))
    ];

    let mixedEvents = [
      ...allEvents,
      ...recentDocs.slice(0, 8).map(doc => ({
        date: new Date(doc.updatedDate),
        title: doc.isJournal ? "Notes du jour" : "Activité sur le document",
        category: doc.isJournal ? "Journal" : "Mise à jour",
        docId: doc.doc.id,
        docTitle: doc.title,
        type: 'activity',
        isJournal: doc.isJournal,
        docSummary: docSummaryMap?.has(doc.doc.id) ? docSummaryMap.get(doc.doc.id) : "⏳ Cliquez sur 'Actualiser' pour analyser."
      }))
    ];
    // Sort mixedEvents DESCENDING (Newest at the top, including Future)
    mixedEvents.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
      timeline: recentDocs.slice(0, 6),
      pastEvents,
      futureEvents,
      allEvents,
      mixedEvents,
      urgences: urgencesList.slice(0, 5),
      piecesMaitresses: piecesList.slice(0, 5),
      aiBrief: aiBriefText,
      prochainEvenement: closestEvent,
      futureEventsList
    };
  }, [docs, tagMetas, allJournalDates, evenementsMap, timelineEventsMap, docSummaryMap, dashboardEvents]);

  const generateSmartBrief = async () => {
    if (isGeneratingBrief) return;
    setIsGeneratingBrief(true);
    
    try {
      const urgenciesText = urgences.map(u => `"${u.title}"`).join(", ") || "Aucune";
      const piecesText = piecesMaitresses.map(p => `"${p.title}"`).join(", ") || "Aucune";
      const eventsText = futureEventsList.map(e => `"${e.title}" le ${e.date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`).join(", ") || "Aucune";
      
      let docsContext = "";
      timeline.slice(0, 10).forEach(d => {
        const summary = docSummaryMap?.get(d.doc.id) || "Pas de résumé.";
        docsContext += `- Document "${d.title}" : ${summary}\n`;
      });

      const prompt = `[INST] Tu es l'assistant juridique de Maître, un avocat québécois. 
Rédige un briefing stratégique ULTRA CONCIS (3 phrases maximum) sur ce dossier.
Concentre-toi UNIQUEMENT sur l'analyse de la situation actuelle et la prochaine action à prendre.

CONTEXTE DU DOSSIER :
- Échéances procédurales : ${eventsText}
- Urgences à traiter : ${urgenciesText}
- Pièces maîtresses : ${piecesText}

RÉCENTS DÉVELOPPEMENTS :
${docsContext}

CONTRAINTES STRICTES :
1. Commence ta réponse OBLIGATOIREMENT par "Maître, ".
2. Interdiction absolue d'ajouter des formules de politesse du type "Voici le résumé" ou "N'hésitez pas".
3. Sois direct, factuel et opérationnel.
[/INST]`;

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'LexiorGPT-mini-128k-ccq:latest',
          prompt: prompt,
          stream: false
        })
      });

      if (!response.ok) throw new Error("Erreur réseau");
      const data = await response.json();
      const generatedText = data.response?.trim();
      
      if (generatedText) {
        setSmartBrief(generatedText);
        localStorage.setItem(`lexior_brief_${workspaceService.workspace.id}`, generatedText);
      }
    } catch (e: any) {
      console.error("Smart Brief Error:", e);
      alert("Erreur lors de la génération du résumé : " + (e.message || String(e)));
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const handleEditEventClick = (ev: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setNewEventTitle(ev.title);
    setNewEventDate(ev.date.toISOString().split('T')[0]); // yyyy-mm-dd
    setEditingEventId(ev.docId);
  };

  const handleDeleteEventClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const yArray = workspaceService.workspace.rootYDoc.getArray('custom_dashboard_events');
      const arr = yArray.toArray();
      const index = arr.findIndex(str => {
        try { return JSON.parse(str as string).id === id; } catch { return false; }
      });
      if (index !== -1) {
        workspaceService.workspace.rootYDoc.transact(() => {
          yArray.delete(index, 1);
        });
      }
      if (editingEventId === id) {
        setEditingEventId(null);
        setNewEventTitle("");
        setNewEventDate("");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateEvent = async () => {
    if (!newEventTitle || !newEventDate) return;
    try {
      const yArray = workspaceService.workspace.rootYDoc.getArray('custom_dashboard_events');
      workspaceService.workspace.rootYDoc.transact(() => {
        if (editingEventId) {
          const arr = yArray.toArray();
          const index = arr.findIndex(str => {
            try { return JSON.parse(str as string).id === editingEventId; } catch { return false; }
          });
          if (index !== -1) {
            yArray.delete(index, 1);
          }
        }
        yArray.push([JSON.stringify({ id: editingEventId || Date.now().toString(), title: newEventTitle, date: newEventDate })]);
      });
      setNewEventTitle("");
      setNewEventDate("");
      setEditingEventId(null);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <style>{`
        [data-testid="cabinet-view-body"] {
          background-color: #fdfbf7 !important;
        }
      `}</style>
      <ViewTitle title="Dossier Client" />
      <ViewHeader>
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', backgroundColor: '#fdfbf7' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.5px', fontFamily: "'Playfair Display', Georgia, serif" }}>Dossier Client</div>
            <div style={{ fontSize: 14, color: 'var(--affine-text-secondary-color)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--affine-primary-color)' }}></span>
              Phase : Mise en état
            </div>
          </div>
          <Button 
            size="large" 
            onClick={async () => {
              if (typeof window.exportWorkspaceSnapshot === 'function') {
                await window.exportWorkspaceSnapshot();
              } else {
                alert('La fonction d\'exportation n\'est pas disponible pour le moment.');
              }
            }}
            style={{ backgroundColor: '#c49b3b', color: '#fff', borderColor: '#c49b3b' }}
          >
            💾 Exporter en Modèle
          </Button>
        </div>
      </ViewHeader>
      <ViewBody data-testid="cabinet-view-body">
        <style>{`
          .dashboard-grid {
            display: grid;
            grid-template-columns: 1fr 350px;
            gap: 24px;
            padding: 24px;
            width: 100%;
            box-sizing: border-box;
          }
          .premium-card {
            background: #ffffff;
            border: 1px solid var(--affine-border-color);
            border-radius: 16px;
            padding: 24px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
          }
          .ai-brief-card {
            background: linear-gradient(145deg, #ffffff, #fdfbf7);
            border-left: 4px solid #c49b3b;
            position: relative;
            overflow: hidden;
          }
          .ai-brief-card::after {
            content: '';
            position: absolute;
            top: 0; right: 0;
            width: 150px; height: 150px;
            background: radial-gradient(circle, rgba(139,92,246,0.1) 0%, rgba(255,255,255,0) 70%);
          }
          .timeline-container {
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-top: 16px;
          }
          .mui-timeline {
            display: flex;
            flex-direction: column;
            padding: 16px 0;
            margin: 0;
            position: relative;
          }
          .mui-timeline-item {
            display: flex;
            position: relative;
            min-height: 80px;
          }
          .mui-timeline-item.right {
            flex-direction: row-reverse;
          }
          
          .mui-timeline-opposite {
            flex: 1;
            padding: 6px 16px;
            text-align: right;
            color: var(--affine-text-secondary-color);
            font-size: 13px;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
          }
          .mui-timeline-item.right .mui-timeline-opposite {
            text-align: left;
          }
          
          .mui-timeline-separator {
            display: flex;
            flex-direction: column;
            align-items: center;
            flex: 0;
          }
          
          .mui-timeline-dot {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: var(--affine-background-secondary-color);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 1;
            font-size: 14px;
          }
          .mui-timeline-dot.future {
            background: #10b981;
            color: white;
            box-shadow: 0 0 0 4px rgba(16,185,129,0.1);
          }
          .mui-timeline-dot.past {
            background: #9ca3af;
            color: white;
          }
          
          .mui-timeline-connector {
            width: 2px;
            flex-grow: 1;
            background-color: var(--affine-border-color);
            margin-top: 4px;
            margin-bottom: 4px;
          }
          .mui-timeline-item:last-child .mui-timeline-connector {
            display: none;
          }
          
          .mui-timeline-content {
            flex: 1;
            padding: 6px 16px;
            text-align: left;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
          }
          .mui-timeline-item.right .mui-timeline-content {
            text-align: right;
          }
          
          .mui-timeline-content strong {
            display: block;
            font-size: 15px;
            margin-bottom: 4px;
            color: var(--affine-text-primary-color);
          }
          .mui-timeline-content p {
            margin: 0;
            font-size: 12px;
            color: var(--affine-text-secondary-color);
          }
          .timeline-item-hover-wrap {
            border-radius: 8px;
            transition: background 0.2s;
          }
          .timeline-item-hover-wrap:hover {
            background: var(--affine-hover-color);
          }
          .pillar-card {
            background: var(--affine-background-primary-color);
            border-radius: 12px;
            border: 1px solid var(--affine-border-color);
            padding: 16px;
          }
          .pillar-header {
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-weight: 700;
            margin-bottom: 12px;
            color: var(--affine-text-secondary-color);
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .doc-link {
            font-size: 14px;
            color: var(--affine-text-primary-color);
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: space-between;
            transition: background 0.2s;
          }
          .doc-link:hover {
            background: var(--affine-hover-color);
            color: var(--affine-primary-color);
          }
        `}</style>
        
        <div style={{ width: '100%', height: '100%', overflowY: 'auto', paddingBottom: '40px', boxSizing: 'border-box', backgroundColor: '#fdfbf7' }}>
          <div className="dashboard-grid">
          {/* Colonne Principale */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* AI Briefing */}
            <div className="premium-card ai-brief-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c49b3b', fontWeight: 700, fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px' }}>
                  <AiIcon /> Intelligence Lexior
                </div>
                <Button onClick={generateSmartBrief} disabled={isGeneratingBrief} style={{ borderColor: '#c49b3b', color: '#c49b3b', background: 'rgba(196,155,59,0.1)', cursor: isGeneratingBrief ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AiIcon /> {isGeneratingBrief ? "Analyse en cours..." : "Générer un Brief IA"}
                </Button>
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--affine-text-primary-color)' }}>
                {smartBrief || aiBrief}
              </p>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 600 }}>
                  Santé : Excellente
                </span>
                <span style={{ fontSize: 12, color: 'var(--affine-text-secondary-color)' }}>Mise à jour à l'instant</span>
              </div>
            </div>

            {/* Ligne de Vie (Timeline) - MUI Alternating Style */}
            <div className="premium-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Playfair Display', Georgia, serif" }}>
                  ⏳ Chronologie Intelligente (IA)
                </h3>
                <Button onClick={extractTimelineEvents} disabled={isExtractingTimeline} style={{ borderColor: '#c49b3b', color: '#c49b3b', background: 'rgba(196,155,59,0.1)', cursor: isExtractingTimeline ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AiIcon /> {isExtractingTimeline ? `Analyse... ${extractionProgress}%` : "Actualiser"}
                </Button>
              </div>

              {mixedEvents.length === 0 ? (
                 <div style={{ padding: 40, textAlign: 'center', color: 'var(--affine-text-secondary-color)', background: 'var(--affine-background-secondary-color)', borderRadius: 12 }}>
                   Aucun événement chronologique extrait. Cliquez sur "Actualiser" pour que l'IA extraie les faits et la procédure du dossier.
                 </div>
              ) : (
                <div className="mui-timeline" style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '8px' }}>
                  {mixedEvents.map((item, index) => {
                    const isRight = index % 2 !== 0;
                    
                    let dotColorClass = 'past';
                    let dotIcon = '📄'; // Facts or Procedure
                    if (item.type === 'future') {
                      dotColorClass = 'future';
                      dotIcon = '🎯'; // Upcoming deadline
                    } else if (item.type === 'activity') {
                      dotIcon = item.isJournal ? '📅' : '📝';
                    } else if (item.category?.toLowerCase().includes('procédure') || item.category?.toLowerCase().includes('procedure')) {
                      dotIcon = '⚖️';
                    } else if (item.category?.toLowerCase().includes('fait')) {
                      dotIcon = '📌';
                    }

                    return (
                      <div className={`mui-timeline-item ${isRight ? 'right' : ''} timeline-item-hover-wrap`} key={index} onClick={() => workbench.openDoc(item.docId)} style={{cursor: 'pointer', padding: '8px 0'}}>
                        <div className="mui-timeline-opposite">
                          <div style={{ fontWeight: 600 }}>{item.date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                          <div style={{ color: item.type === 'future' ? '#10b981' : 'var(--affine-text-secondary-color)', fontSize: 11, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {item.category}
                          </div>
                        </div>
                        <div className="mui-timeline-separator">
                          <div className={`mui-timeline-dot ${dotColorClass}`}>
                             {dotIcon}
                          </div>
                          <div className="mui-timeline-connector"></div>
                        </div>
                        <div className="mui-timeline-content">
                          <strong>{item.title}</strong>
                          <p>{item.type === 'activity' ? (item.isJournal ? `Journal du ${item.docTitle}` : `Document: ${item.docTitle}`) : `Source: ${item.docTitle}`}</p>
                          {item.docSummary && <p style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--affine-text-secondary-color)', fontSize: 13, lineHeight: 1.4 }}>"{item.docSummary}"</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          {/* Colonne Latérale : Les Trois Piliers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Pilier 1 : Urgences */}
            <div className="pillar-card" style={{ borderColor: 'rgba(114, 47, 55, 0.2)', backgroundColor: 'rgba(114, 47, 55, 0.02)' }}>
              <div className="pillar-header" style={{ color: '#722f37', fontFamily: "'Playfair Display', Georgia, serif" }}>
                <span style={{ fontSize: 16 }}>📌</span> À Faire (Urgences)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {urgences.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--affine-text-secondary-color)', padding: 8 }}>Aucune urgence.</div>
                ) : (
                  urgences.map(u => (
                    <div className="doc-link" key={u.doc.id} onClick={() => workbench.openDoc(u.doc.id)}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.title}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pilier 2 : Pièces Maîtresses */}
            <div className="pillar-card" style={{ borderColor: 'rgba(26, 35, 126, 0.2)', backgroundColor: 'rgba(26, 35, 126, 0.02)' }}>
              <div className="pillar-header" style={{ color: '#1a237e', fontFamily: "'Playfair Display', Georgia, serif" }}>
                <span style={{ fontSize: 16 }}>⚖️</span> Pièces Maîtresses
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {piecesMaitresses.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--affine-text-secondary-color)', padding: 8 }}>Aucune pièce maîtresse identifiée.</div>
                ) : (
                  piecesMaitresses.map(p => (
                    <div className="doc-link" key={p.doc.id} onClick={() => workbench.openDoc(p.doc.id)}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pilier 3 : Événements Prochains */}
            <div className="pillar-card" style={{ borderColor: 'rgba(196, 155, 59, 0.2)', backgroundColor: 'rgba(196, 155, 59, 0.02)' }}>
              <div className="pillar-header" style={{ color: '#c49b3b', fontFamily: "'Playfair Display', Georgia, serif" }}>
                <span style={{ fontSize: 16 }}>📅</span> Événements Prochains
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {futureEventsList.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--affine-text-secondary-color)', padding: '8px 0' }}>Aucune audience planifiée</div>
                ) : (
                  futureEventsList.sort((a, b) => a.date.getTime() - b.date.getTime()).map(ev => (
                    <div className="doc-link" key={ev.docId} onClick={() => ev.isDoc ? workbench.openDoc(ev.docId) : undefined} style={{ cursor: ev.isDoc ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{ev.title}</span>
                        <span style={{ fontSize: 12, color: 'var(--affine-text-secondary-color)' }}>
                          {ev.date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} ({ev.diffDays === 0 ? "Aujourd'hui" : `J-${ev.diffDays}`})
                        </span>
                      </div>
                      {!ev.isDoc && (
                        <div style={{ display: 'flex', gap: 8, opacity: 0.7 }}>
                          <span onClick={(e) => handleEditEventClick(ev, e)} style={{ cursor: 'pointer', fontSize: 14 }} title="Modifier">✏️</span>
                          <span onClick={(e) => handleDeleteEventClick(ev.docId, e)} style={{ cursor: 'pointer', fontSize: 14 }} title="Supprimer">🗑️</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div style={{ padding: '12px', background: 'white', borderRadius: 8, border: '1px solid var(--affine-border-color)' }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--affine-text-secondary-color)' }}>{editingEventId ? "Modifier l'événement" : "Saisie Rapide d'Événement"}</div>
                <input type="text" placeholder="Titre (ex: Audience)" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} style={{ width: '100%', padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '1px solid #e5e7eb', marginBottom: 6 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)} style={{ flex: 1, padding: '6px 8px', fontSize: 13, borderRadius: 4, border: '1px solid #e5e7eb' }} />
                  <Button onClick={handleCreateEvent} style={{ padding: '0 12px', background: '#c49b3b', color: 'white', border: 'none', cursor: 'pointer' }}>{editingEventId ? '✓' : '+'}</Button>
                  {editingEventId && <Button onClick={() => { setEditingEventId(null); setNewEventTitle(""); setNewEventDate(""); }} style={{ padding: '0 12px', background: '#e5e7eb', color: '#6b7280', border: 'none', cursor: 'pointer' }}>✕</Button>}
                </div>
              </div>

              <Button style={{ width: '100%', marginTop: 12, backgroundColor: '#fdfbf7', color: '#c49b3b', border: '1px solid #c49b3b', display: 'flex', justifyContent: 'center', cursor: 'pointer' }} onClick={() => {
                viewService.view.activeSidebarTab('cabinet-journal');
                workbench.openSidebar();
              }}>
                Ouvrir l'Agenda
              </Button>
            </div>

          </div>
        </div>

        {/* Timeline removed from full width layout */}
        </div>
      </ViewBody>
      <ViewSidebarTab tabId="cabinet-journal" icon={<TodayIcon />}>
        <div style={{ height: '100%', overflowY: 'auto' }}>
          <EditorJournalPanel />
        </div>
      </ViewSidebarTab>
    </>
  );
};

export const Component = () => {
  return <CabinetPage />;
};
export default Component;

