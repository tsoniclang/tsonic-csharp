import type {
  DotnetModuleModel,
} from "../model/index.js";
import type {
  DotnetProviderDiagnostic,
} from "../provider.js";
import type {
  DotnetProviderCacheRequest,
} from "./cache.js";

export interface DotnetReflectionProviderBroker {
  readModule(request: DotnetProviderCacheRequest): DotnetModuleModel | undefined;
  writeModule(request: DotnetProviderCacheRequest, module: DotnetModuleModel): void;
  readDiagnostic(request: DotnetProviderCacheRequest): DotnetProviderDiagnostic | undefined;
  writeDiagnostic(request: DotnetProviderCacheRequest, diagnostic: DotnetProviderDiagnostic): void;
}

export function createDotnetReflectionProviderBroker(): DotnetReflectionProviderBroker {
  const modules = new Map<string, DotnetModuleModel>();
  const diagnostics = new Map<string, DotnetProviderDiagnostic>();
  return {
    readModule(request): DotnetModuleModel | undefined {
      return modules.get(memoryKey(request));
    },
    writeModule(request, module): void {
      modules.set(memoryKey(request), module);
    },
    readDiagnostic(request): DotnetProviderDiagnostic | undefined {
      return diagnostics.get(memoryKey(request));
    },
    writeDiagnostic(request, diagnostic): void {
      diagnostics.set(memoryKey(request), diagnostic);
    },
  };
}

function memoryKey(request: DotnetProviderCacheRequest): string {
  return JSON.stringify(request);
}
