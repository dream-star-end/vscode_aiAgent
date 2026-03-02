/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

// -- Types ---------------------------------------------------------------

export interface ISkillDefinition {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly keywords: string[];
	readonly content: string;
	readonly filePath: string;
}

export interface ISkillContent {
	readonly definition: ISkillDefinition;
	readonly resolvedContent: string;
	readonly tokenCount: number;
}

// -- Service Interface ---------------------------------------------------

export const IAISkillService = createDecorator<IAISkillService>('aiSkillService');

export interface IAISkillService {
	readonly _serviceBrand: undefined;
	match(userMessage: string, currentFile: string, maxSkills: number, budgetTokens: number): Promise<ISkillContent[]>;
	registerSkill(skill: ISkillDefinition): IDisposable;
	listSkills(): ISkillDefinition[];
}

// -- Implementation ------------------------------------------------------

export class SkillMatcher extends Disposable implements IAISkillService {

	declare readonly _serviceBrand: undefined;

	private readonly _skills = new Map<string, ISkillDefinition>();
	private _scanned = false;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
	}

	async match(userMessage: string, currentFile: string, maxSkills: number, budgetTokens: number): Promise<ISkillContent[]> {
		await this._ensureScanned();

		const messageKeywords = this._tokenize(userMessage);
		const scored: Array<{ skill: ISkillDefinition; score: number }> = [];

		for (const [, skill] of this._skills) {
			const score = this._computeScore(messageKeywords, skill, currentFile);
			if (score > 0) {
				scored.push({ skill, score });
			}
		}

		scored.sort((a, b) => b.score - a.score);

		const results: ISkillContent[] = [];
		let usedTokens = 0;

		for (const { skill } of scored) {
			if (results.length >= maxSkills) {
				break;
			}

			const resolvedContent = await this._resolveContent(skill);
			const tokenCount = this._estimateTokens(resolvedContent);

			if (usedTokens + tokenCount > budgetTokens) {
				continue;
			}

			results.push({
				definition: skill,
				resolvedContent,
				tokenCount,
			});
			usedTokens += tokenCount;
		}

		this._logService.info(`[SkillMatcher] Matched ${results.length} skills (${usedTokens} tokens used).`);
		return results;
	}

	registerSkill(skill: ISkillDefinition): IDisposable {
		this._skills.set(skill.id, skill);
		this._logService.info(`[SkillMatcher] Registered skill: ${skill.id}`);
		return toDisposable(() => {
			this._skills.delete(skill.id);
			this._logService.info(`[SkillMatcher] Unregistered skill: ${skill.id}`);
		});
	}

	listSkills(): ISkillDefinition[] {
		return [...this._skills.values()];
	}

	// -- Private helpers ---------------------------------------------------

	private async _ensureScanned(): Promise<void> {
		if (this._scanned) {
			return;
		}
		this._scanned = true;

		const folders = this._workspaceContextService.getWorkspace().folders;
		for (const folder of folders) {
			await this._scanFolder(folder.uri, 0);
		}
		this._logService.info(`[SkillMatcher] Scanned workspace, found ${this._skills.size} SKILL.md file(s).`);
	}

	private async _scanFolder(folderUri: URI, depth: number): Promise<void> {
		if (depth > 5) {
			return;
		}
		try {
			const stat = await this._fileService.resolve(folderUri);
			if (!stat.children) {
				return;
			}
			for (const child of stat.children) {
				if (child.isDirectory && !this._shouldSkipDir(child)) {
					await this._scanFolder(child.resource, depth + 1);
				} else if (child.isFile && this._isSkillFile(child.resource)) {
					await this._loadSkillFile(child.resource);
				}
			}
		} catch {
			// folder may not be resolvable
		}
	}

	private async _loadSkillFile(uri: URI): Promise<void> {
		try {
			const fileContent = await this._fileService.readFile(uri);
			const text = fileContent.value.toString();
			const parsed = this._parseSkillFile(text, uri.fsPath);
			if (parsed) {
				this._skills.set(parsed.id, parsed);
			}
		} catch (err) {
			this._logService.warn(`[SkillMatcher] Failed to load skill file: ${uri.fsPath}`, err);
		}
	}

	private _parseSkillFile(content: string, filePath: string): ISkillDefinition | undefined {
		const lines = content.split('\n');
		let name = '';
		let description = '';
		const keywords: string[] = [];

		for (const line of lines) {
			const trimmed = line.trim();
			if (!name && trimmed.startsWith('# ')) {
				name = trimmed.substring(2).trim();
			} else if (!description && trimmed.length > 0 && !trimmed.startsWith('#') && !trimmed.startsWith('keywords:')) {
				description = trimmed;
			} else if (trimmed.toLowerCase().startsWith('keywords:')) {
				const kw = trimmed.substring('keywords:'.length).trim();
				keywords.push(...kw.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0));
			}
		}

		if (!name) {
			return undefined;
		}

		const id = `skill-${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
		return { id, name, description, keywords, content, filePath };
	}

	private _computeScore(messageKeywords: string[], skill: ISkillDefinition, currentFile: string): number {
		let score = 0;

		for (const kw of messageKeywords) {
			for (const skillKw of skill.keywords) {
				if (skillKw.includes(kw) || kw.includes(skillKw)) {
					score += 2;
				}
			}
			if (skill.name.toLowerCase().includes(kw)) {
				score += 1;
			}
			if (skill.description.toLowerCase().includes(kw)) {
				score += 0.5;
			}
		}

		if (currentFile && skill.filePath) {
			const skillDir = this._getDirectory(skill.filePath);
			const fileDir = this._getDirectory(currentFile);
			if (skillDir === fileDir) {
				score += 3;
			} else if (fileDir.startsWith(skillDir) || skillDir.startsWith(fileDir)) {
				score += 1;
			}
		}

		return score;
	}

	private async _resolveContent(skill: ISkillDefinition): Promise<string> {
		try {
			const uri = URI.file(skill.filePath);
			const fileContent = await this._fileService.readFile(uri);
			return fileContent.value.toString();
		} catch {
			return skill.content;
		}
	}

	private _shouldSkipDir(stat: IFileStat): boolean {
		const name = this._getFileName(stat.resource);
		const skipDirs = ['node_modules', '.git', 'dist', 'out', '.cache', 'coverage', '__pycache__'];
		return skipDirs.includes(name);
	}

	private _isSkillFile(uri: URI): boolean {
		const name = this._getFileName(uri);
		return name.toUpperCase() === 'SKILL.MD';
	}

	private _getFileName(uri: URI): string {
		const parts = uri.path.split('/');
		return parts[parts.length - 1] || '';
	}

	private _getDirectory(filePath: string): string {
		const sep = filePath.lastIndexOf('/');
		if (sep >= 0) {
			return filePath.substring(0, sep);
		}
		const bsep = filePath.lastIndexOf('\\');
		if (bsep >= 0) {
			return filePath.substring(0, bsep);
		}
		return '';
	}

	private _tokenize(text: string): string[] {
		return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
	}

	private _estimateTokens(text: string): number {
		return Math.ceil(text.length / 4);
	}
}

registerSingleton(IAISkillService, SkillMatcher, InstantiationType.Delayed);
