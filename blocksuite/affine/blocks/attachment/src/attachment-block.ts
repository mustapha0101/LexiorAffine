import {
  CaptionedBlockComponent,
  SelectedStyle,
} from '@blocksuite/affine-components/caption';
import {
  getAttachmentFileIcon,
  LoadingIcon,
} from '@blocksuite/affine-components/icons';
import { Peekable } from '@blocksuite/affine-components/peek';
import {
  type ResolvedStateInfo,
  ResourceController,
} from '@blocksuite/affine-components/resource';
import { toast } from '@blocksuite/affine-components/toast';
import {
  type AttachmentBlockModel,
  AttachmentBlockStyles,
} from '@blocksuite/affine-model';
import {
  BlockElementCommentManager,
  CitationProvider,
  DocModeProvider,
  FileSizeLimitProvider,
  IracProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import {
  formatSize,
  openSingleFileWith,
} from '@blocksuite/affine-shared/utils';
import {
  AttachmentIcon,
  ResetIcon,
  UpgradeIcon,
  WarningIcon,
} from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import { nanoid, Slice, Text } from '@blocksuite/store';
import { batch, computed, signal } from '@preact/signals-core';
import { html, type TemplateResult } from 'lit';
import { choose } from 'lit/directives/choose.js';
import { type ClassInfo, classMap } from 'lit/directives/class-map.js';
import { guard } from 'lit/directives/guard.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit/directives/when.js';
import { filter } from 'rxjs/operators';

import { AttachmentEmbedProvider } from './embed';
import { styles } from './styles';
import { downloadAttachmentBlob, getFileType, refreshData } from './utils';

type AttachmentResolvedStateInfo = ResolvedStateInfo & {
  kind?: TemplateResult;
};

@Peekable({
  enableOn: ({ model }: AttachmentBlockComponent) => {
    return model.props.type.endsWith('pdf');
  },
})
export class AttachmentBlockComponent extends CaptionedBlockComponent<AttachmentBlockModel> {
  static override styles = styles;

  private iracStatus: 'idle' | 'processing' | 'failed' | 'finished' = 'idle';

  blockDraggable = true;

  resourceController = new ResourceController(
    computed(() => this.model.props.sourceId$.value)
  );

  get blobUrl() {
    return this.resourceController.blobUrl$.value;
  }

  get filetype() {
    const name = this.model.props.name$.value;
    return name.split('.').pop() ?? '';
  }

  protected containerStyleMap = styleMap({
    position: 'relative',
    width: '100%',
    margin: '18px 0px',
  });

  private get _maxFileSize() {
    return this.std.get(FileSizeLimitProvider).maxFileSize;
  }

  get citationService() {
    return this.std.get(CitationProvider);
  }

  get isCitation() {
    return this.citationService.isCitationModel(this.model);
  }

  get isCommentHighlighted() {
    return (
      this.std
        .getOptional(BlockElementCommentManager)
        ?.isBlockCommentHighlighted(this.model) ?? false
    );
  }

  convertTo = () => {
    return this.std
      .get(AttachmentEmbedProvider)
      .convertTo(this.model, this._maxFileSize);
  };

  copy = () => {
    const slice = Slice.fromModels(this.store, [this.model]);
    this.std.clipboard.copySlice(slice).catch(console.error);
    toast(this.host, 'Copied to clipboard');
  };

  download = () => {
    downloadAttachmentBlob(this);
  };

  embedded = () => {
    return (
      Boolean(this.blobUrl) &&
      this.std
        .get(AttachmentEmbedProvider)
        .embedded(this.model, this._maxFileSize)
    );
  };

  open = () => {
    const blobUrl = this.blobUrl;
    if (!blobUrl) return;
    window.open(blobUrl, '_blank');
  };

  // Refreshes data.
  refreshData = () => {
    refreshData(this).catch(console.error);
  };

  private readonly _refreshKey$ = signal<string | null>(null);

  // Refreshes the embed component.
  reload = () => {
    batch(() => {
      if (this.model.props.embed$.value) {
        this._refreshKey$.value = nanoid();
        return;
      }

      this.refreshData();
    });
  };

  // Replaces the current attachment.
  replace = async () => {
    const state = this.resourceController.state$.peek();
    if (state.uploading) return;

    const file = await openSingleFileWith();
    if (!file) return;

    const sourceId = await this.std.store.blobSync.set(file);
    const type = await getFileType(file);
    const { name, size } = file;

    let embed = this.model.props.embed$.value ?? false;

    this.std.store.captureSync();
    this.std.store.transact(() => {
      this.std.store.updateBlock(this.blockId, {
        name,
        size,
        type,
        sourceId,
        embed: false,
      });

      const provider = this.std.get(AttachmentEmbedProvider);
      embed &&= provider.embedded(this.model);

      if (embed) {
        provider.convertTo(this.model);
      }

      // Reloads
      this.reload();
    });
  };

  private _selectBlock() {
    const selectionManager = this.host.selection;
    const blockSelection = selectionManager.create(BlockSelection, {
      blockId: this.blockId,
    });
    selectionManager.setGroup('note', [blockSelection]);
  }

  private readonly _trackCitationDeleteEvent = () => {
    // Check citation delete event
    this._disposables.add(
      this.std.store.slots.blockUpdated
        .pipe(
          filter(payload => {
            if (!payload.isLocal) return false;

            const { flavour, id, type } = payload;
            if (
              type !== 'delete' ||
              flavour !== this.model.flavour ||
              id !== this.model.id
            )
              return false;

            const { model } = payload;
            if (!this.citationService.isCitationModel(model)) return false;

            return true;
          })
        )
        .subscribe(() => {
          this.citationService.trackEvent('Delete');
        })
    );
  };

  override connectedCallback() {
    super.connectedCallback();

    this.contentEditable = 'false';

    this.resourceController.setEngine(this.std.store.blobSync);

    this.disposables.add(this.resourceController.subscribe());
    this.disposables.add(this.resourceController);

    this.disposables.add(
      this.model.props.sourceId$.subscribe(() => {
        this.refreshData();
      })
    );

    if (!this.model.props.style && !this.store.readonly) {
      this.store.withoutTransact(() => {
        const isAudio = this.model.props.type?.startsWith('audio/');
        this.store.updateBlock(this.model, {
          style: AttachmentBlockStyles[1],
          embed: isAudio ? true : false,
        });
      });
    }

    const iracProvider = this.std.getOptional(IracProvider);
    if (iracProvider) {
      iracProvider.mount(this.model);
      this.iracStatus = iracProvider.getJobStatus(this.model.id);
      this.disposables.add(
        iracProvider.onChangeJobStatus(this.model.id, (status) => {
          this.iracStatus = status;
          this.requestUpdate();
        })
      );
      this.disposables.add(() => iracProvider.unmount(this.model));
    }

    this._trackCitationDeleteEvent();
  }

  override firstUpdated() {
    // lazy bindings
    this.disposables.addFromEvent(this, 'click', this.onClick);
  }

  protected onClick(event: MouseEvent) {
    // the peek view need handle shift + click
    if (event.defaultPrevented) return;

    event.stopPropagation();

    if (!this.selected$.peek()) {
      this._selectBlock();
    }
  }

  protected renderUpgradeButton = () => {
    if (this.std.store.readonly) return null;

    const onOverFileSize = this.std.get(FileSizeLimitProvider).onOverFileSize;

    return when(
      onOverFileSize,
      () => html`
        <button
          class="affine-attachment-content-button"
          @click=${(event: MouseEvent) => {
            event.stopPropagation();
            onOverFileSize?.();

            {
              const mode =
                this.std.get(DocModeProvider).getEditorMode() ?? 'page';
              const segment = mode === 'page' ? 'doc' : 'whiteboard';
              this.std
                .getOptional(TelemetryProvider)
                ?.track('AttachmentUpgradedEvent', {
                  segment,
                  page: `${segment} editor`,
                  module: 'attachment',
                  control: 'upgrade',
                  category: 'card',
                  type: this.model.props.name.split('.').pop() ?? '',
                });
            }
          }}
        >
          ${UpgradeIcon()} Upgrade
        </button>
      `
    );
  };

  protected renderNormalButton = (needUpload: boolean) => {
    const label = needUpload ? 'retry' : 'reload';
    const run = async () => {
      if (needUpload) {
        await this.resourceController.upload();
        return;
      }

      this.refreshData();
    };

    return html`
      <button
        class="affine-attachment-content-button"
        @click=${(event: MouseEvent) => {
          event.stopPropagation();
          run().catch(console.error);

          {
            const mode =
              this.std.get(DocModeProvider).getEditorMode() ?? 'page';
            const segment = mode === 'page' ? 'doc' : 'whiteboard';
            this.std
              .getOptional(TelemetryProvider)
              ?.track('AttachmentReloadedEvent', {
                segment,
                page: `${segment} editor`,
                module: 'attachment',
                control: label,
                category: 'card',
                type: this.filetype,
              });
          }
        }}
      >
        ${ResetIcon()} ${label}
      </button>
    `;
  };

  protected renderWithHorizontal(
    classInfo: ClassInfo,
    {
      icon,
      title,
      description,
      kind,
      state,
      needUpload,
    }: AttachmentResolvedStateInfo
  ) {
    return html`
      <div class=${classMap(classInfo)}>
        <div class="affine-attachment-content">
          <div class="affine-attachment-content-title">
            <div class="affine-attachment-content-title-icon">${icon}</div>
            <div class="affine-attachment-content-title-text truncate">
              ${title}
            </div>
          </div>

          <div class="affine-attachment-content-description">
            <div class="affine-attachment-content-info truncate">
              ${description}
            </div>
            ${choose(state, [
              ['error', () => this.renderNormalButton(needUpload)],
              ['error:oversize', this.renderUpgradeButton],
            ])}
          </div>
        </div>

        <div class="affine-attachment-banner">${kind}</div>
      </div>
    `;
  }

  protected renderWithVertical(
    classInfo: ClassInfo,
    {
      icon,
      title,
      description,
      kind,
      state,
      needUpload,
    }: AttachmentResolvedStateInfo
  ) {
    return html`
      <div class=${classMap(classInfo)}>
        <div class="affine-attachment-content">
          <div class="affine-attachment-content-title">
            <div class="affine-attachment-content-title-icon">${icon}</div>
            <div class="affine-attachment-content-title-text truncate">
              ${title}
            </div>
          </div>

          <div class="affine-attachment-content-info truncate">
            ${description}
          </div>
        </div>

        <div class="affine-attachment-banner">
          ${kind}
          ${choose(state, [
            ['error', () => this.renderNormalButton(needUpload)],
            ['error:oversize', this.renderUpgradeButton],
          ])}
        </div>
      </div>
    `;
  }

  protected resolvedState$ = computed<AttachmentResolvedStateInfo>(() => {
    const size = this.model.props.size;
    const name = this.model.props.name$.value;
    const kind = getAttachmentFileIcon(this.filetype);

    const resolvedState = this.resourceController.resolveStateWith({
      loadingIcon: LoadingIcon(),
      errorIcon: WarningIcon(),
      icon: AttachmentIcon(),
      title: name,
      description: formatSize(size),
    });

    return { ...resolvedState, kind };
  });

  protected renderCardView = () => {
    const resolvedState = this.resolvedState$.value;
    const cardStyle = this.model.props.style$.value ?? AttachmentBlockStyles[1];

    const classInfo = {
      'affine-attachment-card': true,
      [cardStyle]: true,
      loading: resolvedState.loading,
      error: resolvedState.error,
    };

    return html`
      <div style="position: relative; width: 100%; border-radius: 8px; overflow: hidden;">
        ${when(
          cardStyle === 'cubeThick',
          () => this.renderWithVertical(classInfo, resolvedState),
          () => this.renderWithHorizontal(classInfo, resolvedState)
        )}
        ${when(
          this.iracStatus === 'processing',
          () => html`
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #1e90ff, #8a2be2, #1e90ff); background-size: 200% 100%; animation: irac-progress 2s linear infinite;"></div>
            <div style="position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,0.7); color: #8a2be2; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 6px; backdrop-filter: blur(8px); border: 1px solid rgba(138,43,226,0.3); box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: irac-spin 1.5s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              Analyse en cours...
            </div>
            <style>
              @keyframes irac-spin { 100% { transform: rotate(360deg); } }
              @keyframes irac-progress { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
            </style>
          `,
          () => when(
            ['pdf', 'docx', 'xlsx', 'pptx', 'md', 'txt', 'csv'].includes(this.filetype.toLowerCase()),
            () => html`
            <div style="position: absolute; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 10;">
              <button
                @click=${(e: Event) => {
                  e.stopPropagation();
                  const iracProvider = this.std.getOptional(IracProvider);
                  if (iracProvider) {
                    iracProvider.startJob(this.model, 'summary');
                  }
                }}
                style="background: transparent; color: #1e90ff; border: 1px solid rgba(30,144,255,0.3); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); background-color: rgba(255,255,255,0.7); backdrop-filter: blur(8px);"
              >
                📑 Résumé
              </button>
              <button
                @click=${(e: Event) => {
                  e.stopPropagation();
                  const iracProvider = this.std.getOptional(IracProvider);
                  if (iracProvider) {
                    iracProvider.startJob(this.model, 'irac');
                  }
                }}
                style="background: transparent; color: #8a2be2; border: 1px solid rgba(138,43,226,0.3); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.1); background-color: rgba(255,255,255,0.7); backdrop-filter: blur(8px);"
              >
                ✨ Résumé Juridique (IRAC)
              </button>
            </div>
            `
          )
        )}
      </div>
    `;
  };

  protected renderEmbedView = () => {
    const { model, blobUrl } = this;
    if (!model.props.embed$.value || !blobUrl) return null;

    const { std, _maxFileSize } = this;
    const provider = std.get(AttachmentEmbedProvider);

    const render = provider.getRender(model, _maxFileSize);
    if (!render) return null;

    const enabled = provider.shouldShowStatus(model);

    return html`
      <div class="affine-attachment-embed-container">
        ${guard([this._refreshKey$.value], () => render(model, blobUrl))}
      </div>
      ${when(enabled, () => {
        const resolvedState = this.resolvedState$.value;
        if (resolvedState.state !== 'error') return null;
        // It should be an error messge.
        const message = resolvedState.description;
        if (!message) return null;

        const needUpload = resolvedState.needUpload;
        const action = () =>
          needUpload ? this.resourceController.upload() : this.reload();

        return html`
          <affine-resource-status
            class="affine-attachment-embed-status"
            .message=${message}
            .needUpload=${needUpload}
            .action=${action}
          ></affine-resource-status>
        `;
      })}
    `;
  };

  private readonly _renderCitation = () => {
    const { name, footnoteIdentifier } = this.model.props;
    const icon = getAttachmentFileIcon(this.filetype);

    return html`<affine-citation-card
      .icon=${icon}
      .citationTitle=${name}
      .citationIdentifier=${footnoteIdentifier}
      .active=${this.selected$.value}
    ></affine-citation-card>`;
  };

  override renderBlock() {
    return html`
      <div
        class=${classMap({
          'affine-attachment-container': true,
          focused: this.selected$.value,
          'comment-highlighted': this.isCommentHighlighted,
        })}
        style="position: relative; ${this.containerStyleMap}"
      >
        ${when(
          this.isCitation,
          () => this._renderCitation(),
          () => this.renderEmbedView() ?? this.renderCardView()
        )}

        ${this.model.children.length > 0 ? html`<div style="margin-top: 12px; padding: 0 12px; display: flex; flex-direction: column; gap: 8px;">${this.std.host.renderChildren(this.model)}</div>` : ''}
      </div>
    `;
  }

  override accessor selectedStyle = SelectedStyle.Border;

  override accessor useCaptionEditor = true;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-attachment': AttachmentBlockComponent;
  }
}
