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
  FilterIcon
} from '@blocksuite/icons/rc';
import React from 'react';

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

export const EditorStudioPanel = ({ editor }: EditorStudioPanelProps) => {
  const handleAction = (actionName: string) => {
    // Action scaffolding
    console.log(`Action Studio déclenchée : ${actionName}`);
    // Here we can trigger the AI chat panel with predefined workspace-wide prompts
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>Studio</div>
      
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

    </div>
  );
};
