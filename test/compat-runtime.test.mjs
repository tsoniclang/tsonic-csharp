import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ExtensionLifecycleEvent,
  createCompilerSessionFromFiles,
  formatDiagnostics,
  runtimeCarrierFactKey,
  selectedTargetSignatureFactKey,
} from "@tsonic/tsts";
import {
  createCsharpSourceSemanticsExtension,
  createCsharpTargetSemanticsExtension,
} from "../dist/index.js";
import {
  csharpTargetOperationFactKey,
} from "../dist/source/csharp-facts.js";
import {
  readCsharpTypescriptCompatibilityMode,
} from "../dist/options/csharp-target-options.js";

test("C# TypeScript compatibility mode defaults to strict-native and accepts explicit compat", () => {
  assert.equal(readCsharpTypescriptCompatibilityMode({ id: "csharp" }), "strict-native");
  assert.equal(readCsharpTypescriptCompatibilityMode({
    id: "csharp",
    options: { typescriptCompatibility: "strict-native" },
  }), "strict-native");
  assert.equal(readCsharpTypescriptCompatibilityMode({
    id: "csharp",
    options: { typescriptCompatibility: "compat" },
  }), "compat");
  assert.throws(
    () => readCsharpTypescriptCompatibilityMode({
      id: "csharp",
      options: { typescriptCompatibility: "dynamic" },
    }),
    /typescriptCompatibility.*strict-native.*compat/u,
  );
});

test("strict-native hard-rejects opaque any operations without carrier operation facts", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
    value.name = 1;
    value["name"];
    value();
    new value();
    value + 1;
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const anyDiagnostics = anyOperationDiagnostics(extensionHost);

  assert.equal(anyDiagnostics.length, 6);
  assert.ok(anyDiagnostics.every((diagnostic) => diagnostic.message.includes("strict-native mode")));
});

test("compat mode still rejects opaque any operations without finalized carrier operation facts", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
    value.name = 1;
    value["name"];
    value();
    new value();
    value + 1;
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const anyDiagnostics = anyOperationDiagnostics(extensionHost);

  assert.equal(anyDiagnostics.length, 6);
  assert.ok(anyDiagnostics.every((diagnostic) => diagnostic.message.includes("compatibility mode without finalized target operation facts")));
});

test("strict-native hard-rejects object-literal prototype mutation syntax", () => {
  const session = createNativeSession(`
    const obj = {} as { __proto__: object };
    const created = { __proto__: obj };
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const diagnostics = compatRuntimeDiagnostics(extensionHost);

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.message), [
    "C# emission cannot support object-literal __proto__ prototype mutation.",
  ]);
  assert.ok(diagnostics.every((diagnostic) =>
    JSON.stringify(diagnostic.evidence).includes("hard-reject") &&
    JSON.stringify(diagnostic.evidence).includes("closed Tsonic-owned compat-runtime carrier")
  ));
});

test("compat runtime hard rejects are not inferred from shadowable source names", () => {
  const session = createNativeSession(`
    export {};
    const obj = {} as { __proto__: object };

    const Function = (source: string) => source.length;
    class Proxy {
      static revocable(target: object, handler: object) {
        return { target, handler };
      }
      constructor(target: object, handler: object) {}
    }
    const Object = {
      setPrototypeOf(target: object, prototype: object) {
        return target;
      },
    };

    Function("return 1");
    new Proxy({}, {});
    Proxy["revocable"]({}, {});
    obj.__proto__ = {};
    Object["setPrototypeOf"](obj, {});
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const diagnostics = compatRuntimeDiagnostics(extensionHost);

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.message), []);
  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
});

