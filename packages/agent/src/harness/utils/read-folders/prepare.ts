import { languageForPath, READ_FOLDER_SELECTION } from "./index.ts";
import type { TreeSitterFolderOptions } from "./tree-sitter/engine.ts";
import type { TreeSitterLanguage } from "./tree-sitter/syntax.ts";
import type { ReadFolder } from "./types.ts";

export type PrepareReadFolderOptions = Omit<TreeSitterFolderOptions, "fallback">;

/**
 * Resolve the folder a default read must use for this path. Only a language the frozen selection
 * binds to `wasm` loads a grammar, lazily and once; every other language keeps the folder it was
 * given, and a grammar that is absent or unusable keeps it too.
 */
export async function prepareReadFolder(
	path: string,
	folder: ReadFolder | undefined,
	options: PrepareReadFolderOptions = {},
): Promise<ReadFolder | undefined> {
	if (!folder) return folder;
	const language = languageForPath(path);
	if (!language || READ_FOLDER_SELECTION.languages[language] !== "wasm") return folder;
	try {
		const { loadTreeSitterFolder } = await import("./tree-sitter/engine.ts");
		return (await loadTreeSitterFolder(language as TreeSitterLanguage, { ...options, fallback: folder })) ?? folder;
	} catch {
		return folder;
	}
}
