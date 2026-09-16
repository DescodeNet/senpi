import { READ_FOLD_SETTINGS, selectedReadFolder } from "../../../../src/harness/utils/read-folders/index.ts";
import { loadTreeSitterFolder } from "../../../../src/harness/utils/read-folders/tree-sitter/engine.ts";
import type { TreeSitterLanguage } from "../../../../src/harness/utils/read-folders/tree-sitter/syntax.ts";
import type { ReadFolder } from "../../../../src/harness/utils/read-folders/types.ts";
import { createSegmentedReadView } from "../../../../src/harness/utils/segmented-read-view.ts";
import type { Prototype } from "./heuristic.ts";
import type { Fold } from "./scorer.ts";

const evaluated: readonly TreeSitterLanguage[] = ["ts", "tsx", "js"];
const folders = new Map<TreeSitterLanguage, Promise<ReadFolder | undefined>>();

export function isWasmCandidateLanguage(language: string): language is TreeSitterLanguage {
	return (evaluated as readonly string[]).includes(language);
}

/** The grammar candidate under the shipped view, measured exactly like the heuristic candidate. */
export async function wasmCandidate(
	path: string,
	source: string,
	language: string,
): Promise<(Prototype & { readonly discoveredFolds: readonly Fold[] }) | undefined> {
	if (!isWasmCandidateLanguage(language)) return undefined;
	const pending =
		folders.get(language) ??
		loadTreeSitterFolder(language, { fallback: selectedReadFolder, cache: false }).catch(() => undefined);
	folders.set(language, pending);
	const folder = await pending;
	if (!folder) return undefined;
	const parsed = folder.fold({ path, text: source, settings: READ_FOLD_SETTINGS });
	const view = createSegmentedReadView({ text: source, parsed });
	const queue = parsed.status === "parsed" ? [...parsed.ranges] : [];
	for (let index = 0; index < queue.length; index++) queue.push(...queue[index].children);
	const discoveredFolds = queue.map((range) => ({ start: range.startLine, end: range.endLine }));
	if (view.status === "summary")
		return {
			discoveredFolds,
			text: view.rendered.text,
			folds: view.rendered.elidedRanges.map((range) => ({ start: range.startLine, end: range.endLine })),
			reason: "folded",
			scanned_folds: queue.length,
		};
	const reason = parsed.status === "parse_failure" ? parsed.reason : view.reason;
	return { discoveredFolds, text: source, folds: [], reason, fallback_reason: reason, scanned_folds: queue.length };
}