test("compat runtime hard rejects resolved standard-library eval, Function, Proxy, and prototype APIs", () => {
  const session = createNativeSession(`
    eval("1 + 1");
    Function("return 1")();
    new Function("return 1");
    new Proxy({}, {});
    Proxy.revocable({}, {});
    Object.setPrototypeOf({}, null);
    Object.getPrototypeOf({});
    Object.create(null);
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  session.ensureChecked(sourceFile);

  const extensionHost = session.finalizeExtensions();
  const diagnostics = compatRuntimeDiagnostics(extensionHost);

  assert.deepEqual(new Set(diagnostics.map((diagnostic) => diagnostic.message)), new Set([
    "C# emission cannot support JavaScript eval.",
    "C# emission cannot support JavaScript dynamic Function construction.",
    "C# emission cannot support JavaScript Proxy.",
    "C# emission cannot support JavaScript Object.setPrototypeOf prototype semantics.",
    "C# emission cannot support JavaScript Object.getPrototypeOf prototype semantics.",
    "C# emission cannot support JavaScript Object.create prototype semantics.",
  ]));
  assert.ok(diagnostics.every((diagnostic) =>
    JSON.stringify(diagnostic.evidence).includes("hard-reject") &&
    JSON.stringify(diagnostic.evidence).includes("source-name guessing")
  ));
});

test("with statements remain hard-rejected as dynamic scope even when TSTS already rejects them", () => {
  const session = createNativeSession(`
    with ({ value: 1 }) {
      value;
    }
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.match(formatDiagnostics(session.ensureChecked(sourceFile)), /with/u);

  const extensionHost = session.finalizeExtensions();
  const diagnostics = compatRuntimeDiagnostics(extensionHost);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].message, "C# emission cannot support JavaScript 'with' dynamic scope.");
  assert.match(JSON.stringify(diagnostics[0].evidence), /dynamic scope/u);
});

test("compat mode rejects opaque any operations when the operation fact is not a closed compat carrier", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
  `, { typescriptCompatibility: "compat" }, [
    createTestDynamicOperationFactExtension("KindPropertyAccessExpression", { closedCompatCarrier: false }),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const propertyAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")[0];
  const anyDiagnostics = anyOperationDiagnostics(extensionHost);

  assert.equal(anyDiagnostics.length, 1);
  assert.match(anyDiagnostics[0].message, /compatibility mode without finalized target operation facts/u);
  assert.equal(extensionHost.facts.get(propertyAccess, csharpTargetOperationFactKey)?.operationId, "test.compat.any.dynamic-get");
});

test("compat mode permits opaque any operation only when a closed operation fact exists", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
  `, { typescriptCompatibility: "compat" }, [
    createTestDynamicOperationFactExtension("KindPropertyAccessExpression"),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const propertyAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")[0];

  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
  assert.equal(extensionHost.facts.get(propertyAccess, csharpTargetOperationFactKey)?.operationId, "test.compat.any.dynamic-get");
});

test("compat mode rejects closed compat carrier facts on non-any object operations", () => {
  const session = createNativeSession(`
    declare let objectValue: object;
    objectValue.toString();
  `, { typescriptCompatibility: "compat" }, [
    createTestDynamicOperationFactExtension("KindPropertyAccessExpression"),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  session.ensureChecked(sourceFile);

  const extensionHost = session.finalizeExtensions();
  const diagnostics = compatRuntimeDiagnostics(extensionHost);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].message, "C# compat-runtime carrier operation facts can only attach to explicit TypeScript any operations.");
  assert.match(JSON.stringify(diagnostics[0].evidence), /unknown, object, and statically typed values must not become dynamic/u);
  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
});

