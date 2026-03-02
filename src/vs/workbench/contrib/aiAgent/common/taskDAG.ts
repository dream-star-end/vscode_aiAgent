/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// -- Task Topology -------------------------------------------------------

export const enum TaskTopology {
	Simple = 'simple',
	Standard = 'standard',
	Complex = 'complex',
	Exploratory = 'exploratory',
}

// -- Task Status ---------------------------------------------------------

export const enum TaskStatus {
	Pending = 'pending',
	Running = 'running',
	Completed = 'completed',
	Failed = 'failed',
	Blocked = 'blocked',
}

// -- Task Result ---------------------------------------------------------

export interface TaskResult {
	readonly status: 'success' | 'failure';
	readonly output: string;
	readonly tokensUsed: number;
	readonly duration: number;
}

// -- Task Node -----------------------------------------------------------

export interface TaskNode {
	readonly id: string;
	readonly description: string;
	status: TaskStatus;
	readonly topology: TaskTopology;
	readonly dependencies: string[];
	result?: TaskResult;
}

// -- Serialization Types -------------------------------------------------

interface TaskDAGData {
	readonly nodes: TaskNode[];
	readonly edges: Array<{ from: string; to: string }>;
}

// -- Task DAG ------------------------------------------------------------

export class TaskDAG {

	private readonly _nodes = new Map<string, TaskNode>();
	private readonly _edges = new Map<string, Set<string>>();
	private readonly _reverseEdges = new Map<string, Set<string>>();

	addTask(task: TaskNode): void {
		this._nodes.set(task.id, task);
		if (!this._edges.has(task.id)) {
			this._edges.set(task.id, new Set());
		}
		if (!this._reverseEdges.has(task.id)) {
			this._reverseEdges.set(task.id, new Set());
		}
		for (const dep of task.dependencies) {
			this.addEdge(dep, task.id);
		}
	}

	addEdge(from: string, to: string): void {
		if (this._wouldCreateCycle(from, to)) {
			throw new Error(`Adding edge ${from} -> ${to} would create a cycle`);
		}

		let outgoing = this._edges.get(from);
		if (!outgoing) {
			outgoing = new Set();
			this._edges.set(from, outgoing);
		}
		outgoing.add(to);

		let incoming = this._reverseEdges.get(to);
		if (!incoming) {
			incoming = new Set();
			this._reverseEdges.set(to, incoming);
		}
		incoming.add(from);
	}

	getTask(taskId: string): TaskNode | undefined {
		return this._nodes.get(taskId);
	}

	getAllTasks(): TaskNode[] {
		return [...this._nodes.values()];
	}

	getNextRunnableTasks(maxConcurrent: number): TaskNode[] {
		const runnable: TaskNode[] = [];

		for (const node of this._nodes.values()) {
			if (runnable.length >= maxConcurrent) {
				break;
			}
			if (node.status !== TaskStatus.Pending) {
				continue;
			}
			if (this._allDependenciesMet(node.id)) {
				runnable.push(node);
			}
		}

		return runnable;
	}

	markComplete(taskId: string, result: TaskResult): void {
		const node = this._nodes.get(taskId);
		if (!node) {
			throw new Error(`Task not found: ${taskId}`);
		}
		node.status = TaskStatus.Completed;
		node.result = result;
		this._updateBlockedDependents(taskId);
	}

	markFailed(taskId: string, error: string): void {
		const node = this._nodes.get(taskId);
		if (!node) {
			throw new Error(`Task not found: ${taskId}`);
		}
		node.status = TaskStatus.Failed;
		node.result = {
			status: 'failure',
			output: error,
			tokensUsed: 0,
			duration: 0,
		};
		this._blockDependents(taskId);
	}

	markRunning(taskId: string): void {
		const node = this._nodes.get(taskId);
		if (!node) {
			throw new Error(`Task not found: ${taskId}`);
		}
		node.status = TaskStatus.Running;
	}

	hasRunnableTasks(): boolean {
		for (const node of this._nodes.values()) {
			if (node.status === TaskStatus.Pending && this._allDependenciesMet(node.id)) {
				return true;
			}
		}
		return false;
	}

