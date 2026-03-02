/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CodebaseKnowledgeService } from './aiKnowledge.js';

/**
 * Watches file changes across the workspace, debounces them, filters by
 * .gitignore-style rules and fingerprint comparison, and dispatches to the
 * knowledge service for re-indexing.
 */
export class IncrementalOrchestrator extends Disposable {

	private static readonly DEBOUNCE_MS = 500;

	private readonly _pendingUris = new Set<string>();
	private readonly _scheduler: RunOnceScheduler;
	private readonly _fingerprints = new Map<string, number>();

	private static readonly SKIP_DIRS = ['node_modules', '.git', 'dist', 'out', '.cache', 'coverage', '__pycache__'];
	private static readonly SKIP_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map'];

	constructor(
		private readonly _knowledgeService: CodebaseKnowledgeService,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._scheduler = this._register(new RunOnceScheduler(() => this._flush(), IncrementalOrchestrator.DEBOUNCE_MS));

		this._register(this._fileService.onDidFilesChange(e => this._onFilesChanged(e)));
		this._logService.info('[IncrementalOrchestrator] Watching for file changes.');
	}

	private _onFilesChanged(event: FileChangesEvent): void {
		const folders = this._workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) {
			return;
		}

		for (const folder of folders) {
			if (event.affects(folder.uri, FileChangeType.ADDED, FileChangeType.UPDATED, FileChangeType.DELETED)) {
				this._collectAffectedFiles(event, folder.uri);
			}
		}

		if (this._pendingUris.size > 0 && !this._scheduler.isScheduled()) {
			this._scheduler.schedule();
		}
	}

	private _collectAffectedFiles(event: FileChangesEvent, _folderUri: URI): void {
		const allUris = [...event.rawAdded, ...event.rawUpdated, ...event.rawDeleted];
		for (const uri of allUris) {
			const path = uri.fsPath;
			if (this._shouldSkipPath(path)) {
				continue;
			}
			this._pendingUris.add(uri.toString());
		}
	}

	private async _flush(): Promise<void> {
		const uris = [...this._pendingUris];
		this._pendingUris.clear();

		let reindexed = 0;
		for (const uriStr of uris) {
			const uri = URI.parse(uriStr);
			if (await this._hasChanged(uri)) {
				await this._knowledgeService.reindexFile(uri);
				reindexed++;
			}
		}

		if (reindexed > 0) {
			this._logService.info(`[IncrementalOrchestrator] Re-indexed ${reindexed} file(s).`);
		}
	}

	private async _hasChanged(uri: URI): Promise<boolean> {
		try {
			const exists = await this._fileService.exists(uri);
			if (!exists) {
				const had = this._fingerprints.delete(uri.toString());
				return had;
			}
			const content = await this._fileService.readFile(uri, { limits: { size: 100_000 } });
			const hash = this._simpleHash(content.value.toString());
			const previous = this._fingerprints.get(uri.toString());
			if (previous === hash) {
				return false;
			}
			this._fingerprints.set(uri.toString(), hash);
			return true;
		} catch {
			return false;
		}
	}

	private _shouldSkipPath(path: string): boolean {
		const segments = path.split(/[\\/]/);
		for (const seg of segments) {
			if (IncrementalOrchestrator.SKIP_DIRS.includes(seg)) {
				return true;
			}
		}
		const lastSegment = segments[segments.length - 1] || '';
		const dotIdx = lastSegment.lastIndexOf('.');
		if (dotIdx >= 0) {
			const ext = lastSegment.substring(dotIdx);
			if (IncrementalOrchestrator.SKIP_EXTENSIONS.includes(ext)) {
				return true;
			}
		}
		return false;
	}

	private _simpleHash(text: string): number {
		let hash = 0;
		for (let i = 0; i < text.length; i++) {
			const ch = text.charCodeAt(i);
			hash = ((hash << 5) - hash) + ch;
			hash |= 0;
		}
		return hash;
	}
}