test("strict-native rejects opaque any operations even when a compatibility fact exists", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
  `, { typescriptCompatibility: "strict-native" }, [
    createTestDynamicOperationFactExtension("KindPropertyAccessExpression"),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const anyDiagnostics = anyOperationDiagnostics(extensionHost);

  assert.equal(anyDiagnostics.length, 1);
  assert.match(anyDiagnostics[0].message, /strict-native mode/u);
});

test("compat mode permits opaque any construction only when a closed operation fact exists", () => {
  const session = createNativeSession(`
    declare let value: any;
    new value();
  `, { typescriptCompatibility: "compat" }, [
    createTestDynamicOperationFactExtension("KindNewExpression"),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const newExpression = collectNodesByKind(sourceFile, session.ast, "KindNewExpression")[0];

  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
  assert.equal(extensionHost.facts.get(newExpression, csharpTargetOperationFactKey)?.operationId, "test.compat.any.dynamic-get");
});

test("compat mode permits opaque any call, element, and operator only when closed operation facts exist", () => {
  const session = createNativeSession(`
    declare let value: any;
    value();
    value["name"];
    value + 1;
  `, { typescriptCompatibility: "compat" }, [
    createTestDynamicOperationFactExtension("KindCallExpression"),
    createTestDynamicOperationFactExtension("KindElementAccessExpression"),
    createTestDynamicOperationFactExtension("KindBinaryExpression"),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const callExpression = collectNodesByKind(sourceFile, session.ast, "KindCallExpression")[0];
  const elementAccess = collectNodesByKind(sourceFile, session.ast, "KindElementAccessExpression")[0];
  const binaryExpression = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];

  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
  assert.equal(extensionHost.facts.get(callExpression, csharpTargetOperationFactKey)?.operationId, "test.compat.any.dynamic-get");
  assert.equal(extensionHost.facts.get(elementAccess, csharpTargetOperationFactKey)?.operationId, "test.compat.any.dynamic-get");
  assert.equal(extensionHost.facts.get(binaryExpression, csharpTargetOperationFactKey)?.operationId, "test.compat.any.dynamic-get");
});

test("compat mode rejects opaque any when only an unclosed selected signature fact exists", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
  `, { typescriptCompatibility: "compat" }, [
    createTestSelectedSignatureOnlyExtension("KindPropertyAccessExpression"),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const propertyAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")[0];
  const anyDiagnostics = anyOperationDiagnostics(extensionHost);

  assert.equal(anyDiagnostics.length, 1);
  assert.match(anyDiagnostics[0].message, /compatibility mode without finalized target operation facts/u);
  assert.equal(extensionHost.facts.get(propertyAccess, csharpTargetOperationFactKey), undefined);
});

test("unknown and object remain non-dynamic and are rejected by TSTS source checking", () => {
  const session = createNativeSession(`
    declare let unknownValue: unknown;
    declare let objectValue: object;
    unknownValue.name;
    objectValue.name;
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnosticsText = formatDiagnostics(session.ensureChecked(sourceFile));

  assert.match(diagnosticsText, /unknown/u);
  assert.match(diagnosticsText, /object/u);

  const extensionHost = session.finalizeExtensions();
  const unknownCarriers = collectIdentifiersByText(sourceFile, session.ast, "unknownValue")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier)
    .filter((carrier) => carrier !== undefined);
  const objectCarriers = collectIdentifiersByText(sourceFile, session.ast, "objectValue")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier)
    .filter((carrier) => carrier !== undefined);

  assert.deepEqual(unknownCarriers, []);
  assert.deepEqual(objectCarriers, []);
  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
});

function createNativeSession(sourceText, targetOptions = {}, extraExtensions = []) {
  const context = csharpProviderContext(targetOptions);
  return createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
    ]),
    compilerOptions: {
      module: "esnext",
      moduleResolution: "bundler",
      strictNullChecks: true,
      target: "es2022",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: [
        createCsharpSourceSemanticsExtension(context),
        ...extraExtensions,
        createCsharpTargetSemanticsExtension(context),
      ],
    },
  });
}

function createTestDynamicOperationFactExtension(kindName, options = {}) {
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
          for (const node of collectNodesByKind(sourceFile, compiler.ast, kindName)) {
            lifecycleContext.host.facts.set(node, csharpTargetOperationFactKey, {
              kind: "member",
              operationId: "test.compat.any.dynamic-get",
              operationKind: "method",
              memberName: "ReadDynamicSlot",
              declaringType: options.closedCompatCarrier === false ? undefined : tsValueCarrier(),
              resultType: options.closedCompatCarrier === false ? { kind: "opaque", id: "any" } : tsValueCarrier(),
            }, [{ message: "Test-only closed compat carrier operation fact." }]);
          }
        }
      });
    },
  };
}

function tsValueCarrier() {
  return {
    kind: "target-named",
    id: "Tsonic.CSharp.Js.TsValue",
    csharpRender: { kind: "named", namespace: ["Tsonic", "CSharp", "Js"], name: "TsValue" },
  };
}

function createTestSelectedSignatureOnlyExtension(kindName) {
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

function csharpProviderContext(targetOptions) {
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
    selectedSurfaces: [],
  };
}

function anyOperationDiagnostics(extensionHost) {
  return extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED"
  );
}

function compatRuntimeDiagnostics(extensionHost) {
  return extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_COMPAT_RUNTIME_OPERATION_UNSUPPORTED"
  );
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
