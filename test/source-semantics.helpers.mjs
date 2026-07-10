import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TstsProviderContractVersion,
  argumentPassingFactKey,
  attributeFactKey,
  createCompilerSessionFromFiles,
  defaultValueFactKey,
  fieldFactKey,
  flowStateFactKey,
  functionPointerFactKey,
  formatDiagnostics,
  pointerFactKey,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  sourcePrimitiveFactKey,
  structFactKey,
  targetConversionFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import {
  createCsharpTargetSemanticsExtension,
  createCsharpSourceSemanticsExtension,
} from "../dist/index.js";
import {
  csharpJsSourceProfileOwnerId,
  csharpJsSurfaceSourceProfileContributions,
  csharpSourceProfileContributions,
  csharpSourceProfileOwnerId,
} from "../dist/source/csharp-source-semantics/source-profile-declarations.js";
import {
  createTsonicCoreSourceExtension,
  providerExportDeclarationsForSourceModule,
  tsonicCoreSourceSemanticsModules,
} from "@tsonic/source-core";
import {
  csharpArrayBoundaryFactKey,
  csharpObjectShapeFactKey,
  csharpAttributeApplicationFactKey,
  csharpTargetOperationFactKey,
  csharpTargetConversionOperationFactKey,
} from "../dist/source/csharp-facts.js";
import { csharpSourceSemanticsModules } from "../dist/source/csharp-source-semantics/source-modules.js";
import { createCsharpSourceVirtualModulesProvider } from "../dist/source/csharp-source-semantics/source-virtual-modules.js";
export { test, assert, TstsProviderContractVersion, argumentPassingFactKey, attributeFactKey, createCompilerSessionFromFiles, defaultValueFactKey, fieldFactKey, flowStateFactKey, functionPointerFactKey, formatDiagnostics, pointerFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetConversionFactKey, targetOperationFactKey, createCsharpTargetSemanticsExtension, createCsharpSourceSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, createTsonicCoreSourceExtension, providerExportDeclarationsForSourceModule, tsonicCoreSourceSemanticsModules, csharpArrayBoundaryFactKey, csharpObjectShapeFactKey, csharpAttributeApplicationFactKey, csharpTargetOperationFactKey, csharpTargetConversionOperationFactKey, csharpSourceSemanticsModules, createCsharpSourceVirtualModulesProvider };









































export function collectFacts(sourceFile, ast, extensionHost) {
  const facts = [];
  visit(sourceFile);
  return facts;

  function visit(node) {
    const fact = extensionHost.facts.get(node, attributeFactKey);
    if (fact !== undefined) {
      facts.push(fact);
    }
    ast.forEachChild(node, visit);
  }
}

