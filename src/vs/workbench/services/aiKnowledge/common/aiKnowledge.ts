/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService, IFileStat } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';

// -- Types ---------------------------------------------------------------

export interface ICodeChunk {
	readonly path: string;
	readonly content: string;
	readonly score: number;
	readonly lines: { readonly start: number; readonly end: number };
}

export interface IStructureQuery {
	readonly type: 'dependencies' | 'references' | 'hierarchy';
	readonly target: string;
}

export interface IStructureResult {
	readonly query: IStructureQuery;
	readonly items: IStructureResultItem[];
}

export interface IStructureResultItem {
	readonly path: string;
	readonly name: string;
	readonly kind: string;
}

export interface IIndexStatus {
	readonly totalFiles: number;
	readonly indexedFiles: number;
	readonly isIndexing: boolean;
	readonly lastUpdate: number;
}

// -- Service Interface ---------------------------------------------------

export const ICodebaseKnowledgeService = createDecorator<ICodebaseKnowledgeService>('codebaseKnowledgeService');

export interface ICodebaseKnowledgeService {
	readonly _serviceBrand: undefined;
	semanticSearch(query: string, topK?: number): Promise<ICodeChunk[]>;
	structureQuery(query: IStructureQuery): Promise<IStructureResult>;
	getProjectSummary(): Promise<string>;
	getIndexStatus(): IIndexStatus;
	readonly onDidChangeIndexStatus: Event<IIndexStatus>;
}

// -- Implementation (ripgrep-based fallback) -----------------------------

