import assert from "node:assert/strict";
import test from "node:test";

import {
  formatDiagnostics,
  runtimeCarrierFactKey,
  targetBindingFactKey,
} from "@tsonic/tsts";
import {
  csharpRuntimeCarrierFactKey,
} from "../dist/source/csharp-facts.js";
import {
  createCsharpSourceSemanticsExtension,
  createCsharpTargetSemanticsExtension,
} from "../dist/index.js";
import {
  createDotnetReflectionTypeDataProvider,
} from "../dist/providers/dotnet/index.js";
import {
  collectTypeReferencesByText,
  csharpProviderContext,
  csharpSourceProfileFiles,
  csharpTestExtensions,
  createCompilerSessionFromFiles,
  packageJson,
} from "./source-semantics.helpers.mjs";

test(".NET provider source refs use public type-family exports for every concrete arity", () => {
  const provider = createDotnetReflectionTypeDataProvider({ disablePersistentCache: true });
  const modules = [
    requireModule(provider.getModule("@tsonic/dotnet/System.js", { requestedExports: ["Int32"] })),
    requireModule(provider.getModule("@tsonic/dotnet/System.Threading.Tasks.js", { requestedExports: ["TaskFactory"] })),
  ];

  const observedPublicFamilies = new Set();
  for (const module of modules) {
    const concreteVariantNames = new Map(module.exports
      .filter((declaration) =>
        declaration.kind === "type" &&
        declaration.sourceTypeFamily !== undefined &&
        declaration.sourceName !== declaration.sourceTypeFamily.exportName)
      .map((declaration) => [declaration.sourceName, declaration.sourceTypeFamily.exportName]));
    const providerRefs = collectProviderRefs(module);
    const illegalConcreteRefs = providerRefs
      .filter((reference) => reference.moduleSpecifier === module.moduleSpecifier && concreteVariantNames.has(reference.exportName))
      .map((reference) => ({
        exportName: reference.exportName,
        expectedPublicExport: concreteVariantNames.get(reference.exportName),
      }));
    assert.deepEqual(illegalConcreteRefs, []);
    for (const reference of providerRefs) {
      if (reference.moduleSpecifier !== module.moduleSpecifier) continue;
      if ([...concreteVariantNames.values()].includes(reference.exportName)) {
        observedPublicFamilies.add(reference.exportName);
      }
    }
  }

  assert.equal(observedPublicFamilies.has("IComparable"), true);
  assert.equal(observedPublicFamilies.has("Task"), true);
  const taskModule = modules[1];
  const taskVariants = taskModule.exports.filter((declaration) =>
    declaration.kind === "type" && declaration.sourceTypeFamily?.exportName === "Task");
  assert.deepEqual(taskVariants.map((declaration) => declaration.sourceTypeFamily.typeArgumentCount).sort(), [0, 1]);
  assert.equal(new Set(taskVariants.map((declaration) => declaration.targetId)).size, 2);
});

for (const [order, declarations] of [
  ["plain-first", ["declare const plain: Task;", "declare const closed: Task<string>;"]],
  ["closed-first", ["declare const closed: Task<string>;", "declare const plain: Task;"]],
]) {
  test(`C# runtime carriers keep provider-family instantiations on exact type uses (${order})`, () => {
    assertProviderFamilyRuntimeCarriers(declarations);
  });
}