	isComplete(): boolean {
		for (const node of this._nodes.values()) {
			if (node.status !== TaskStatus.Completed && node.status !== TaskStatus.Failed && node.status !== TaskStatus.Blocked) {
				return false;
			}
		}
		return true;
	}

	getCompletedCount(): number {
		let count = 0;
		for (const node of this._nodes.values()) {
			if (node.status === TaskStatus.Completed) {
				count++;
			}
		}
		return count;
	}

	getFailedCount(): number {
		let count = 0;
		for (const node of this._nodes.values()) {
			if (node.status === TaskStatus.Failed) {
				count++;
			}
		}
		return count;
	}

	getTotalTokensUsed(): number {
		let total = 0;
		for (const node of this._nodes.values()) {
			if (node.result) {
				total += node.result.tokensUsed;
			}
		}
		return total;
	}

	toJSON(): TaskDAGData {
		const nodes: TaskNode[] = [];
		for (const node of this._nodes.values()) {
			nodes.push({
				id: node.id,
				description: node.description,
				status: node.status,
				topology: node.topology,
				dependencies: [...node.dependencies],
				result: node.result,
			});
		}
		const edges: Array<{ from: string; to: string }> = [];
		for (const [from, tos] of this._edges) {
			for (const to of tos) {
				edges.push({ from, to });
			}
		}
		return { nodes, edges };
	}

	static fromJSON(data: TaskDAGData): TaskDAG {
		const dag = new TaskDAG();
		for (const node of data.nodes) {
			dag._nodes.set(node.id, {
				id: node.id,
				description: node.description,
				status: node.status,
				topology: node.topology,
				dependencies: [...node.dependencies],
				result: node.result,
			});
			if (!dag._edges.has(node.id)) {
				dag._edges.set(node.id, new Set());
			}
			if (!dag._reverseEdges.has(node.id)) {
				dag._reverseEdges.set(node.id, new Set());
			}
		}
		for (const edge of data.edges) {
			let outgoing = dag._edges.get(edge.from);
			if (!outgoing) {
				outgoing = new Set();
				dag._edges.set(edge.from, outgoing);
			}
			outgoing.add(edge.to);

			let incoming = dag._reverseEdges.get(edge.to);
			if (!incoming) {
				incoming = new Set();
				dag._reverseEdges.set(edge.to, incoming);
			}
			incoming.add(edge.from);
		}
		return dag;
	}

	private _allDependenciesMet(taskId: string): boolean {
		const incoming = this._reverseEdges.get(taskId);
		if (!incoming || incoming.size === 0) {
			return true;
		}
		for (const dep of incoming) {
			const depNode = this._nodes.get(dep);
			if (!depNode || depNode.status !== TaskStatus.Completed) {
				return false;
			}
		}
		return true;
	}

	private _updateBlockedDependents(taskId: string): void {
		const outgoing = this._edges.get(taskId);
		if (!outgoing) {
			return;
		}
		for (const dependentId of outgoing) {
			const dependent = this._nodes.get(dependentId);
			if (dependent && dependent.status === TaskStatus.Blocked && this._allDependenciesMet(dependentId)) {
				dependent.status = TaskStatus.Pending;
			}
		}
	}

	private _blockDependents(taskId: string): void {
		const outgoing = this._edges.get(taskId);
		if (!outgoing) {
			return;
		}
		for (const dependentId of outgoing) {
			const dependent = this._nodes.get(dependentId);
			if (dependent && dependent.status === TaskStatus.Pending) {
				dependent.status = TaskStatus.Blocked;
				this._blockDependents(dependentId);
			}
		}
	}

	private _wouldCreateCycle(from: string, to: string): boolean {
		if (from === to) {
			return true;
		}
		const visited = new Set<string>();
		const stack = [from];
		while (stack.length > 0) {
			const current = stack.pop()!;
			if (visited.has(current)) {
				continue;
			}
			visited.add(current);
			const incoming = this._reverseEdges.get(current);
			if (incoming) {
				for (const prev of incoming) {
					if (prev === to) {
						return true;
					}
					stack.push(prev);
				}
			}
		}
		return false;
	}
}
