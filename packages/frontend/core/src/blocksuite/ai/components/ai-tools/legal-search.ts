import { WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { SearchIcon } from '@blocksuite/icons/lit';
import type { Signal } from '@preact/signals-core';
import { html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import type { ToolError } from './type';

interface LegalSearchToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: any;
}

interface LegalSearchToolResult {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  args: any;
  result: any | ToolError | null;
}

export class LegalSearchTool extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor data!: LegalSearchToolCall | LegalSearchToolResult;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  renderToolCall() {
    let queryDesc = 'the legal database';
    if (this.data.args?.query) {
      queryDesc = `"${this.data.args.query}"`;
    } else if (this.data.args?.citation) {
      queryDesc = `citation "${this.data.args.citation}"`;
    }

    return html`
      <tool-call-card
        .name=${`Searching ${queryDesc}...`}
        .icon=${SearchIcon()}
      ></tool-call-card>
    `;
  }

  renderToolResult() {
    if (this.data.type !== 'tool-result') {
      return nothing;
    }

    const result = this.data.result;
    
    if (result && result.isError) {
       return html`
        <tool-failed-card
          .name=${'Legal search failed'}
          .icon=${SearchIcon()}
        ></tool-failed-card>
      `;
    }

    // A generic result view for Legal searches
    const results = [{
        title: 'Search Results Extracted',
        icon: SearchIcon(),
        content: typeof result === 'string' ? result : JSON.stringify(result)
    }];

    return html`
      <tool-result-card
        .name=${'The legal search is complete'}
        .icon=${SearchIcon()}
        .results=${results}
        .width=${this.width}
      ></tool-result-card>
    `;
  }

  protected override render() {
    const { data } = this;

    if (data.type === 'tool-call') {
      return this.renderToolCall();
    }
    if (data.type === 'tool-result') {
      return this.renderToolResult();
    }
    return nothing;
  }
}