export function collectFactsForKey(sourceFile, ast, extensionHost, key) {
  const facts = [];
  visit(sourceFile);
  return facts;

  function visit(node) {
    const fact = extensionHost.facts.get(node, key);
    if (fact !== undefined) {
      facts.push({ node, fact });
    }
    ast.forEachChild(node, visit);
  }
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

export function collectCallsByCalleeText(sourceFile, ast, text) {
  return collectNodesByKind(sourceFile, ast, "KindCallExpression")
    .filter((node) => calleeText(node, ast) === text);
}

export function collectCallsByCalleeExpressionText(sourceFile, ast, text) {
  return collectNodesByKind(sourceFile, ast, "KindCallExpression")
    .filter((node) => expressionText(node.Expression, ast) === text);
}

export function collectTypeReferencesByText(sourceFile, ast, text) {
  return collectNodesByKind(sourceFile, ast, "KindTypeReference")
    .filter((node) => typeReferenceText(node.TypeName, ast) === text);
}

export function typeAliasTypeNode(session, typeAliasDeclaration) {
  const typeNode = session.ast.as.AsTypeAliasDeclaration(typeAliasDeclaration)?.Type;
  assert.ok(typeNode !== undefined, `Missing type node for alias ${session.ast.text(session.ast.name(typeAliasDeclaration))}`);
  return typeNode;
}

export function calleeText(callExpression, ast) {
  const expression = callExpression?.Expression;
  if (expression === undefined) {
    return undefined;
  }
  const kind = ast.kindName(expression);
  if (kind === "KindIdentifier") {
    return ast.text(expression);
  }
  if (kind === "KindPropertyAccessExpression") {
    return ast.text(ast.name(expression));
  }
  return undefined;
}

export function expressionText(node, ast) {
  if (node === undefined) {
    return undefined;
  }
  const kind = ast.kindName(node);
  if (kind === "KindIdentifier") {
    return ast.text(node);
  }
  if (kind === "KindPropertyAccessExpression") {
    const receiver = expressionText(node.Expression, ast);
    const name = ast.text(ast.name(node));
    return receiver === undefined || receiver === "" ? name : `${receiver}.${name}`;
  }
  return ast.text(ast.name(node) ?? node);
}

export function typeReferenceText(node, ast) {
  if (node === undefined) {
    return undefined;
  }
  if (ast.kindName(node) === "KindQualifiedName") {
    const left = typeReferenceText(node.Left, ast);
    const right = typeReferenceText(node.Right, ast);
    return left === undefined || left === "" ? right : `${left}.${right}`;
  }
  return ast.text(node);
}

export function argumentPassingFactForCall(sourceFile, ast, extensionHost, callee, index) {
  const call = collectCallsByCalleeText(sourceFile, ast, callee)[index];
  const fact = extensionHost.facts.get(call, argumentPassingFactKey);
  return {
    mode: fact?.mode,
    targetKind: ast.kindName(fact?.targetExpression),
  };
}

export function primitiveSummary(fact) {
  return fact === undefined
    ? undefined
    : {
        kind: fact.kind,
        runtimeBase: fact.runtimeBase,
        ...(fact.signed === undefined ? {} : { signed: fact.signed }),
        ...(fact.width === undefined ? {} : { width: fact.width }),
      };
}

export function assertNoExtensionDiagnostics(extensionHost) {
  const diagnostics = extensionHost.diagnostics.all();
  assert.equal(extensionDiagnosticSummary(diagnostics), "");
}

function extensionDiagnosticSummary(diagnostics) {
  return diagnostics.map((diagnostic) =>
    `${diagnostic.extensionCode ?? "UNKNOWN"}: ${diagnostic.message}`,
  ).join("\n");
}

export function packageJson(name, exports) {
  return JSON.stringify({
    name,
    version: "1.0.0",
    type: "module",
    exports: Object.fromEntries(Object.entries(exports).map(([subpath, target]) => [
      subpath,
      { types: target.replace(/\.js$/, ".d.ts"), default: target },
    ])),
  });
}

export function csharpTestExtensions(...extensions) {
  return [
    createTsonicCoreSourceExtension(),
    ...extensions,
  ];
}

export function csharpProviderContext(options = {}) {
  const target = {
    id: "csharp",
    ...(options.typescriptCompatibility === undefined
      ? {}
      : { options: { typescriptCompatibility: options.typescriptCompatibility } }),
  };
  return {
    project: {
      entryPoint: "index.ts",
      targets: [target],
    },
    target,
    selectedPackages: [],
    selectedSurfaces: [],
  };
}

export function csharpSourceProfileFiles() {
  const declarations = csharpSourceProfileContributions({
    project: { entryPoint: "index.ts", rootDir: ".", targets: [] },
    target: { id: "csharp" },
    targetPack: { id: "csharp", displayName: "C#" },
    selectedCapabilities: [],
    selectedSurfaces: [],
  }).declarations ?? [];
  return declarations.map((declaration) => ({
    path: `/src/.tsonic/source-profiles/${csharpSourceProfileOwnerId}/${declaration.fileName}`,
    text: declaration.text,
  }));
}

export function csharpJsSourceProfileFiles() {
  const declarations = csharpJsSurfaceSourceProfileContributions().declarations ?? [];
  return declarations.map((declaration) => ({
    path: `/src/.tsonic/source-profiles/${csharpJsSourceProfileOwnerId}/${declaration.fileName}`,
    text: declaration.text,
  }));
}

export function createAttributeProviderExtension() {
  const moduleSpecifier = "@example/attributes/index.js";
  const attributeNames = ["NonSerializedAttribute", "ObsoleteAttribute", "SerializableAttribute"];
  return {
    identity: {
      id: "example-csharp-attributes-extension",
      version: "1.0.0",
      capabilityNamespace: "example.csharp.attributes",
    },
    initialize(context) {
      context.registerTargetBindingProvider({
        identity: {
          id: "example-csharp-attributes-provider",
          version: "1.0.0",
          target: "csharp",
          extensionContractVersion: TstsProviderContractVersion,
          providerKind: "binding",
        },
        ownsModule(candidate) {
          return candidate === moduleSpecifier ? { kind: "owned" } : { kind: "unowned" };
        },
        resolveModule(candidate) {
          return {
            kind: "virtual",
            moduleSpecifier: candidate,
            virtualFileName: "tsts-provider://example-csharp/attributes.d.ts",
            providerModuleId: "example.csharp.attributes",
            packageName: "@example/attributes",
            packageVersion: "1.0.0",
          };
        },
        getDeclarationModel(resolution) {
          return {
            moduleSpecifier: resolution.moduleSpecifier,
            providerModuleId: resolution.providerModuleId,
            exports: attributeNames.map((name) => ({
              id: name,
              name,
              kind: "class",
              targetIdentity: {
                target: "csharp",
                id: `System.${name}`,
                displayName: `System.${name}`,
              },
              members: [],
            })),
          };
        },
        getTargetIdentity(symbol) {
          return symbol.moduleSpecifier === moduleSpecifier && attributeNames.includes(symbol.exportName)
            ? {
                target: "csharp",
                id: `System.${symbol.exportName}`,
                displayName: `System.${symbol.exportName}`,
              }
            : undefined;
        },
      });
    },
  };
}
