import {
  DatePicker,
  Menu,
  type MenuRef,
  PropertyValue,
} from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { i18nTime, useI18n } from '@affine/i18n';
import { DateTimeIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { DocListPropertyProps, GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import { FilterOptionsGroup } from '../filter/options';
import type { PropertyValueProps } from '../properties/types';
import * as styles from './date.css';

const useParsedDate = (value: string) => {
  const parsedValue =
    typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)
      ? value
      : undefined;
  const displayValue = parsedValue
    ? i18nTime(parsedValue, { absolute: { accuracy: 'day' } })
    : undefined;
  const t = useI18n();
  return {
    parsedValue,
    displayValue:
      displayValue ??
      t['com.affine.page-properties.property-value-placeholder'](),
  };
};

import { DocService } from '@affine/core/modules/doc';
import { toast, IconButton } from '@affine/component';
import { AiIcon } from '@blocksuite/icons/rc';
import { useAppSettingHelper } from '../hooks/affine/use-app-setting-helper';
import { useServiceOptional } from '@toeverything/infra';

export const DateValue = ({
  propertyInfo,
  value,
  onChange,
  readonly,
}: PropertyValueProps & { propertyInfo?: any }) => {
  const { parsedValue, displayValue } = useParsedDate(value);
  const { appSettings } = useAppSettingHelper();
  const docService = useServiceOptional(DocService);
  const [isExtracting, setIsExtracting] = useState(false);

  const extractDate = useCallback(async () => {
    if (isExtracting) return;
    const page = docService?.doc.blockSuiteDoc;
    if (!page) return;

    setIsExtracting(true);
    toast("Recherche de la date d'audience par l'IA...", { duration: 3000 });

    try {
      const blocks = Object.values(page.blocks.value);
      const textContent = blocks.map((b: any) => b.text?.toString() || b.model?.text?.toString() || '').join('\n').trim();

      if (!textContent) {
        toast("Document vide, aucune date trouvée.");
        setIsExtracting(false);
        return;
      }

      const prompt = `Voici le texte d'un document juridique. Cherche la date de l'audience ou de la comparution mentionnée. Si tu la trouves, retourne-la UNIQUEMENT sous le format AAAA-MM-JJ. Si aucune date d'audience n'est présente, ne retourne rien. Texte: ${textContent.substring(0, 4000)}`;

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
      let extractedDate = data.response?.trim() || '';

      if (extractedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        onChange(extractedDate);
        toast(`✓ Date extraite par l'IA : ${extractedDate}`);
      } else {
        toast("Aucune date d'audience trouvée.");
      }
    } catch (e) {
      console.error(e);
      toast("Erreur lors de l'extraction par l'IA.");
    } finally {
      setIsExtracting(false);
    }
  }, [docService, isExtracting, onChange]);

  useEffect(() => {
    if (propertyInfo?.id === 'custom:date_audience' && !value && (appSettings as any).autoExtractAudienceDate && !readonly) {
      extractDate();
    }
  }, [propertyInfo?.id, value, (appSettings as any).autoExtractAudienceDate, readonly, extractDate]);

  if (readonly) {
    return (
      <PropertyValue
        className={parsedValue ? '' : styles.empty}
        isEmpty={!parsedValue}
        readonly
      >
        {displayValue}
      </PropertyValue>
    );
  }

  const isAudienceDate = propertyInfo?.id === 'custom:date_audience';

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 4 }}>
      <Menu
        contentOptions={{
          style: BUILD_CONFIG.isMobileEdition ? { padding: '15px 20px' } : {},
        }}
        items={<DatePicker value={parsedValue} onChange={onChange} />}
      >
        <PropertyValue
          className={parsedValue ? '' : styles.empty}
          isEmpty={!parsedValue}
        >
          {displayValue}
        </PropertyValue>
      </Menu>
      
      {isAudienceDate && (
        <IconButton 
          size={20} 
          onClick={extractDate} 
          disabled={isExtracting}
          style={{ 
            color: isExtracting ? 'var(--affine-text-disable-color)' : '#8b5cf6',
            opacity: isExtracting ? 0.5 : 1
          }}
          tooltip="Extraire la date d'audience via l'IA"
        >
          <AiIcon />
        </IconButton>
      )}
    </div>
  );
};

