import {
  TstsProviderContractVersion,
} from "@tsonic/tsts";
import type {
  ExtensionDiagnostic,
  ProviderDeclarationModel,
  ProviderIdentity,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  ProviderSymbolIdentity,
  TargetBindingProvider,
  TargetIdentity,
} from "@tsonic/tsts";
import {
  csharpProviderVersion,
  csharpTargetId,
} from "../../identity.js";
import {
  nodeCryptoExports,
  nodeCryptoModuleSpecifier,
} from "./crypto.js";
import {
  nodeFsExports,
  nodeFsModuleSpecifier,
} from "./filesystem.js";
import {
  nodeOsExports,
  nodeOsModuleSpecifier,
} from "./os.js";
import {
  nodePathExports,
  nodePathModuleSpecifier,
} from "./path.js";
import {
  nodeProcessExports,
  nodeProcessModuleSpecifier,
} from "./process.js";

const providerIdentity = {
  id: "tsonic.csharp.nodejs-surface-provider",
  version: csharpProviderVersion,
  target: csharpTargetId,
  extensionContractVersion: TstsProviderContractVersion,
  providerKind: "binding",
  displayName: "Tsonic C# NodeJS surface provider",
} satisfies ProviderIdentity;

const supportedModules = new Map<string, ProviderDeclarationModel>([
  [nodePathModuleSpecifier, {
    moduleSpecifier: nodePathModuleSpecifier,
    providerModuleId: nodePathModuleSpecifier,
    exports: nodePathExports(),
    evidence: [{ message: "C# NodeJS surface virtual declaration model." }],
  }],
  [nodeFsModuleSpecifier, {
    moduleSpecifier: nodeFsModuleSpecifier,
    providerModuleId: nodeFsModuleSpecifier,
    exports: nodeFsExports(),
    evidence: [{ message: "C# NodeJS surface virtual declaration model." }],
  }],
  [nodeCryptoModuleSpecifier, {
    moduleSpecifier: nodeCryptoModuleSpecifier,
    providerModuleId: nodeCryptoModuleSpecifier,
    exports: nodeCryptoExports(),
    evidence: [{ message: "C# NodeJS surface virtual declaration model." }],
  }],
  [nodeOsModuleSpecifier, {
    moduleSpecifier: nodeOsModuleSpecifier,
    providerModuleId: nodeOsModuleSpecifier,
    exports: nodeOsExports(),
    evidence: [{ message: "C# NodeJS surface virtual declaration model." }],
  }],
  [nodeProcessModuleSpecifier, {
    moduleSpecifier: nodeProcessModuleSpecifier,
    providerModuleId: nodeProcessModuleSpecifier,
    exports: nodeProcessExports(),
    evidence: [{ message: "C# NodeJS surface virtual declaration model." }],
  }],
]);

export function createCsharpNodejsSurfaceBindingProvider(): TargetBindingProvider {
  return {
    identity: providerIdentity,
    ownsModule(specifier: string, _context: ProviderModuleContext): ProviderOwnership {
      return supportedModules.has(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    resolveModule(specifier: string, _context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      if (!supportedModules.has(specifier)) {
        return nodejsProviderDiagnostic("NODEJS_SURFACE_MODULE_UNOWNED", 9300001, `C# NodeJS surface provider does not own '${specifier}'.`);
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: `tsts-provider://csharp-nodejs/${specifier}`,
        providerModuleId: specifier,
        packageName: "node",
        evidence: [{ message: "C# NodeJS surface provider supplied virtual module." }],
      };
    },
    getDeclarationModel(module: ProviderModuleResolution): ProviderDeclarationModel | ExtensionDiagnostic {
      return supportedModules.get(module.moduleSpecifier) ??
        nodejsProviderDiagnostic("NODEJS_SURFACE_MODULE_MISSING", 9300002, `C# NodeJS surface provider has no declaration model for '${module.moduleSpecifier}'.`);
    },
    getTargetIdentity(_symbol: ProviderSymbolIdentity): TargetIdentity | undefined {
      return undefined;
    },
  };
}

function nodejsProviderDiagnostic(
  extensionCode: string,
  numericCode: number,
  message: string,
): ExtensionDiagnostic {
  return {
    extensionId: providerIdentity.id,
    extensionCode,
    numericCode,
    category: "error",
    message,
  };
}
