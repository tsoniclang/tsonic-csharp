import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TstsProviderContractVersion,
  attributeFactKey,
  createCompilerSessionFromFiles,
  functionPointerFactKey,
  formatDiagnostics,
  pointerFactKey,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
  targetConversionFactKey,
  targetOperationFactKey,
} from "@tsonic/tsts";
import {
  createCsharpNativeProviderExtension,
  createCsharpSourceSemanticsExtension,
} from "../dist/index.js";
import {
  csharpTargetOperationFactKey,
  csharpTargetConversionOperationFactKey,
} from "../dist/source/csharp-facts.js";
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

test("source-semantics records opaque any carriers without promoting unknown or object", () => {
  const sourceText = `
    declare let dynamicValue: any;
    declare let unknownValue: unknown;
    declare let objectValue: object;

    dynamicValue;
    dynamicValue["field"];
    dynamicValue();
    unknownValue;
    objectValue;
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpNativeProviderExtension(csharpProviderContext()),
      ],
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const dynamicCarriers = collectIdentifiersByText(sourceFile, session.ast, "dynamicValue")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier)
    .filter((carrier) => carrier !== undefined);
  const unknownCarriers = collectIdentifiersByText(sourceFile, session.ast, "unknownValue")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier)
    .filter((carrier) => carrier !== undefined);
  const objectCarriers = collectIdentifiersByText(sourceFile, session.ast, "objectValue")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier)
    .filter((carrier) => carrier !== undefined);

  assert.ok(dynamicCarriers.length >= 2);
  assert.deepEqual([...new Set(dynamicCarriers.map((carrier) => `${carrier.kind}:${carrier.id}`))], ["opaque:any"]);
  assert.deepEqual(unknownCarriers, []);
  assert.deepEqual(objectCarriers, []);
  const elementAccess = collectNodesByKind(sourceFile, session.ast, "KindElementAccessExpression")[0];
  const call = collectNodesByKind(sourceFile, session.ast, "KindCallExpression")[0];
  assert.deepEqual(extensionHost.facts.get(elementAccess, runtimeCarrierFactKey)?.carrier, { kind: "opaque", id: "any" });
  assert.deepEqual(extensionHost.facts.get(call, runtimeCarrierFactKey)?.carrier, { kind: "opaque", id: "any" });
  assert.equal(extensionHost.facts.get(elementAccess, targetOperationFactKey), undefined);
  assert.equal(extensionHost.facts.get(call, selectedTargetSignatureFactKey), undefined);
  const anyOperationDiagnostics = extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED"
  );
  assert.equal(anyOperationDiagnostics.length, 2);
  assert.ok(anyOperationDiagnostics.some((diagnostic) => diagnostic.message.includes("element access")));
  assert.ok(anyOperationDiagnostics.some((diagnostic) => diagnostic.message.includes("call")));
});

test("source-semantics does not synthesize C# operator facts for opaque any operands", () => {
  const sourceText = `
    declare let dynamicValue: any;
    const result = dynamicValue + 1;
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpNativeProviderExtension(csharpProviderContext()),
      ],
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const binary = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")
    .find((node) => session.ast.kindName(node.OperatorToken) === "KindPlusToken");
  assert.ok(binary);
  const dynamicUse = collectIdentifiersByText(sourceFile, session.ast, "dynamicValue")
    .find((node) => session.ast.parent(node) === binary);

  assert.deepEqual(extensionHost.facts.get(dynamicUse, runtimeCarrierFactKey)?.carrier, { kind: "opaque", id: "any" });
  assert.equal(extensionHost.facts.get(binary, targetOperationFactKey), undefined);
  assert.equal(extensionHost.facts.get(binary, csharpTargetOperationFactKey), undefined);
  const anyOperationDiagnostics = extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED"
  );
  assert.equal(anyOperationDiagnostics.length, 1);
  assert.match(anyOperationDiagnostics[0].message, /operator emission/);
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
    attribute<User>().method((target) => target.save).add(ObsoleteAttribute, "method", false);
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
    ["ObsoleteAttribute", undefined, undefined, undefined, 2],
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
  assert.equal(session.ast.text(applicationFacts[3].arguments?.[0]), "method");
  assert.equal(session.ast.kindName(applicationFacts[3].arguments?.[1]), "KindFalseKeyword");
  assert.equal(session.ast.text(session.ast.name(applicationFacts[6].applicationTarget)), "save");
  assert.equal(session.ast.text(session.ast.name(applicationFacts[8].applicationTarget)), "name");
  assert.equal(session.ast.text(session.ast.name(applicationFacts[9].applicationTarget)), "display");
});

