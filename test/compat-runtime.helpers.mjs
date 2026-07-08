import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ExtensionLifecycleEvent,
  createCompilerSessionFromFiles,
  formatDiagnostics,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import { createTsonicCoreSourceExtension } from "@tsonic/source-core";
import {
  createCsharpSourceSemanticsExtension,
  createCsharpTargetSemanticsExtension,
} from "../dist/index.js";
import {
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  csharpJsSourceProfileOwnerId,
  csharpJsSurfaceSourceProfileContributions,
  csharpSourceProfileContributions,
  csharpSourceProfileOwnerId,
} from "../dist/source/csharp-source-semantics/source-profile-declarations.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../dist/options/csharp-target-options.js";
export { test, assert, ExtensionLifecycleEvent, createCompilerSessionFromFiles, formatDiagnostics, runtimeCarrierFactKey, selectedTargetSignatureFactKey, createTsonicCoreSourceExtension, createCsharpSourceSemanticsExtension, createCsharpTargetSemanticsExtension, csharpTargetOperationFactKey, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, readCsharpTypescriptCompatibilityMode };






















export function createNativeSession(sourceText, targetOptions = {}, extraExtensions = [], options = {}) {
  const sourceProfile = options.sourceProfile ?? "csharp";
  const context = csharpProviderContext(targetOptions, sourceProfile);
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ...sourceProfileFiles(sourceProfile).map((file) => [file.path, file.text]),
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
      target: "es2022",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createTsonicCoreSourceExtension(),
        createCsharpSourceSemanticsExtension(context),
        ...extraExtensions,
        createCsharpTargetSemanticsExtension(context),
      ],
    },
  });
}

export function sourceProfileFiles(sourceProfile) {
  if (sourceProfile === "js") {
    return declarationFiles(
      csharpJsSourceProfileOwnerId,
      csharpJsSurfaceSourceProfileContributions().declarations ?? [],
    );
  }
  return declarationFiles(
    csharpSourceProfileOwnerId,
    csharpSourceProfileContributions(csharpProviderContext({}, "csharp")).declarations ?? [],
  );
}

export function declarationFiles(ownerId, declarations) {
  return declarations.map((declaration) => ({
    path: `/src/.tsonic/source-profiles/${ownerId}/${declaration.fileName}`,
    text: declaration.text,
  }));
}

export function createTestDynamicOperationFactExtension(kindName, options = {}) {
  return {
    identity: {
      id: `test.compat.dynamic-operation-facts.${kindName}`,
      version: "1.0.0",
      capabilityNamespace: "test.compat",
    },
    initialize(context) {
      context.registerLifecycleHook(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        const compiler = lifecycleContext.compiler;
        if (compiler === undefined) {
          return;
        }
        for (const sourceFile of compiler.getSourceFiles()) {
          if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
            continue;
          }
          const nodes = collectNodesByKind(sourceFile, compiler.ast, kindName).filter((node) =>
            options.skipAssignment !== true ||
            node.OperatorToken === undefined ||
            compiler.ast.kindName(node.OperatorToken) !== "KindEqualsToken"
          );
          for (const [index, node] of nodes.entries()) {
            const carrier = options.closedCompatCarrier === false
              ? undefined
              : compatCarrier(options.carrierIds?.[index] ?? options.carrierId);
            lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, {
              kind: "member",
              operationId: "test.compat.any.dynamic-get",
              operationKind: "method",
              memberName: "ReadDynamicSlot",
              declaringType: carrier,
              resultType: options.closedCompatCarrier === false ? { kind: "opaque", id: "any" } : carrier,
            }, [{ message: "Test-only closed compat carrier operation fact." }]);
          }
        }
      });
    },
  };
}

export function tsValueCarrier() {
  return compatCarrier();
}

export function compatCarrier(id = "Tsonic.CSharp.Js.TsValue") {
  const segments = id.split(".");
  return {
    kind: "target-named",
    id,
    csharpRender: { kind: "named", namespace: segments.slice(0, -1), name: segments.at(-1) },
  };
}

export function createTestSelectedSignatureOnlyExtension(kindName) {
  return {
    identity: {
      id: "test.compat.selected-signature-only",
      version: "1.0.0",
      capabilityNamespace: "test.compat",
    },
    initialize(context) {
      context.registerLifecycleHook(ExtensionLifecycleEvent.beforeSemanticsFinalized, (_request, lifecycleContext) => {
        const compiler = lifecycleContext.compiler;
        if (compiler === undefined) {
          return;
        }
        for (const sourceFile of compiler.getSourceFiles()) {
          if (sourceFile === undefined || sourceFile.IsDeclarationFile === true) {
            continue;
          }
          for (const node of collectNodesByKind(sourceFile, compiler.ast, kindName)) {
            lifecycleContext.host.facts.set(node, selectedTargetSignatureFactKey, {
              member: {
                id: "test.compat.any.unclosed-signature",
                sourceName: "name",
                targetName: "ReadDynamicSlot",
                kind: "method",
                parameters: [],
                returnType: { kind: "type-parameter", name: "T" },
              },
            }, [{ message: "Test-only unclosed selected signature fact without a finalized C# operation." }]);
          }
        }
      });
    },
  };
}

export function csharpProviderContext(targetOptions, sourceProfile = "csharp") {
  const target = {
    id: "csharp",
    ...(Object.keys(targetOptions).length === 0 ? {} : { options: targetOptions }),
  };
  return {
    project: {
      entryPoint: "index.ts",
      targets: [target],
    },
    target,
    selectedPackages: [],
    selectedSurfaces: sourceProfile === "js" ? [{ id: csharpJsSourceProfileOwnerId }] : [],
  };
}

export function expectedOpaqueAnyOperationMessages(compatibilityMode) {
  const suffix = compatibilityMode === "strict-native"
    ? "uses TypeScript any in strict-native mode."
    : "uses TypeScript any in compatibility mode without finalized target operation facts.";
  return [
    "C# property access emission",
    "C# property access emission",
    "C# element access emission",
    "C# call emission",
    "C# construct emission",
    "C# '+' operator emission",
    "C# 'void' operator emission",
  ].map((description) => `${description} ${suffix}`);
}

export function assertAnyDiagnosticMessages(extensionHost, expectedMessages) {
  assert.deepEqual(
    sortedMessages(anyOperationDiagnostics(extensionHost).map((diagnostic) => diagnostic.message)),
    sortedMessages(expectedMessages),
  );
}

export function sortedMessages(messages) {
  return [...messages].sort((left, right) => left.localeCompare(right));
}

export function anyOperationDiagnostics(extensionHost) {
  return extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED"
  );
}

export function compatRuntimeDiagnostics(extensionHost) {
  return extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_COMPAT_RUNTIME_OPERATION_UNSUPPORTED"
  );
}

export function collectIdentifiersByText(sourceFile, ast, text) {
  const nodes = [];
  visit(sourceFile);
  return nodes;

  function visit(node) {
    if (ast.kindName(node) === "KindIdentifier" && ast.text(node) === text) {
      nodes.push(node);
    }
    ast.forEachChild(node, visit);
  }
}

export function collectNodesByKind(sourceFile, ast, kindName) {
  const nodes = [];
  visit(sourceFile);
  return nodes;

  function visit(node) {
    if (ast.kindName(node) === kindName) {
      nodes.push(node);
    }
    ast.forEachChild(node, visit);
  }
}
