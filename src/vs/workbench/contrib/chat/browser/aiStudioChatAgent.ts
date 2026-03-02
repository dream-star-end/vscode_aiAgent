/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IAIProviderService, IChatMessage } from '../../../../platform/aiProvider/common/aiProvider.js';
import { IChatAgentHistoryEntry, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult } from '../common/participants/chatAgents.js';
import { IChatProgress } from '../common/chatService/chatService.js';

export class AIStudioChatAgent extends Disposable implements IChatAgentImplementation {

	constructor(
		@IAIProviderService private readonly aiProviderService: IAIProviderService,
		@IConfigurationService private readonly configService: IConfigurationService,
	) {
		super();
	}

	async invoke(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		history: IChatAgentHistoryEntry[],
		token: CancellationToken,
	): Promise<IChatAgentResult> {
		try {
			const messages: IChatMessage[] = [];

			for (const entry of history) {
				messages.push({ role: 'user', content: entry.request.message });
				const assistantText = entry.response
					.filter((r): r is { kind: 'markdownContent'; content: { value: string } } => r.kind === 'markdownContent')
					.map(r => r.content.value)
					.join('');
				if (assistantText) {
					messages.push({ role: 'assistant', content: assistantText });
				}
			}

			messages.push({ role: 'user', content: request.message });

			const providerId = this.configService.getValue<string>('aiProvider.activeProvider') ?? 'openai';
			const model = this.configService.getValue<string>(`aiProvider.${providerId}.model`) ?? '';

			if (!model) {
				progress([{
					kind: 'markdownContent',
					content: new MarkdownString('No model configured. Please set a model in **Settings > AI Provider**.'),
				}]);
				return { metadata: {} };
			}

			let accumulatedText = '';
			const stream = this.aiProviderService.chatCompletion({ model, messages }, token);

			for await (const chunk of stream) {
				if (token.isCancellationRequested) {
					break;
				}
				for (const choice of chunk.choices) {
					const delta = choice.delta.content;
					if (delta) {
						accumulatedText += delta;
						progress([{
							kind: 'markdownContent',
							content: new MarkdownString(accumulatedText),
						}]);
					}
				}
			}

			return { metadata: {} };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			progress([{
				kind: 'markdownContent',
				content: new MarkdownString(`**Error:** ${message}\n\nMake sure your AI provider and API key are configured in **Settings > AI Provider**.`),
			}]);
			return {
				errorDetails: { message },
				metadata: {},
			};
		}
	}
}
