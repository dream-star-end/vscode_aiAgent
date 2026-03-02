/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAIProviderService } from '../../../../platform/aiProvider/common/aiProvider.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { AIStudioChatAgent } from './aiStudioChatAgent.js';
import { createDeepSeekProvider } from '../../../../platform/aiProvider/common/providers/deepseekProvider.js';
import { createOpenAIProvider } from '../../../../platform/aiProvider/common/providers/openaiProvider.js';
import { createCustomOpenAIProvider } from '../../../../platform/aiProvider/common/providers/customOpenAIProvider.js';
import { createAnthropicProvider } from '../../../../platform/aiProvider/common/providers/anthropicProvider.js';
import { createGeminiProvider } from '../../../../platform/aiProvider/common/providers/geminiProvider.js';
import { createOllamaProvider } from '../../../../platform/aiProvider/common/providers/ollamaProvider.js';

class AIStudioChatContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.aiStudioContribution';

	constructor(
		@IChatAgentService chatAgentService: IChatAgentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAIProviderService aiProviderService: IAIProviderService,
		@IConfigurationService configService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super();

		// --- Register AI Providers based on configuration ---
		this.registerProviders(aiProviderService, configService, logService);

		// --- Register Chat Agent ---
		this._register(chatAgentService.registerAgent('ai-studio', {
			id: 'ai-studio',
			name: 'ai-studio',
			fullName: 'AI Studio',
			description: 'AI Studio Chat - powered by your configured AI provider',
			isDefault: true,
			isCore: true,
			extensionId: nullExtensionDescription.identifier,
			extensionVersion: undefined,
			extensionDisplayName: 'AI Studio',
			extensionPublisherId: '',
			slashCommands: [],
			disambiguation: [],
			locations: [ChatAgentLocation.Chat, ChatAgentLocation.EditorInline, ChatAgentLocation.Terminal],
			modes: [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent],
			metadata: {},
		}));

		const agent = instantiationService.createInstance(AIStudioChatAgent);
		this._register(chatAgentService.registerAgentImplementation('ai-studio', agent));
		this._register(agent);
	}

	private registerProviders(
		aiProviderService: IAIProviderService,
		configService: IConfigurationService,
		logService: ILogService,
	): void {
		const activeProvider = configService.getValue<string>('aiProvider.activeProvider') ?? 'openai';

		// DeepSeek
		const deepseekKey = configService.getValue<string>('aiProvider.deepseek.apiKey') ?? '';
		if (deepseekKey) {
			this._register(aiProviderService.registerProvider('deepseek', createDeepSeekProvider(deepseekKey)));
			logService.info('[AIStudio] Registered DeepSeek provider');
		}

		// OpenAI
		const openaiKey = configService.getValue<string>('aiProvider.openai.apiKey') ?? '';
		if (openaiKey) {
			this._register(aiProviderService.registerProvider('openai', createOpenAIProvider(openaiKey)));
			logService.info('[AIStudio] Registered OpenAI provider');
		}

		// Anthropic
		const anthropicKey = configService.getValue<string>('aiProvider.anthropic.apiKey') ?? '';
		if (anthropicKey) {
			this._register(aiProviderService.registerProvider('anthropic', createAnthropicProvider(anthropicKey)));
			logService.info('[AIStudio] Registered Anthropic provider');
		}

		// Gemini
		const geminiKey = configService.getValue<string>('aiProvider.gemini.apiKey') ?? '';
		if (geminiKey) {
			this._register(aiProviderService.registerProvider('gemini', createGeminiProvider(geminiKey)));
			logService.info('[AIStudio] Registered Gemini provider');
		}

		// Ollama (no API key needed)
		const ollamaUrl = configService.getValue<string>('aiProvider.ollama.baseUrl') ?? 'http://localhost:11434/v1';
		this._register(aiProviderService.registerProvider('ollama', createOllamaProvider(ollamaUrl)));

		// Custom OpenAI
		const customUrl = configService.getValue<string>('aiProvider.customOpenAI.baseUrl') ?? '';
		const customKey = configService.getValue<string>('aiProvider.customOpenAI.apiKey') ?? '';
		if (customUrl && customKey) {
			this._register(aiProviderService.registerProvider('custom-openai', createCustomOpenAIProvider({ baseUrl: customUrl, apiKey: customKey })));
			logService.info('[AIStudio] Registered Custom OpenAI provider');
		}

		// Set active provider
		if (aiProviderService.getRegisteredProviderIds().includes(activeProvider)) {
			aiProviderService.setActiveProvider(activeProvider);
			logService.info(`[AIStudio] Active provider set to: ${activeProvider}`);
		}
	}
}

registerWorkbenchContribution2(AIStudioChatContribution.ID, AIStudioChatContribution, WorkbenchPhase.BlockRestore);