function assertProviderFamilyRuntimeCarriers(declarations) {
  const context = csharpProviderContext();
  const session = createCompilerSessionFromFiles({
      currentDirectory: "/src",
      files: new Map([
        ["/src/index.ts", [
          'import type { Task } from "@tsonic/dotnet/System.Threading.Tasks.js";',
          ...declarations,
          "plain;",
          "closed;",
          "",
        ].join("\n")],
        ["/src/node_modules/@tsonic/dotnet/package.json", packageJson("@tsonic/dotnet", {
          "./System.Threading.Tasks.js": "./System.Threading.Tasks.js",
        })],
        ...csharpSourceProfileFiles().map((file) => [file.path, file.text]),
      ]),
      compilerOptions: {
        noLib: true,
        module: "esnext",
        moduleResolution: "bundler",
        strict: true,
      },
      extensionHostOptions: {
        activeTarget: "csharp",
        extensions: csharpTestExtensions(
          createCsharpSourceSemanticsExtension(context),
          createCsharpTargetSemanticsExtension(context),
        ),
      },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);
  assert.equal(formatDiagnostics(runTestStage("ensureChecked", () => session.ensureChecked(sourceFile))), "");

  const references = collectTypeReferencesByText(sourceFile, session.ast, "Task");
  assert.equal(references.length, 2);
  const plainReference = references.find((reference) => session.ast.typeArguments(reference).length === 0);
  const closedReference = references.find((reference) => session.ast.typeArguments(reference).length === 1);
  assert.ok(plainReference);
  assert.ok(closedReference);
  const extensionHost = runTestStage("finalizeExtensions", () => session.finalizeExtensions());
  assert.deepEqual(extensionHost.diagnostics.all(), []);
  const plainType = runTestStage("plain getTypeFromTypeNode", () => session.checker.getTypeFromTypeNode(plainReference, { sourceFile }));
  const closedType = runTestStage("closed getTypeFromTypeNode", () => session.checker.getTypeFromTypeNode(closedReference, { sourceFile }));
  assert.ok(plainType);
  assert.ok(closedType);
  assert.notEqual(plainType, closedType);

  assert.equal(session.ast.is.IsTypeReferenceNode(plainReference), true);
  assert.equal(session.ast.is.IsTypeReferenceNode(closedReference), true);
  const plainTypeName = session.ast.as.AsTypeReferenceNode(plainReference).TypeName;
  const closedTypeName = session.ast.as.AsTypeReferenceNode(closedReference).TypeName;
  const plainAlias = session.checker.getSymbolAtLocation(plainTypeName, { sourceFile });
  const closedAlias = session.checker.getSymbolAtLocation(closedTypeName, { sourceFile });
  assert.ok(plainAlias);
  assert.equal(plainAlias, closedAlias);
  const plainSymbol = session.checker.getAliasedSymbol(plainAlias, { sourceFile });
  const closedSymbol = session.checker.getAliasedSymbol(closedAlias, { sourceFile });
  assert.ok(plainSymbol);
  assert.equal(plainSymbol, closedSymbol);

  assert.deepEqual(extensionHost.diagnostics.all(), []);
  assertTaskCarrier(extensionHost.facts.get(plainReference, runtimeCarrierFactKey)?.carrier, 0);
  assertTaskCarrier(extensionHost.facts.get(plainType, runtimeCarrierFactKey)?.carrier, 0);
  assertTaskCarrier(extensionHost.facts.get(plainReference, csharpRuntimeCarrierFactKey)?.carrier, 0);
  assertTaskCarrier(extensionHost.facts.get(plainType, csharpRuntimeCarrierFactKey)?.carrier, 0);
  assertTaskCarrier(extensionHost.facts.get(closedReference, runtimeCarrierFactKey)?.carrier, 1);
  assertTaskCarrier(extensionHost.facts.get(closedType, runtimeCarrierFactKey)?.carrier, 1);
  assertTaskCarrier(extensionHost.facts.get(closedReference, csharpRuntimeCarrierFactKey)?.carrier, 1);
  assertTaskCarrier(extensionHost.facts.get(closedType, csharpRuntimeCarrierFactKey)?.carrier, 1);
  assert.ok(extensionHost.facts.get(plainSymbol, targetBindingFactKey));
  assert.equal(extensionHost.facts.get(plainAlias, runtimeCarrierFactKey), undefined);
  assert.equal(extensionHost.facts.get(plainAlias, csharpRuntimeCarrierFactKey), undefined);
  assert.equal(extensionHost.facts.get(plainSymbol, runtimeCarrierFactKey), undefined);
  assert.equal(extensionHost.facts.get(plainSymbol, csharpRuntimeCarrierFactKey), undefined);
}

function requireModule(result) {
  assert.equal("exports" in result, true, JSON.stringify(result));
  return result;
}

function assertTaskCarrier(carrier, arity) {
  assert.ok(carrier);
  assert.equal(carrier.kind, "target-named");
  assert.equal(carrier.id, arity === 0 ? "System.Threading.Tasks.Task" : "System.Threading.Tasks.Task`1");
  assert.equal(carrier.typeArguments?.length ?? 0, arity);
  if (arity === 1) {
    assert.equal(carrier.typeArguments[0].kind, "target-named");
    assert.equal(carrier.typeArguments[0].id, "System.String");
  }
}

function runTestStage(stage, action) {
  try {
    return action();
  } catch (cause) {
    throw new Error(`Provider-family runtime-carrier proof failed during ${stage}.`, { cause });
  }
}

function collectProviderRefs(value, refs = [], visited = new WeakSet()) {
  if (value === null || typeof value !== "object" || visited.has(value)) return refs;
  visited.add(value);
  if (value.kind === "provider-ref") refs.push(value);
  if (Array.isArray(value)) {
    for (const item of value) collectProviderRefs(item, refs, visited);
    return refs;
  }
  for (const nested of Object.values(value)) collectProviderRefs(nested, refs, visited);
  return refs;
}
