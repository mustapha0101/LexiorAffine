import { style } from '@vanilla-extract/css';
import { cssVarV2 } from '@toeverything/theme/v2';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '24px',
  height: '100%',
  overflowY: 'auto',
  backgroundColor: '#FCFCFC',
});

export const header = style({
  fontSize: '24px',
  fontWeight: 600,
  marginBottom: '24px',
  color: cssVarV2('text/primary'),
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const sectionTitle = style({
  fontSize: '14px',
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  marginBottom: '4px',
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '12px',
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: '12px',
  padding: '16px',
  cursor: 'pointer',
  position: 'relative',
  transition: 'transform 0.15s ease-in-out',
  ':hover': {
    transform: 'translateY(-2px)',
  },
});

export const cardHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
});

export const iconWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  backgroundColor: 'rgba(255, 255, 255, 0.4)',
});

export const arrowIcon = style({
  opacity: 0.5,
});

export const cardTitle = style({
  fontSize: '14px',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const betaBadge = style({
  fontSize: '10px',
  fontWeight: 700,
  padding: '2px 6px',
  borderRadius: '4px',
  backgroundColor: 'rgba(0,0,0,0.06)',
});

export const statusPanel = style({
  marginTop: '32px',
  padding: '16px',
  borderRadius: '12px',
  backgroundColor: cssVarV2('layer/background/secondary'),
  border: `1px solid ${cssVarV2('layer/background/border')}`,
  boxSizing: 'border-box',
  width: '100%',
  position: 'relative',
});

export const statusHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  fontSize: '14px',
  fontWeight: 500,
  color: cssVarV2('text/primary'),
});

export const spinner = style({
  animation: 'spin 1s linear infinite',
});

export const summaryContent = style({
  marginTop: '12px',
  paddingTop: '12px',
  borderTop: `1px solid ${cssVarV2('layer/background/border')}`,
  fontSize: '13px',
  color: cssVarV2('text/secondary'),
  whiteSpace: 'pre-wrap',
  lineHeight: 1.5,
});

import { globalKeyframes } from '@vanilla-extract/css';

globalKeyframes('spin', {
  '0%': { transform: 'rotate(0deg)' },
  '100%': { transform: 'rotate(360deg)' },
});

export const pinToggle = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  fontWeight: 500,
  color: cssVarV2('text/secondary'),
  cursor: 'pointer',
  userSelect: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  backgroundColor: 'rgba(0,0,0,0.02)',
  border: `1px solid ${cssVarV2('layer/background/border')}`,
  width: 'fit-content',
  transition: 'all 0.2s',
  marginBottom: '24px',
  ':hover': {
    backgroundColor: 'rgba(0,0,0,0.04)',
    color: cssVarV2('text/primary'),
  }
});

export const pinToggleActive = style({
  backgroundColor: cssVarV2('layer/background/brand'),
  color: cssVarV2('text/emphasis'),
  borderColor: cssVarV2('layer/background/brand'),
  ':hover': {
    backgroundColor: cssVarV2('layer/background/brand'),
    color: cssVarV2('text/emphasis'),
  }
});

export const deleteButton = style({
  marginLeft: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: '6px',
  cursor: 'pointer',
  color: cssVarV2('text/secondary'),
  transition: 'background-color 0.2s',
  flexShrink: 0,
  ':hover': {
    backgroundColor: 'rgba(255,0,0,0.1)',
    color: 'red',
  },
});
