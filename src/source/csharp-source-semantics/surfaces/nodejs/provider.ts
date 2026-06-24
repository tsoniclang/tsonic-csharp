import type {
  ExtensionDiagnostic,
  ProviderDeclarationModel,
  ProviderExportDeclaration,
  ProviderModuleContext,
  ProviderModuleResolution,
  ProviderOwnership,
  ProviderSymbolIdentity,
  TargetBindingProvider,
  TargetIdentity,
} from "@tsonic/tsts";
import {
  csharpNodejsSurfaceProviderIdentity,
  csharpNodejsVirtualDeclarationFileName,
} from "./identity.js";
import {
  getNodejsTargetIdentity,
} from "./members.js";
import {
  nodeBufferExports,
  nodeBufferModuleSpecifier,
} from "./buffer.js";
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
import {
  canonicalNodejsModuleSpecifier,
  isSupportedNodejsModuleSpecifier,
} from "./module-specifiers.js";

const canonicalModules = new Map<string, readonly ProviderExportDeclaration[]>([
  [nodeBufferModuleSpecifier, nodeBufferExports()],
  [nodePathModuleSpecifier, nodePathExports()],
  [nodeFsModuleSpecifier, nodeFsExports()],
  [nodeCryptoModuleSpecifier, nodeCryptoExports()],
  [nodeOsModuleSpecifier, nodeOsExports()],
  [nodeProcessModuleSpecifier, nodeProcessExports()],
]);

export function createCsharpNodejsSurfaceBindingProvider(): TargetBindingProvider {
  return {
    identity: csharpNodejsSurfaceProviderIdentity,
    ownsModule(specifier: string, _context: ProviderModuleContext): ProviderOwnership {
      return isSupportedNodejsModuleSpecifier(specifier) ? { kind: "owned" } : { kind: "unowned" };
    },
    resolveModule(specifier: string, _context: ProviderModuleContext): ProviderModuleResolution | ExtensionDiagnostic {
      const canonicalSpecifier = canonicalNodejsModuleSpecifier(specifier);
      if (canonicalSpecifier === undefined) {
        return nodejsProviderDiagnostic("NODEJS_SURFACE_MODULE_UNOWNED", 9300001, `C# NodeJS surface provider does not own '${specifier}'.`);
      }
      return {
        kind: "virtual",
        moduleSpecifier: specifier,
        virtualFileName: csharpNodejsVirtualDeclarationFileName(specifier),
        providerModuleId: canonicalSpecifier,
        packageName: "node",
        evidence: [{ message: "C# NodeJS surface provider supplied virtual module." }],
      };
    },
    getDeclarationModel(module: ProviderModuleResolution): ProviderDeclarationModel | ExtensionDiagnostic {
      const canonicalSpecifier = canonicalNodejsModuleSpecifier(module.moduleSpecifier);
      const exports = canonicalSpecifier === undefined ? undefined : canonicalModules.get(canonicalSpecifier);
      return canonicalSpecifier === undefined || exports === undefined
        ? nodejsProviderDiagnostic("NODEJS_SURFACE_MODULE_MISSING", 9300002, `C# NodeJS surface provider has no declaration model for '${module.moduleSpecifier}'.`)
        : {
            moduleSpecifier: module.moduleSpecifier,
            providerModuleId: canonicalSpecifier,
            exports,
            evidence: [{ message: "C# NodeJS surface virtual declaration model." }],
          };
    },
    getTargetIdentity(symbol: ProviderSymbolIdentity): TargetIdentity | undefined {
      return getNodejsTargetIdentity(symbol);
    },
  };
}

function nodejsProviderDiagnostic(
  extensionCode: string,
  numericCode: number,
  message: string,
): ExtensionDiagnostic {
  return {
    extensionId: csharpNodejsSurfaceProviderIdentity.id,
    extensionCode,
    numericCode,
    category: "error",
    message,
  };
}
