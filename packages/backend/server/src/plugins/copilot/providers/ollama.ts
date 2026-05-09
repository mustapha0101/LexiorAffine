import { CopilotProviderSideError, metrics } from '../../../base';
import {
  llmDispatchStream,
  type NativeLlmBackendConfig,
  type NativeLlmRequest,
} from '../../../native';
import type { NodeTextMiddleware } from '../config';
import type { CopilotToolSet } from '../tools';
import { buildNativeRequest, NativeProviderAdapter } from './native';
import { CopilotProvider } from './provider';
import {
  CopilotChatOptions,
  CopilotProviderModel,
  CopilotProviderType,
  ModelConditions,
  ModelInputType,
  ModelOutputType,
  PromptMessage,
  StreamObject,
} from './types';

export type OllamaConfig = {
  baseURL?: string;
};

export class OllamaProvider extends CopilotProvider<OllamaConfig> {
  readonly type = CopilotProviderType.Ollama;

  // We fetch models dynamically from the local Ollama instance
  readonly models: CopilotProviderModel[] = [];

  override configured(): boolean {
    return true; // Local server is the default
  }

  override async match(cond: ModelConditions = {}): Promise<boolean> {
    if (cond.modelId && this.onlineModelList.length === 0) {
      await this.refreshOnlineModels();
    }
    return super.match(cond);
  }

  protected override setup() {
    super.setup();
  }

  override async refreshOnlineModels() {
    try {
      const baseUrl = this.config.baseURL || 'http://localhost:11434/v1';
      if (baseUrl && !this.onlineModelList.length) {
        const { data } = await fetch(`${baseUrl}/models`, {
          headers: {
            'Content-Type': 'application/json',
          },
        }).then(r => r.json() as Promise<any>);
        
        this.onlineModelList = data.map((model: any) => model.id);
        
        // Dynamically populate the models list
        for (const modelId of this.onlineModelList) {
          if (!this.models.find(m => m.id === modelId)) {
            // Provide a basic capability since we don't know the specifics of local models
            // Assuming text/object output and text input as baseline
            this.models.push({
              name: modelId,
              id: modelId,
              capabilities: [
                {
                  input: [ModelInputType.Text],
                  output: [ModelOutputType.Text, ModelOutputType.Object],
                },
              ],
            });
          }
        }
      }
    } catch (e) {
      this.logger.error('Failed to fetch available models from Ollama', e);
    }
  }

  private createNativeConfig(): NativeLlmBackendConfig {
    const baseUrl = this.config.baseURL || 'http://localhost:11434/v1';
    return {
      base_url: baseUrl.replace(/\/v1\/?$/, ''),
      auth_token: 'ollama', // token is not required by Ollama, but we provide a dummy one
    };
  }

  private createNativeAdapter(
    tools: CopilotToolSet,
    nodeTextMiddleware?: NodeTextMiddleware[]
  ) {
    return new NativeProviderAdapter(
      (request: NativeLlmRequest, signal?: AbortSignal) =>
        llmDispatchStream(
          'openai_chat',
          this.createNativeConfig(),
          request,
          signal
        ),
      tools,
      this.MAX_STEPS,
      { nodeTextMiddleware }
    );
  }

  protected override async getTools(
    options: CopilotChatOptions,
    model: string
  ): Promise<CopilotToolSet> {
    // Disable tools for mistral as it does not support function calling
    // which results in a 400 invalid_request_error. Other models like qwen3:8b support it.
    if (model.toLowerCase().includes('mistral')) {
      return {};
    }
    return super.getTools(options, model);
  }

  async text(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): Promise<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    const normalizedCond = await this.checkParams({
      cond: fullCond,
      messages,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai.counter('chat_text_calls').add(1, this.metricLabels(model.id));

      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      return await adapter.text(request, options.signal, messages);
    } catch (e: any) {
      metrics.ai
        .counter('chat_text_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  async *streamText(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const fullCond = { ...cond, outputType: ModelOutputType.Text };
    const normalizedCond = await this.checkParams({
      cond: fullCond,
      messages,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai
        .counter('chat_text_stream_calls')
        .add(1, this.metricLabels(model.id));

      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      for await (const chunk of adapter.streamText(
        request,
        options.signal,
        messages
      )) {
        yield chunk;
      }
    } catch (e: any) {
      metrics.ai
        .counter('chat_text_stream_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  override async *streamObject(
    cond: ModelConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {}
  ): AsyncIterable<StreamObject> {
    const fullCond = { ...cond, outputType: ModelOutputType.Object };
    const normalizedCond = await this.checkParams({
      cond: fullCond,
      messages,
      options,
    });
    const model = this.selectModel(normalizedCond);

    try {
      metrics.ai
        .counter('chat_object_stream_calls')
        .add(1, this.metricLabels(model.id));
        
      const tools = await this.getTools(options, model.id);
      const middleware = this.getActiveProviderMiddleware();
      const { request } = await buildNativeRequest({
        model: model.id,
        messages,
        options,
        tools,
        middleware,
      });
      const adapter = this.createNativeAdapter(tools, middleware.node?.text);
      for await (const chunk of adapter.streamObject(
        request,
        options.signal,
        messages
      )) {
        yield chunk;
      }
    } catch (e: any) {
      metrics.ai
        .counter('chat_object_stream_errors')
        .add(1, this.metricLabels(model.id));
      throw this.handleError(e);
    }
  }

  private handleError(e: any) {
    if (e instanceof CopilotProviderSideError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected ollama response',
    });
  }
}
