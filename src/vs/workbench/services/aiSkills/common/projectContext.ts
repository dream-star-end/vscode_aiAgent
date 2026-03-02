/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';

/**
 * Content loaded from project context files (AISTUDIO.md,
 * .github/copilot-instructions.md) for injection into the
 * context window's fixed zone.
 */
export interface IProjectContextContent {
	readonly source: string;
	readonly content: string;
}

/**
 * Scans for AISTUDIO.md in project root and subdirectories, falls
 * back to .github/copilot-instructions.md, watches for file changes
 * and reloads.
 */
export class ProjectContextLoader extends Disposable {

	private static readonly PRIMARY_FILE = 'AISTUDIO.md';
	private static readonly FALLBACK_FILE = '.github/copilot-instructions.md';
	private static readonly MAX_SCAN_DEPTH = 3;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _contents: Map<string, IProjectContextContent> = new Map();

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(this._fileService.onDidFilesChange(e => this._onFilesChanged(e)));

		this._loadAll();
	}

	/**
	 * Returns all loaded project context contents for injection into
	 * the context window's fixed zone.
	 */
	getContents(): IProjectContextContent[] {
		return [...this._contents.values()];
	}

	/**
	 * Returns combined content string for all loaded project context files.
	 */
	getCombinedContent(): string {
		const parts: string[] = [];
		for (const entry of this._contents.values()) {
			parts.push(`--- ${entry.source} ---\n${entry.content}`);
		}
		return parts.join('\n\n');
	}

	// -- Private helpers ---------------------------------------------------

	private async _loadAll(): Promise<void> {
		this._contents.clear();

		const folders = this._workspaceContextService.getWorkspace().folders;
		for (const folder of folders) {
			await this._scanForPrimaryFile(folder.uri, 0);

			const fallbackUri = URI.joinPath(folder.uri, ProjectContextLoader.FALLBACK_FILE);
			if (!this._hasPrimaryForRoot(folder.uri)) {
				await this._tryLoadFile(fallbackUri);
			}
		}

		this._logService.info(`[ProjectContext] Loaded ${this._contents.size} context file(s).`);
	}

	private async _scanForPrimaryFile(folderUri: URI, depth: number): Promise<void> {
		if (depth > ProjectContextLoader.MAX_SCAN_DEPTH) {
			return;
		}

		const primaryUri = URI.joinPath(folderUri, ProjectContextLoader.PRIMARY_FILE);
		await this._tryLoadFile(primaryUri);

		try {
			const stat = await this._fileService.resolve(folderUri);
			if (!stat.children) {
				return;
			}
			for (const child of stat.children) {
				if (child.isDirectory && !this._shouldSkipDir(child.resource)) {
					await this._scanForPrimaryFile(child.resource, depth + 1);
				}
			}
		} catch {
			// folder may not be resolvable
		}
	}

	private async _tryLoadFile(uri: URI): Promise<void> {
		try {
			const exists = await this._fileService.exists(uri);
			if (!exists) {
				return;
			}
			const fileContent = await this._fileService.readFile(uri);
			const text = fileContent.value.toString();
			if (text.trim().length > 0) {
				this._contents.set(uri.toString(), {
					source: uri.fsPath,
					content: text,
				});
			}
		} catch {
			// skip unreadable files
		}
	}

	private _hasPrimaryForRoot(folderUri: URI): boolean {
		const primaryUri = URI.joinPath(folderUri, ProjectContextLoader.PRIMARY_FILE);
		return this._contents.has(primaryUri.toString());
	}

	private _shouldSkipDir(uri: URI): boolean {
		const name = this._getFileName(uri);
		const skipDirs = ['node_modules', '.git', 'dist', 'out', '.cache', 'coverage', '__pycache__'];
		return skipDirs.includes(name);
	}

	private _getFileName(uri: URI): string {
		const parts = uri.path.split('/');
		return parts[parts.length - 1] || '';
	}

	private _onFilesChanged(event: FileChangesEvent): void {
		let shouldReload = false;
		for (const [uriStr] of this._contents) {
			const uri = URI.parse(uriStr);
			if (event.contains(uri, FileChangeType.UPDATED, FileChangeType.DELETED)) {
				shouldReload = true;
				break;
			}
		}

		if (!shouldReload) {
			const folders = this._workspaceContextService.getWorkspace().folders;
			for (const folder of folders) {
				const primaryUri = URI.joinPath(folder.uri, ProjectContextLoader.PRIMARY_FILE);
				const fallbackUri = URI.joinPath(folder.uri, ProjectContextLoader.FALLBACK_FILE);
				if (event.contains(primaryUri, FileChangeType.ADDED) || event.contains(fallbackUri, FileChangeType.ADDED)) {
					shouldReload = true;
					break;
				}
			}
		}

		if (shouldReload) {
			this._loadAll().then(() => {
				this._onDidChange.fire();
			});
		}
	}
}
