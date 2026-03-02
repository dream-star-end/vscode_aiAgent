/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IAIProviderService } from '../../../../platform/aiProvider/common/aiProvider.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IChatAgentService } from '../common/participants/chatAgents.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { AIStudioChatAgent } from './aiStudioChatAgent.js';

class AIStudioChatContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chat.aiStudioContribution';

	constructor(
		@IChatAgentService chatAgentService: IChatAgentService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAIProviderService _aiProviderService: IAIProviderService,
	) {
		super();

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
}

registerWorkbenchContribution2(AIStudioChatContribution.ID, AIStudioChatContribution, WorkbenchPhase.BlockRestore);
