/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// -- Tool Data Interface ---

export interface IToolData {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly category: ToolCategory;
	readonly keywords: string[];
	readonly parameters: IToolParameter[];
}

export interface IToolParameter {
	readonly name: string;
	readonly type: string;
	readonly description: string;
	readonly required: boolean;
}

export type ToolCategory = 'file' | 'search' | 'execution' | 'analysis' | 'agent';

// -- TF-IDF search helpers ---

interface ITermFrequency {
	readonly term: string;
	readonly frequency: number;
}

function tokenize(text: string): string[] {
	return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1);
}

function computeTermFrequency(tokens: string[]): ITermFrequency[] {
	const counts = new Map<string, number>();
	for (const token of tokens) {
		counts.set(token, (counts.get(token) ?? 0) + 1);
	}
	const result: ITermFrequency[] = [];
	for (const [term, count] of counts) {
		result.push({ term, frequency: count / tokens.length });
	}
	return result;
}

function computeIDF(documents: string[][], term: string): number {
	let docCount = 0;
	for (const doc of documents) {
		if (doc.includes(term)) {
			docCount++;
		}
	}
	if (docCount === 0) {
		return 0;
	}
	return Math.log(documents.length / docCount);
}

// -- Core Tools Definitions ---

const CORE_TOOLS: IToolData[] = [
	{
		id: 'readFile',
		name: 'Read File',
		description: 'Read the contents of a file at a given path.',
		category: 'file',
		keywords: ['read', 'file', 'open', 'content', 'view', 'cat', 'get'],
		parameters: [
			{ name: 'path', type: 'string', description: 'Absolute path to the file', required: true },
			{ name: 'offset', type: 'number', description: 'Starting line offset', required: false },
			{ name: 'limit', type: 'number', description: 'Number of lines to read', required: false },
		],
	},
	{
		id: 'editFile',
		name: 'Edit File',
		description: 'Make targeted edits to a file by replacing specific text.',
		category: 'file',
		keywords: ['edit', 'file', 'modify', 'change', 'replace', 'update', 'write'],
		parameters: [
			{ name: 'path', type: 'string', description: 'Absolute path to the file', required: true },
			{ name: 'oldText', type: 'string', description: 'Text to find and replace', required: true },
			{ name: 'newText', type: 'string', description: 'Replacement text', required: true },
		],
	},
	{
		id: 'smartApplyDiff',
		name: 'Smart Apply Diff',
		description: 'Apply a unified diff to a file intelligently, handling fuzzy matching.',
		category: 'file',
		keywords: ['diff', 'patch', 'apply', 'merge', 'smart', 'unified'],
		parameters: [
			{ name: 'path', type: 'string', description: 'Absolute path to the file', required: true },
			{ name: 'diff', type: 'string', description: 'Unified diff content', required: true },
		],
	},
	{
		id: 'search',
		name: 'Search',
		description: 'Search for text patterns across files using regular expressions.',
		category: 'search',
		keywords: ['search', 'grep', 'find', 'regex', 'pattern', 'match', 'ripgrep'],
		parameters: [
			{ name: 'pattern', type: 'string', description: 'Regex pattern to search for', required: true },
			{ name: 'path', type: 'string', description: 'Directory or file to search in', required: false },
			{ name: 'glob', type: 'string', description: 'File glob filter', required: false },
		],
	},
	{
		id: 'listDirectory',
		name: 'List Directory',
		description: 'List files and directories at a given path.',
		category: 'file',
		keywords: ['list', 'directory', 'ls', 'dir', 'files', 'folders', 'tree'],
		parameters: [
			{ name: 'path', type: 'string', description: 'Absolute path to the directory', required: true },
			{ name: 'recursive', type: 'boolean', description: 'Whether to list recursively', required: false },
		],
	},
	{
		id: 'terminal',
		name: 'Terminal',
		description: 'Execute a shell command in the terminal.',
		category: 'execution',
		keywords: ['terminal', 'shell', 'command', 'exec', 'run', 'bash', 'cli'],
		parameters: [
			{ name: 'command', type: 'string', description: 'Shell command to execute', required: true },
			{ name: 'workingDirectory', type: 'string', description: 'Working directory', required: false },
			{ name: 'timeout', type: 'number', description: 'Timeout in milliseconds', required: false },
		],
	},
	{
		id: 'runSubagent',
		name: 'Run Subagent',
		description: 'Spawn a sub-agent to handle a delegated task autonomously.',
		category: 'agent',
		keywords: ['subagent', 'delegate', 'spawn', 'agent', 'task', 'parallel'],
		parameters: [
			{ name: 'task', type: 'string', description: 'Task description for the sub-agent', required: true },
			{ name: 'context', type: 'string', description: 'Additional context', required: false },
		],
	},
	{
		id: 'codebaseSearch',
		name: 'Codebase Search',
		description: 'Semantic search over the codebase using embeddings.',
		category: 'search',
		keywords: ['codebase', 'semantic', 'search', 'embedding', 'symbol', 'definition'],
		parameters: [
			{ name: 'query', type: 'string', description: 'Natural language search query', required: true },
			{ name: 'scope', type: 'string', description: 'Scope to search within', required: false },
		],
	},
	{
		id: 'projectAnalyzer',
		name: 'Project Analyzer',
		description: 'Analyze project structure, dependencies, and architecture.',
		category: 'analysis',
		keywords: ['analyze', 'project', 'structure', 'dependency', 'architecture', 'overview'],
		parameters: [
			{ name: 'path', type: 'string', description: 'Root path of the project', required: true },
			{ name: 'depth', type: 'number', description: 'Analysis depth level', required: false },
		],
	},
	{
		id: 'toolSearch',
		name: 'Tool Search',
		description: 'Search available tools by keyword or category.',
		category: 'analysis',
		keywords: ['tool', 'search', 'find', 'discover', 'capability', 'available'],
		parameters: [
			{ name: 'query', type: 'string', description: 'Search query for tools', required: true },
			{ name: 'category', type: 'string', description: 'Tool category filter', required: false },
		],
	},
];

