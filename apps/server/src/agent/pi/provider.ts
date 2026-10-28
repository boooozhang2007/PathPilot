// Keep the Pi adapter in source control; /pi at the repository root is only a reference checkout.
import { createModels, createProvider, type Model, type Models } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { getLlmSettings } from '../settings.js';

let cached: { key: string; models: Models; model: Model<'openai-completions'> } | undefined;

export function invalidateModels(): void {
  cached = undefined;
}

export async function resolveModel(): Promise<{ models: Models; model: Model<'openai-completions'> }> {
  const settings = await getLlmSettings();
  if (!settings.apiKey.trim()) throw new Error('未配置模型 API Key');
  if (!settings.model.trim()) throw new Error('未配置模型名称');
  const key = JSON.stringify(settings);
  if (cached?.key === key) return cached;

  const providerId = 'pathpilot';
  const model: Model<'openai-completions'> = {
    id: settings.model,
    name: settings.model,
    api: 'openai-completions',
    provider: providerId,
    baseUrl: settings.baseUrl.replace(/\/+$/, ''),
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 16_384,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      maxTokensField: 'max_tokens',
      ...(settings.provider === 'zhipu' ? { thinkingFormat: 'zai' as const, supportsReasoningEffort: false } : {}),
      ...(settings.provider === 'deepseek' ? { thinkingFormat: 'deepseek' as const, supportsReasoningEffort: false } : {}),
    },
  };
  const models = createModels();
  models.setProvider(createProvider({
    id: providerId,
    models: [model],
    auth: { apiKey: { name: 'PathPilot API Key', resolve: async () => ({ auth: { apiKey: settings.apiKey } }) } },
    api: openAICompletionsApi(),
  }));
  cached = { key, models, model };
  return cached;
}
