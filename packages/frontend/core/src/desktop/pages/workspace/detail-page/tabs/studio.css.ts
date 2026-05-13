import { style } from '@vanilla-extract/css';
import { cssVar } from '@toeverything/theme';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  padding: '16px',
  boxSizing: 'border-box',
  overflowY: 'auto',
  gap: '24px',
});

export const header = style({
  fontSize: '20px',
  fontWeight: '600',
  color: cssVar('textColor'),
});

export const section = style({
  display: 'flex',
  flexDirection: 'column',
});

export const sectionTitle = style({
  fontSize: '12px',
  fontWeight: '600',
  color: cssVar('textSecondaryColor'),
  marginBottom: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
});

export const grid = style({
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '12px',
});

export const card = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  padding: '12px',
  borderRadius: '12px',
  minHeight: '80px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  position: 'relative',
  border: '1px solid rgba(0,0,0,0.05)',
  ':hover': {
    filter: 'brightness(0.95)',
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
  },
  ':active': {
    transform: 'translateY(0)',
  }
});

export const cardHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  width: '100%',
});

export const iconWrapper = style({
  fontSize: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const arrowIcon = style({
  fontSize: '16px',
  opacity: 0.5,
});

export const cardTitle = style({
  fontSize: '13px',
  fontWeight: '500',
  marginTop: '12px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const betaBadge = style({
  backgroundColor: cssVar('textColor'),
  color: cssVar('appBkg'),
  fontSize: '9px',
  fontWeight: 'bold',
  padding: '2px 6px',
  borderRadius: '4px',
  textTransform: 'uppercase',
  marginLeft: '4px',
});