// -- Tool Index ---

export class ToolIndex {

	private readonly _tools = new Map<string, IToolData>();
	private _documentTokens: string[][] = [];
	private _dirty = true;

	constructor() {
		for (const tool of CORE_TOOLS) {
			this._tools.set(tool.id, tool);
		}
	}

	getAll(): IToolData[] {
		return [...this._tools.values()];
	}

	getById(id: string): IToolData | undefined {
		return this._tools.get(id);
	}

	getByCategory(category: ToolCategory): IToolData[] {
		return this.getAll().filter(t => t.category === category);
	}

	register(tool: IToolData): void {
		this._tools.set(tool.id, tool);
		this._dirty = true;
	}

	unregister(id: string): boolean {
		const deleted = this._tools.delete(id);
		if (deleted) {
			this._dirty = true;
		}
		return deleted;
	}

	search(query: string, category?: string): IToolData[] {
		const tools = category
			? this.getAll().filter(t => t.category === category)
			: this.getAll();

		if (tools.length === 0) {
			return [];
		}

		this._rebuildIndex();

		const queryTokens = tokenize(query);
		if (queryTokens.length === 0) {
			return tools;
		}

		const scored: Array<{ tool: IToolData; score: number }> = [];

		for (const tool of tools) {
			const docTokens = tokenize(this._buildToolDocument(tool));
			const tf = computeTermFrequency(docTokens);
			let score = 0;
			for (const queryTerm of queryTokens) {
				const termTF = tf.find(t => t.term === queryTerm);
				if (termTF) {
					const idf = computeIDF(this._documentTokens, queryTerm);
					score += termTF.frequency * idf;
				}
			}
			if (score > 0) {
				scored.push({ tool, score });
			}
		}

		scored.sort((a, b) => b.score - a.score);
		return scored.map(s => s.tool);
	}

	private _buildToolDocument(tool: IToolData): string {
		return `${tool.name} ${tool.description} ${tool.keywords.join(' ')} ${tool.category}`;
	}

	private _rebuildIndex(): void {
		if (!this._dirty) {
			return;
		}
		this._documentTokens = this.getAll().map(t => tokenize(this._buildToolDocument(t)));
		this._dirty = false;
	}
}