const DateSelectorMenu = ({
  ref,
  value,
  onChange,
  onClose,
}: {
  ref?: React.Ref<MenuRef>;
  value?: string;
  onChange: (value: string) => void;
  onClose?: () => void;
}) => {
  const t = useI18n();
  const [open, setOpen] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      changeOpen: (open: boolean) => {
        setOpen(open);
        if (!open) {
          onClose?.();
        }
      },
    }),
    [onClose]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (!open) {
        onClose?.();
      }
    },
    [onClose]
  );

  const handleChange = useCallback(
    (value: string) => {
      onChange(value);
      setOpen(false);
      onClose?.();
    },
    [onChange, onClose]
  );

  return (
    <FilterValueMenu
      rootOptions={{
        open,
        onOpenChange: handleOpenChange,
      }}
      contentOptions={{
        style: { padding: '12px 16px' },
      }}
      items={<DatePicker value={value || undefined} onChange={handleChange} />}
    >
      {value ? (
        <span>{value}</span>
      ) : (
        <span style={{ color: cssVarV2('text/placeholder') }}>
          {t['com.affine.filter.empty']()}
        </span>
      )}
    </FilterValueMenu>
  );
};

const DateFilterValueAfterBefore = ({
  filter,
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange?: (filter: FilterParams) => void;
}) => {
  const menuRef = useRef<MenuRef>(null);
  const value = filter.value;
  const values = value?.split(',') ?? [];

  const handleChange = useCallback(
    (date: string) => {
      onChange?.({
        ...filter,
        value: date,
      });
    },
    [onChange, filter]
  );

  useEffect(() => {
    if (isDraft) {
      menuRef.current?.changeOpen(true);
    }
  }, [isDraft]);

  return (
    <DateSelectorMenu
      ref={menuRef}
      value={values[0]}
      onChange={handleChange}
      onClose={onDraftCompleted}
    />
  );
};

export const DateFilterValue = ({
  filter,
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange?: (filter: FilterParams) => void;
}) => {
  const value = filter.value;
  const values = value?.split(',') ?? [];

  const handleChange = useCallback(
    (date: string) => {
      onChange?.({
        ...filter,
        value: date,
      });
    },
    [onChange, filter]
  );

  useEffect(() => {
    if (
      isDraft &&
      filter.method !== 'after' &&
      filter.method !== 'before' &&
      filter.method !== 'between'
    ) {
      onDraftCompleted?.();
    }
  }, [isDraft, filter.method, onDraftCompleted]);

  return filter.method === 'after' || filter.method === 'before' ? (
    <DateFilterValueAfterBefore
      filter={filter}
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      onChange={onChange}
    />
  ) : filter.method === 'between' ? (
    <FilterOptionsGroup
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      items={[
        ({ onDraftCompleted, menuRef }) => (
          <DateSelectorMenu
            ref={menuRef}
            value={values[0]}
            onChange={value => handleChange(`${value},${values[1] || ''}`)}
            onClose={onDraftCompleted}
          />
        ),
        <span key="between" style={{ color: cssVarV2('text/placeholder') }}>
          &nbsp;-&nbsp;
        </span>,
        ({ onDraftCompleted, menuRef }) => (
          <DateSelectorMenu
            ref={menuRef}
            value={values[1]}
            onChange={value => handleChange(`${values[0] || ''},${value}`)}
            onClose={onDraftCompleted}
          />
        ),
      ]}
    ></FilterOptionsGroup>
  ) : undefined;
};

export const DateDocListProperty = ({ value }: DocListPropertyProps) => {
  if (!value) return null;

  return (
    <StackProperty icon={<DateTimeIcon />}>
      {i18nTime(value, { absolute: { accuracy: 'day' } })}
    </StackProperty>
  );
};

export const DateGroupHeader = ({ groupId, docCount }: GroupHeaderProps) => {
  const date = groupId || 'No Date';

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {date}
    </PlainTextDocGroupHeader>
  );
};