export class CodebaseKnowledgeService extends Disposable implements ICodebaseKnowledgeService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeIndexStatus = this._register(new Emitter<IIndexStatus>());
	readonly onDidChangeIndexStatus: Event<IIndexStatus> = this._onDidChangeIndexStatus.event;

	private _indexStatus: IIndexStatus = {
		totalFiles: 0,
		indexedFiles: 0,
		isIndexing: false,
		lastUpdate: 0,
	};

	private _fileIndex: Map<string, string[]> = new Map();

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();
		this._buildInitialIndex();
	}

	getIndexStatus(): IIndexStatus {
		return this._indexStatus;
	}

	async semanticSearch(query: string, topK: number = 10): Promise<ICodeChunk[]> {
		const keywords = this._tokenize(query);
		if (keywords.length === 0) {
			return [];
		}

		const results: ICodeChunk[] = [];
		for (const [path, lines] of this._fileIndex) {
			const content = lines.join('\n');
			const score = this._computeRelevance(keywords, content);
			if (score > 0) {
				results.push({
					path,
					content: content.substring(0, 2000),
					score,
					lines: { start: 1, end: lines.length },
				});
			}
		}

		results.sort((a, b) => b.score - a.score);
		return results.slice(0, topK);
	}

	async structureQuery(query: IStructureQuery): Promise<IStructureResult> {
		const items: IStructureResultItem[] = [];
		const targetLower = query.target.toLowerCase();

		for (const [path, lines] of this._fileIndex) {
			const content = lines.join('\n');
			switch (query.type) {
				case 'references': {
					if (content.toLowerCase().includes(targetLower)) {
						items.push({ path, name: query.target, kind: 'reference' });
					}
					break;
				}
				case 'dependencies': {
					const importPattern = new RegExp(`import\\s.*['"].*${this._escapeRegex(query.target)}.*['"]`, 'i');
					if (importPattern.test(content)) {
						items.push({ path, name: query.target, kind: 'dependency' });
					}
					break;
				}
				case 'hierarchy': {
					const classPattern = new RegExp(`(class|interface|extends|implements)\\s+\\w*${this._escapeRegex(query.target)}\\w*`, 'i');
					if (classPattern.test(content)) {
						items.push({ path, name: query.target, kind: 'hierarchy' });
					}
					break;
				}
			}
		}

		return { query, items };
	}

	async getProjectSummary(): Promise<string> {
		const folders = this._workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return 'No workspace folder open.';
		}

		const parts: string[] = [];
		for (const folder of folders) {
			parts.push(`Workspace: ${folder.uri.fsPath}`);

			const readmeContent = await this._tryReadFile(URI.joinPath(folder.uri, 'README.md'));
			if (readmeContent) {
				parts.push(`README:\n${readmeContent.substring(0, 1000)}`);
			}

			const pkgContent = await this._tryReadFile(URI.joinPath(folder.uri, 'package.json'));
			if (pkgContent) {
				parts.push(`package.json:\n${pkgContent.substring(0, 500)}`);
			}

			const topLevel = await this._listTopLevel(folder);
			if (topLevel.length > 0) {
				parts.push(`Top-level structure:\n${topLevel.join('\n')}`);
			}
		}

		return parts.join('\n\n');
	}

	/**
	 * Re-index a single file after a change is detected.
	 */
	async reindexFile(uri: URI): Promise<void> {
		const path = uri.fsPath;
		try {
			const exists = await this._fileService.exists(uri);
			if (!exists) {
				this._fileIndex.delete(path);
				this._updateStatus();
				return;
			}
			const fileContent = await this._fileService.readFile(uri);
			const text = fileContent.value.toString();
			this._fileIndex.set(path, text.split('\n'));
			this._updateStatus();
		} catch (err) {
			this._logService.warn(`[Knowledge] Failed to reindex file: ${path}`, err);
		}
	}

	// -- Private helpers ---------------------------------------------------

	private async _buildInitialIndex(): Promise<void> {
		this._setIndexing(true);
		try {
			const folders = this._workspaceContextService.getWorkspace().folders;
			for (const folder of folders) {
				await this._indexFolder(folder.uri, 0);
			}
		} catch (err) {
			this._logService.warn('[Knowledge] Initial index failed:', err);
		}
		this._setIndexing(false);
		this._logService.info(`[Knowledge] Indexed ${this._indexStatus.indexedFiles} files.`);
	}

	private async _indexFolder(folderUri: URI, depth: number): Promise<void> {
		if (depth > 5) {
			return;
		}
		try {
			const stat = await this._fileService.resolve(folderUri);
			if (!stat.children) {
				return;
			}
			for (const child of stat.children) {
				if (this._shouldSkip(child)) {
					continue;
				}
				if (child.isDirectory) {
					await this._indexFolder(child.resource, depth + 1);
				} else if (child.isFile && this._isTextFile(child.resource)) {
					await this._indexSingleFile(child.resource);
				}
			}
		} catch {
			// folder may not be resolvable
		}
	}

	private async _indexSingleFile(uri: URI): Promise<void> {
		try {
			const content = await this._fileService.readFile(uri, { limits: { size: 100_000 } }, CancellationToken.None);
			const text = content.value.toString();
			this._fileIndex.set(uri.fsPath, text.split('\n'));
			this._updateStatus();
		} catch {
			// skip files that cannot be read
		}
	}

	private _shouldSkip(stat: IFileStat): boolean {
		const name = this._getFileName(stat.resource);
		const skipDirs = ['node_modules', '.git', 'dist', 'out', '.cache', 'coverage', '__pycache__'];
		return stat.isDirectory && skipDirs.includes(name);
	}

	private _isTextFile(uri: URI): boolean {
		const ext = this._getExtension(uri);
		const textExts = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.css', '.html', '.py', '.yaml', '.yml', '.toml', '.sh', '.bat', '.txt'];
		return textExts.includes(ext);
	}

	private _getFileName(uri: URI): string {
		const parts = uri.path.split('/');
		return parts[parts.length - 1] || '';
	}

	private _getExtension(uri: URI): string {
		const name = this._getFileName(uri);
		const dot = name.lastIndexOf('.');
		return dot >= 0 ? name.substring(dot) : '';
	}

	private _tokenize(text: string): string[] {
		return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
	}

	private _computeRelevance(keywords: string[], content: string): number {
		const lower = content.toLowerCase();
		let score = 0;
		for (const kw of keywords) {
			let idx = 0;
			while ((idx = lower.indexOf(kw, idx)) !== -1) {
				score++;
				idx += kw.length;
			}
		}
		return score;
	}

	private _escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	private async _tryReadFile(uri: URI): Promise<string | undefined> {
		try {
			const exists = await this._fileService.exists(uri);
			if (!exists) {
				return undefined;
			}
			const content = await this._fileService.readFile(uri);
			return content.value.toString();
		} catch {
			return undefined;
		}
	}

	private async _listTopLevel(folder: IWorkspaceFolder): Promise<string[]> {
		try {
			const stat = await this._fileService.resolve(folder.uri);
			if (!stat.children) {
				return [];
			}
			return stat.children.map(c => {
				const name = this._getFileName(c.resource);
				return c.isDirectory ? `${name}/` : name;
			});
		} catch {
			return [];
		}
	}

	private _setIndexing(isIndexing: boolean): void {
		this._indexStatus = {
			...this._indexStatus,
			isIndexing,
			lastUpdate: Date.now(),
		};
		this._onDidChangeIndexStatus.fire(this._indexStatus);
	}

	private _updateStatus(): void {
		this._indexStatus = {
			totalFiles: this._indexStatus.totalFiles + 1,
			indexedFiles: this._fileIndex.size,
			isIndexing: this._indexStatus.isIndexing,
			lastUpdate: Date.now(),
		};
	}
}

registerSingleton(ICodebaseKnowledgeService, CodebaseKnowledgeService, InstantiationType.Delayed);
