import type { KernelToolErrorCode, KernelToolHostDenial, KernelToolHostDenialReason } from "./kernel-tools-errors.ts";

export type { KernelToolErrorCode, KernelToolHostDenial, KernelToolHostDenialReason };

export type KernelToolDescriptor = {
	readonly name: string;
	readonly description: string;
	readonly input_schema: unknown;
	readonly language: "js";
	readonly kernel_generation: number;
	readonly definition_revision: number;
};

export type KernelToolsInvokeRequest = {
	readonly name: string;
	readonly kernel_generation: number;
	readonly definition_revision: number;
	readonly args: unknown;
	readonly call_id: string;
};

export type KernelToolsDescribeEntry =
	| { readonly name: string; readonly ok: true; readonly descriptor: KernelToolDescriptor }
	| {
			readonly name: string;
			readonly ok: false;
			readonly error: { readonly code: KernelToolErrorCode; readonly message: string };
	  };

export type KernelToolsDescribeResult = {
	readonly results: readonly KernelToolsDescribeEntry[];
};

/**
 * Host tools a kernel-tool invocation's nested calls may reach: `allow` narrows to exactly those
 * names, `deny` refuses the named ones, and `deny` wins where both name the same tool.
 */
export type KernelToolsHostScope = {
	readonly allow?: readonly string[];
	readonly deny?: readonly string[];
};

/** Execution scope for one `invoke`; never persisted, dropped when that call settles (#1731). */
export type KernelToolsInvokeScope = {
	readonly tools?: KernelToolsHostScope;
};

export type KernelToolsInvokeOptions = {
	readonly signal?: AbortSignal;
	readonly scope?: KernelToolsInvokeScope;
};

/** Stable capability markers a consumer gates on before sending an option this runtime may not know. */
export type KernelToolsCapabilities = {
	readonly invokeScope: true;
};

export const KERNEL_TOOLS_CAPABILITIES: KernelToolsCapabilities = Object.freeze({ invokeScope: true });

export type KernelToolsCapability = {
	readonly capabilities: KernelToolsCapabilities;
	describe(names: readonly string[]): Promise<KernelToolsDescribeResult>;
	invoke(request: KernelToolsInvokeRequest, options?: AbortSignal | KernelToolsInvokeOptions): Promise<unknown>;
};

export const KERNEL_TOOLS_UNSUPPORTED = {
	code: "tools_unavailable" as const,
	message: "Kernel tools require a live JavaScript worker context",
};
