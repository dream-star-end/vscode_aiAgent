/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../nls.js';
import { ConfigurationScope, Extensions, IConfigurationNode, IConfigurationRegistry } from '../../configuration/common/configurationRegistry.js';
import { Registry } from '../../registry/common/platform.js';

const AI_PROVIDER_CATEGORY = localize('aiProvider', "AI Provider");

const aiProviderConfigNode: IConfigurationNode = {
	id: 'aiProvider',
	title: AI_PROVIDER_CATEGORY,
	type: 'object',
	properties: {
		'aiProvider.activeProvider': {
			type: 'string',
			default: 'openai',
			enum: ['openai', 'anthropic', 'deepseek', 'gemini', 'ollama', 'custom-openai'],
			enumDescriptions: [
				localize('aiProvider.openai', "OpenAI (GPT-4o, o1, o3)"),
				localize('aiProvider.anthropic', "Anthropic (Claude Sonnet, Opus)"),
				localize('aiProvider.deepseek', "DeepSeek (V3, R1)"),
				localize('aiProvider.gemini', "Google Gemini (Pro, Flash)"),
				localize('aiProvider.ollama', "Ollama (Local Models)"),
				localize('aiProvider.custom', "Custom OpenAI-Compatible Endpoint"),
			],
			description: localize('aiProvider.activeProvider.desc', "The active AI provider to use for chat, completion, and agent tasks."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.openai.model': {
			type: 'string',
			default: 'gpt-4o',
			description: localize('aiProvider.openai.model', "Default OpenAI model for chat."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.anthropic.model': {
			type: 'string',
			default: 'claude-sonnet-4-20250514',
			description: localize('aiProvider.anthropic.model', "Default Anthropic model for chat."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.deepseek.model': {
			type: 'string',
			default: 'deepseek-chat',
			description: localize('aiProvider.deepseek.model', "Default DeepSeek model for chat."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.gemini.model': {
			type: 'string',
			default: 'gemini-2.5-flash',
			description: localize('aiProvider.gemini.model', "Default Gemini model for chat."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.ollama.baseUrl': {
			type: 'string',
			default: 'http://localhost:11434/v1',
			description: localize('aiProvider.ollama.baseUrl', "Base URL for the Ollama API."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.ollama.model': {
			type: 'string',
			default: '',
			description: localize('aiProvider.ollama.model', "Default Ollama model. Leave empty to use the first available."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.customOpenAI.baseUrl': {
			type: 'string',
			default: '',
			description: localize('aiProvider.custom.baseUrl', "Base URL for a custom OpenAI-compatible API endpoint."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.customOpenAI.model': {
			type: 'string',
			default: '',
			description: localize('aiProvider.custom.model', "Model ID for the custom endpoint."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.agent.model': {
			type: 'string',
			default: '',
			description: localize('aiProvider.agent.model', "Model to use for the 7x24 Agent Planner. Leave empty to use the provider default."),
			scope: ConfigurationScope.APPLICATION,
		},
		'aiProvider.completion.model': {
			type: 'string',
			default: '',
			description: localize('aiProvider.completion.model', "Model for code completion (FIM). Leave empty to use the provider default."),
			scope: ConfigurationScope.APPLICATION,
		},
	},
};

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration(aiProviderConfigNode);
