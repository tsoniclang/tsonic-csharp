import assert from "node:assert/strict";
import test from "node:test";
import {
  TstsProviderContractVersion,
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  createCsharpTargetSemanticsExtension,
  createCsharpSourceSemanticsExtension,
} from "../dist/index.js";
import {
  csharpObservedTargetAssignabilityFactKey,
} from "../dist/source/csharp-facts.js";

const searchValuesModule = "@example/csharp/search-values.js";

test("C# post-check target assignability reports target invalidity without changing the TS relation", () => {
  const sourceText = `
    declare let x: number;
    declare let y: number;
    x = y;
  `;
  const session = createNativeSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.ok(sourceFile);

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 2322), false, formatDiagnostics(diagnostics));
  assert.equal(session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ).length, 0);
  session.extensionHost?.facts.set(sourceFile, csharpObservedTargetAssignabilityFactKey, {
    source: {
      kind: "target-named",
      id: "Example.SearchValues`1",
      typeArguments: [{ kind: "opaque", id: "any" }],
    },
    target: {
      kind: "target-named",
      id: "Example.SearchValues`1",
      typeArguments: [{ kind: "source-primitive", name: "int32" }],
    },
    relation: "assignment",
    expression: sourceFile,
  }, [{ message: "Test-injected post-check assignability fact after TSTS accepted a TypeScript assignment." }]);
  const observedFacts = collectFacts(sourceFile, session.ast, session.extensionHost, csharpObservedTargetAssignabilityFactKey);
  assert.equal(observedFacts.length, 1);
  assert.equal(observedFacts[0].relation, "assignment");

  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 1);
  assert.match(targetDiagnostics[0].message, /after TSTS accepted the TypeScript relation/);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === targetDiagnostics[0].numericCode), true);
});

test("C# post-check target assignability cannot make TypeScript-invalid assignments valid", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";
    import type { SearchValues } from "@example/csharp/search-values.js";

    declare let x: SearchValues<int32>;
    x = null;
  `;
  const session = createSearchValuesSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 2322), true, formatDiagnostics(diagnostics));
  assert.equal(collectFacts(sourceFile, session.ast, session.extensionHost, csharpObservedTargetAssignabilityFactKey).length, 0);

  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 0);
});

test("C# post-check target assignability fails closed on TypeScript any boundaries", () => {
  const sourceText = `
    declare let value: any;
    declare let target: number;
    target = value;
  `;
  const session = createNativeSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");

  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 1);
  assert.match(targetDiagnostics[0].message, /TypeScript any boundary/);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === targetDiagnostics[0].numericCode), true);
});

function createSearchValuesSession(sourceText) {
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", JSON.stringify({
        name: "@tsonic/core",
        version: "1.0.0",
        type: "module",
        exports: {
          "./types.js": {
            types: "./types.d.ts",
            default: "./types.js",
          },
        },
      })],
      ["/src/node_modules/@example/csharp/package.json", JSON.stringify({
        name: "@example/csharp",
        version: "1.0.0",
        type: "module",
        exports: {
          "./search-values.js": {
            types: "./search-values.d.ts",
            default: "./search-values.js",
          },
        },
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createProviderBackedSearchValuesExtension(),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ],
    },
  });
}

function createNativeSession(sourceText) {
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ],
    },
  });
}

function collectFacts(sourceFile, ast, extensionHost, factKey) {
  if (sourceFile === undefined || extensionHost === undefined) {
    return [];
  }
  const facts = [];
  visit(sourceFile);
  return facts;

  function visit(node) {
    const fact = extensionHost.facts.get(node, factKey);
    if (fact !== undefined) {
      facts.push(fact);
    }
    ast.forEachChild(node, visit);
  }
}

function createProviderBackedSearchValuesExtension() {
  return {
    identity: {
      id: "example-csharp-search-values-extension",
      version: "1.0.0",
      capabilityNamespace: "example.csharp.search-values",
    },
    initialize(context) {
      context.registerTargetBindingProvider({
        identity: {
          id: "example-csharp-search-values-provider",
          version: "1.0.0",
          target: "csharp",
          extensionContractVersion: TstsProviderContractVersion,
          providerKind: "binding",
        },
        ownsModule(moduleSpecifier) {
          return moduleSpecifier === searchValuesModule ? { kind: "owned" } : { kind: "unowned" };
        },
        resolveModule(moduleSpecifier) {
          return {
            kind: "virtual",
            moduleSpecifier,
            virtualFileName: "tsts-provider://example-csharp/search-values.d.ts",
            providerModuleId: "example.csharp.search-values",
            packageName: "@example/csharp",
            packageVersion: "1.0.0",
          };
        },
        getDeclarationModel(resolution) {
          return {
            moduleSpecifier: resolution.moduleSpecifier,
            providerModuleId: resolution.providerModuleId,
            exports: [{
              id: "SearchValues",
              name: "SearchValues",
              kind: "class",
              targetIdentity: {
                target: "csharp",
                id: "System.Collections.Generic.List`1",
                displayName: "System.Collections.Generic.List<T>",
              },
              typeParameters: [{ name: "T" }],
              members: [{
                id: "SearchValues.value",
                name: "value",
                kind: "property",
                type: { kind: "type-parameter", name: "T" },
              }],
            }],
          };
        },
        getTargetIdentity(symbol) {
          return symbol.moduleSpecifier === searchValuesModule && symbol.exportName === "SearchValues"
            ? {
                target: "csharp",
                id: "System.Collections.Generic.List`1",
                displayName: "System.Collections.Generic.List<T>",
              }
            : undefined;
        },
      });
    },
  };
}

function csharpProviderContext() {
  const target = { id: "csharp" };
  return {
    project: {
      entryPoint: "index.ts",
      targets: [target],
    },
    target,
    selectedSurfaces: [],
  };
}
