import assert from "node:assert/strict";
import test from "node:test";
import {
  TstsProviderContractVersion,
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  createCsharpNativeProviderExtension,
  createCsharpSourceSemanticsExtension,
} from "../dist/index.js";

const searchValuesModule = "@example/csharp/search-values.js";

test("C# post-check target assignability reports target invalidity without changing the TS relation", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";
    import type { SearchValues } from "@example/csharp/search-values.js";

    declare let x: SearchValues<int32>;
    declare let y: SearchValues<string>;
    x = y;
  `;
  const session = createCompilerSessionFromFiles({
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
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createProviderBackedSearchValuesExtension(),
        createCsharpNativeProviderExtension(csharpProviderContext()),
      ],
    },
  });

  const diagnostics = session.ensureChecked(session.getSourceFile("/src/index.ts"));
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 2322), false, formatDiagnostics(diagnostics));
  assert.equal(session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ).length, 0);

  session.finalizeExtensions();

  const targetDiagnostics = session.extensionHost?.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_TARGET_ASSIGNABILITY_INVALID"
  ) ?? [];
  assert.equal(targetDiagnostics.length, 1);
  assert.match(targetDiagnostics[0].message, /after TSTS accepted the TypeScript relation/);
  assert.equal(session.getDiagnostics("all").some((diagnostic) => diagnostic?.code === targetDiagnostics[0].numericCode), true);
});

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
              members: [],
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
