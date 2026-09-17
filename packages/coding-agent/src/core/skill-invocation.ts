export interface SkillInvocationPromptSkill {
	name: string;
	filePath: string;
	baseDir: string;
	body: string;
}

/** Format the user-attributed payload for one or more explicit skill invocations. */
export function formatSkillInvocationPrompt(
	skills: readonly SkillInvocationPromptSkill[],
	userRequest?: string,
): string {
	const skillBlocks = skills.map(
		(skill) =>
			`The user explicitly invoked the "${skill.name}" skill. Follow the instructions in <skill-instruction> as binding for this request, while respecting higher-priority instructions.\n\n<skill-instruction name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.body}\n</skill-instruction>`,
	);
	const expandedSkills = skillBlocks.join("\n\n");
	return userRequest && /\S/.test(userRequest)
		? `${expandedSkills}\n\n<user-request>\n${userRequest}\n</user-request>`
		: expandedSkills;
}

/** Parsed skill block from a user message */
export interface ParsedSkillBlock {
	name: string;
	location: string;
	content: string;
	userMessage: string | undefined;
}

/**
 * Parse a skill block from message text.
 * Returns null if the text doesn't contain a skill block.
 */
export function parseSkillBlock(text: string): ParsedSkillBlock | null {
	const instructionPattern =
		/^The user explicitly invoked the "([^"]+)" skill\. Follow the instructions in <skill-instruction> as binding for this request, while respecting higher-priority instructions\.\n\n<skill-instruction name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill-instruction>/;
	const instructionMatch = text.match(instructionPattern);
	if (instructionMatch) {
		if (instructionMatch[1] !== instructionMatch[2]) return null;
		let remainder = text.slice(instructionMatch[0].length);
		while (remainder.startsWith("\n\nThe user explicitly invoked the ")) {
			const chainedMatch = remainder.slice(2).match(instructionPattern);
			if (!chainedMatch || chainedMatch[1] !== chainedMatch[2]) return null;
			remainder = remainder.slice(chainedMatch[0].length + 2);
		}
		const requestMatch = remainder.match(/^\n\n<user-request>\n([\s\S]*?)\n<\/user-request>$/);
		if (remainder && !requestMatch) return null;
		return {
			name: instructionMatch[1],
			location: instructionMatch[3],
			content: instructionMatch[4],
			userMessage: requestMatch?.[1].trim() || undefined,
		};
	}

	const legacyMatch = text.match(
		/^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]+))?$/,
	);
	if (!legacyMatch) return null;
	return {
		name: legacyMatch[1],
		location: legacyMatch[2],
		content: legacyMatch[3],
		userMessage: legacyMatch[4]?.trim() || undefined,
	};
}

export type SkillInvocationSyntax = "dollar" | "slash";

export interface SkillInvocationToken {
	name: string;
	syntax: SkillInvocationSyntax;
	start: number;
	end: number;
	position: "inline" | "leading";
}

export const MAX_SKILL_INVOCATION_TOKENS_PER_PROMPT = 64;

const LEADING_SKILL_INVOCATION_PATTERN = /^(?:\/skill:([a-zA-Z][a-zA-Z0-9:_-]*)|\$([a-zA-Z][a-zA-Z0-9:_-]*))(?=\s|$)/;
const INLINE_DOLLAR_SKILL_INVOCATION_PATTERN = /(^|\s)\$skill:([a-zA-Z][a-zA-Z0-9:_-]*)(?=\s|$)/g;

/**
 * Find explicit skill invocation tokens without treating ordinary inline dollar
 * prose (for example `$HOME`) as executable.
 *
 * Leading runs accept `/skill:name`, `$name`, and `$skill:name`. Outside the
 * leading run only the desktop's explicit `$skill:name` token is executable.
 */
export function parseSkillInvocationTokens(text: string): SkillInvocationToken[] {
	const tokens: SkillInvocationToken[] = [];
	let cursor = 0;

	while (cursor < text.length) {
		while (cursor < text.length && /\s/.test(text[cursor]!)) cursor++;
		const match = text.slice(cursor).match(LEADING_SKILL_INVOCATION_PATTERN);
		if (!match) break;
		const syntax: SkillInvocationSyntax = match[1] ? "slash" : "dollar";
		const dollarName = match[2];
		const name = match[1] ?? (dollarName?.startsWith("skill:") ? dollarName.slice("skill:".length) : dollarName);
		if (!name) break;
		tokens.push({
			name,
			syntax,
			start: cursor,
			end: cursor + match[0].length,
			position: "leading",
		});
		if (tokens.length >= MAX_SKILL_INVOCATION_TOKENS_PER_PROMPT) return tokens;
		cursor += match[0].length;
	}

	INLINE_DOLLAR_SKILL_INVOCATION_PATTERN.lastIndex = cursor;
	for (const match of text.matchAll(INLINE_DOLLAR_SKILL_INVOCATION_PATTERN)) {
		const start = (match.index ?? 0) + match[1].length;
		tokens.push({
			name: match[2],
			syntax: "dollar",
			start,
			end: start + `$skill:${match[2]}`.length,
			position: "inline",
		});
		if (tokens.length >= MAX_SKILL_INVOCATION_TOKENS_PER_PROMPT) break;
	}

	return tokens;
}

function stripLeadingInvocationSeparators(text: string): string {
	let cursor = 0;
	while (text[cursor] === " " || text[cursor] === "\t") cursor++;
	while (text[cursor] === "\n" || (text[cursor] === "\r" && text[cursor + 1] === "\n")) {
		cursor += text[cursor] === "\r" ? 2 : 1;
		const lineStart = cursor;
		while (text[cursor] === " " || text[cursor] === "\t") cursor++;
		if (text[cursor] !== "\n" && !(text[cursor] === "\r" && text[cursor + 1] === "\n")) {
			return text.slice(lineStart);
		}
	}
	return text.slice(cursor);
}

export function removeSkillInvocationTokens(text: string, tokens: readonly SkillInvocationToken[]): string {
	let cursor = 0;
	let result = "";
	for (const token of tokens) {
		result += text.slice(cursor, token.start);
		if (token.position === "inline") result += `[skill: ${token.name}]`;
		cursor = token.end;
		if (
			token.position === "inline" &&
			(result.endsWith(" ") || result.endsWith("\t")) &&
			(text[cursor] === " " || text[cursor] === "\t")
		) {
			cursor++;
		}
	}
	result += text.slice(cursor);
	return tokens.some((token) => token.position === "leading") ? stripLeadingInvocationSeparators(result) : result;
}

/** Caps explicit skill expansion so one prompt cannot consume unbounded context. */
export const MAX_SKILL_EXPANSIONS_PER_PROMPT = 5;