test("source-semantics records pointer marker facts from neutral type aliases", () => {
  const sourceText = `
    import type { ptr, fnptr } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    type IntPtr = ptr<int32>;
    type Binary = fnptr<[int32, int32], int32>;
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./lang.js": "./lang.js",
        "./types.js": "./types.js",
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
        createCsharpNativeProviderExtension(csharpProviderContext()),
      ],
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const pointerFacts = collectFactsForKey(sourceFile, session.ast, extensionHost, pointerFactKey);
  const functionPointerFacts = collectFactsForKey(sourceFile, session.ast, extensionHost, functionPointerFactKey);

  assert.equal(pointerFacts.length, 2);
  assert.deepEqual(pointerFacts[0].fact, {
    pointee: pointerFacts[0].fact.pointee,
    mutability: "target-defined",
    unsafeRequired: true,
  });
  assert.equal(session.ast.kindName(pointerFacts[0].fact.pointee), "KindTypeReference");
  assert.equal(functionPointerFacts.length, 2);
  assert.equal(functionPointerFacts[0].fact.parameters.length, 2);
  assert.equal(session.ast.kindName(functionPointerFacts[0].fact.result), "KindTypeReference");
});

test("source-semantics records assertion target conversions as C# target facts", () => {
  const sourceText = `
    class Animal {}
    class Dog extends Animal {}

    export function downcast(animal: Animal): Dog {
      return animal as Dog;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
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
        createCsharpNativeProviderExtension(csharpProviderContext()),
      ],
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const assertion = collectNodesByKind(sourceFile, session.ast, "KindAsExpression")[0];
  assert.ok(assertion);
  const conversion = extensionHost.facts.get(assertion, targetConversionFactKey);
  const csharpConversion = extensionHost.facts.get(assertion, csharpTargetConversionOperationFactKey);

  assert.equal(conversion?.convertedType?.kind, "target-named");
  assert.equal(conversion.convertedType.id, "Dog");
  assert.equal(conversion.operation?.operationKind, "operator");
  assert.equal(conversion.operation?.targetOperation, "cast");
  assert.equal(csharpConversion?.kind, "cast");
  assert.equal(csharpConversion.targetType.kind, "target-named");
  assert.equal(csharpConversion.targetType.id, "Dog");
});

test("source-semantics records source primitive assertions as C# conversion method facts", () => {
  const sourceText = `
    import type { int32, uint8 } from "@tsonic/core/types.js";

    export function toByte(value: int32): uint8 {
      return value as uint8;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./types.js": "./types.js",
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
        createCsharpNativeProviderExtension(csharpProviderContext()),
      ],
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const assertion = collectNodesByKind(sourceFile, session.ast, "KindAsExpression")[0];
  assert.ok(assertion);
  const conversion = extensionHost.facts.get(assertion, targetConversionFactKey);
  const csharpConversion = extensionHost.facts.get(assertion, csharpTargetConversionOperationFactKey);

  assert.equal(conversion?.convertedType?.kind, "source-primitive");
  assert.equal(conversion.convertedType.name, "uint8");
  assert.equal(conversion.operation?.operationKind, "method");
  assert.equal(conversion.operation?.operationId, "System.Convert.ToByte");
  assert.equal(csharpConversion?.kind, "member");
  assert.equal(csharpConversion.memberName, "ToByte");
  assert.equal(csharpConversion.declaringType.id, "System.Convert");
});

test("source-semantics propagates object-shape callable carriers through destructuring", () => {
  const sourceText = `
    export interface Named {
      name: string;
      run(value: number): number;
    }

    export function invoke(named: Named): number {
      const { run } = named;
      return run(2);
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
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
        createCsharpNativeProviderExtension(csharpProviderContext()),
      ],
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const callRun = collectIdentifiersByText(sourceFile, session.ast, "run")
    .find((node) => session.ast.kindName(session.ast.parent(node)) === "KindCallExpression");
  assert.ok(callRun);
  const carrier = extensionHost.facts.get(callRun, runtimeCarrierFactKey)?.carrier;

  assert.equal(carrier?.kind, "target-named");
  assert.equal(carrier.id, "System.Func`2");
  assert.deepEqual(carrier.typeArguments?.map((argument) => argument.kind === "source-primitive" ? argument.name : argument.id), ["float64", "float64"]);
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

function collectFactsForKey(sourceFile, ast, extensionHost, key) {
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

function collectIdentifiersByText(sourceFile, ast, text) {
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

function collectNodesByKind(sourceFile, ast, kindName) {
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
