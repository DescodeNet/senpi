import { AsyncLocalStorage } from "node:async_hooks";
import type { KernelToolsCapability } from "@code-yeongyu/senpi-codemode";

export type { KernelToolsCapability };
export type ExtensionKernelTools = KernelToolsCapability;
export type {
	KernelToolsCapabilities,
	KernelToolsInvokeOptions,
	KernelToolsInvokeRequest,
} from "@code-yeongyu/senpi-codemode";

export const kernelToolsStorage = new AsyncLocalStorage<ExtensionKernelTools>();
