import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TstsProviderContractVersion,
  attributeFactKey,
  createCompilerSessionFromFiles,
  formatDiagnostics,
} from "@tsonic/tsts";
import {
  createCsharpNativeProviderExtension,
  createCsharpSourceSemanticsExtension,
} from "../dist/index.js";
import { providerExportDeclarationsForModule } from "../dist/source/csharp-source-semantics/core-virtual-declarations.js";

test("source-semantics virtual attribute helpers do not introduce any-typed lanes", () => {
  const declarations = providerExportDeclarationsForModule({
    moduleSpecifier: "@tsonic/core/lang.js",
    packageName: "@tsonic/core",
    subpath: "lang.js",
    exports: [],
  });
  const serialized = JSON.stringify(declarations);

  assert.equal(serialized.includes('"kind":"any"'), false);
  assert.equal(serialized.includes('"kind":"unknown"'), true);
});

test("source-semantics records provider-backed attribute selector facts from user source", () => {
  const sourceText = `
    import { attribute } from "@tsonic/core/lang.js";
    import { NonSerializedAttribute, ObsoleteAttribute, SerializableAttribute } from "@example/attributes/index.js";

    class User {
      name = "";
      get display(): string { return this.name; }
      constructor(id: string) {}
      save(route: string): void {}
    }

    attribute<User>().add(SerializableAttribute);
    attribute<User>().constructor().add(ObsoleteAttribute, "constructor");
    attribute<User>().constructor().parameter("id").add(ObsoleteAttribute, "id");
    attribute<User>().method((target) => target.save).add(ObsoleteAttribute, "method");
    attribute<User>().method((target) => target.save).target("return").add(ObsoleteAttribute, "return");
    attribute<User>().method((target) => target.save).parameter("route").add(ObsoleteAttribute, "route");
    attribute<User>().method((target) => target.save).parameter("route").target("param").add(ObsoleteAttribute, "param");
    attribute<User>().property((target) => target.name).add(NonSerializedAttribute, "field");
    attribute<User>().property((target) => target.name).target("field").add(NonSerializedAttribute, "backing-field");
    attribute<User>().property((target) => target.display).target("property").add(ObsoleteAttribute, "property");
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", { "./lang.js": "./lang.js" })],
      ["/src/node_modules/@example/attributes/package.json", packageJson("@example/attributes", { "./index.js": "./index.js" })],
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
        createAttributeProviderExtension(),
        createCsharpNativeProviderExtension(csharpProviderContext()),
      ],
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");
  const extensionErrors = session.extensionHost?.diagnostics.all().filter((diagnostic) => diagnostic.category === "error") ?? [];
  assert.deepEqual(extensionErrors, []);

  const extensionHost = session.finalizeExtensions();
  const applicationFacts = collectFacts(sourceFile, session.ast, extensionHost)
    .filter((fact) => fact.applicationTarget !== undefined);

  assert.deepEqual(applicationFacts.map((fact) => [
    fact.attributeName,
    fact.applicationPlacement,
    fact.applicationParameterName,
    fact.applicationTargetSpecifier,
    fact.arguments?.length ?? 0,
  ]), [
    ["SerializableAttribute", undefined, undefined, undefined, 0],
    ["ObsoleteAttribute", "constructor", undefined, undefined, 1],
    ["ObsoleteAttribute", "constructor", "id", undefined, 1],
    ["ObsoleteAttribute", undefined, undefined, undefined, 1],
    ["ObsoleteAttribute", undefined, undefined, "return", 1],
    ["ObsoleteAttribute", undefined, "route", undefined, 1],
    ["ObsoleteAttribute", undefined, "route", "param", 1],
    ["NonSerializedAttribute", undefined, undefined, undefined, 1],
    ["NonSerializedAttribute", undefined, undefined, "field", 1],
    ["ObsoleteAttribute", undefined, undefined, "property", 1],
  ]);
  assert.equal(session.ast.kindName(applicationFacts[0].applicationTarget), "KindTypeReference");
  assert.equal(session.ast.kindName(applicationFacts[1].applicationTarget), "KindTypeReference");
  assert.equal(session.ast.text(session.ast.name(applicationFacts[3].applicationTarget)), "save");
  assert.equal(session.ast.text(session.ast.name(applicationFacts[6].applicationTarget)), "save");
  assert.equal(session.ast.text(session.ast.name(applicationFacts[8].applicationTarget)), "name");
  assert.equal(session.ast.text(session.ast.name(applicationFacts[9].applicationTarget)), "display");
});

function collectFacts(sourceFile, ast, extensionHost) {
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

function packageJson(name, exports) {
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

function createAttributeProviderExtension() {
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
