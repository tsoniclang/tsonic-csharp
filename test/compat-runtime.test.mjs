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
    void value;
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  assertAnyDiagnosticMessages(extensionHost, expectedOpaqueAnyOperationMessages("strict-native"));
});

test("compat mode records closed carrier operation facts for opaque any operations", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
    value.name = 1;
    value["name"];
    value();
    new value();
    void value.name;
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(anyOperationDiagnostics(extensionHost), []);
  const operationNodes = [
    ...collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression"),
    ...collectNodesByKind(sourceFile, session.ast, "KindElementAccessExpression"),
    ...collectNodesByKind(sourceFile, session.ast, "KindCallExpression"),
    ...collectNodesByKind(sourceFile, session.ast, "KindNewExpression"),
    ...collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression"),
    ...collectNodesByKind(sourceFile, session.ast, "KindVoidExpression"),
  ];
  assert.deepEqual(operationNodes.map((node) =>
    extensionHost.facts.get(node, csharpTargetOperationFactKey)?.declaringType?.id
  ), [
    "Tsonic.CSharp.Js.TsValue",
    "Tsonic.CSharp.Js.TsValue",
    "Tsonic.CSharp.Js.TsValue",
    "Tsonic.CSharp.Js.TsValue",
    "Tsonic.CSharp.Js.TsValue",
    "Tsonic.CSharp.Js.TsValue",
    "Tsonic.CSharp.Js.TsValue",
    "Tsonic.CSharp.Js.TsValue",
  ]);
});

test("compat mode records closed carrier facts for exported any parameter operations", () => {
  const session = createNativeSession(`
    export function writeName(value: any): any {
      value.name = "Ada";
      return value.name;
    }

    export function callValue(value: any): any {
      return value("Ada");
    }

    export function callMember(value: any): any {
      return value.create("Ada");
    }
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all(), []);
  const propertyAccesses = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression");
  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  const call = collectNodesByKind(sourceFile, session.ast, "KindCallExpression")[0];

  assert.deepEqual([
    extensionHost.facts.get(propertyAccesses[0], csharpTargetOperationFactKey)?.operationId,
    extensionHost.facts.get(assignment, csharpTargetOperationFactKey)?.operationId,
    extensionHost.facts.get(propertyAccesses[1], csharpTargetOperationFactKey)?.operationId,
    extensionHost.facts.get(call, csharpTargetOperationFactKey)?.operationId,
    extensionHost.facts.get(propertyAccesses[2], csharpTargetOperationFactKey)?.operationId,
    extensionHost.facts.get(collectNodesByKind(sourceFile, session.ast, "KindCallExpression")[1], csharpTargetOperationFactKey)?.operationId,
  ], [
    "tsonic.csharp.compat.any.property-read:name",
    "tsonic.csharp.compat.any.property-write:name",
    "tsonic.csharp.compat.any.property-read:name",
    "tsonic.csharp.compat.any.call",
    "tsonic.csharp.compat.any.property-read:create",
    "tsonic.csharp.compat.any.call",
  ]);
});

test("compat mode deterministically rejects unsupported explicit any operator forms", () => {
  const session = createNativeSession(`
    declare let value: any;
    class Example {}

    value << 1;
    value & 1;
    value ** 2;
    value += 1;
    value **= 2;
    "name" in value;
    value instanceof Example;
    (value(), 1);
    delete value.name;
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const diagnostics = extensionHost.diagnostics.all().map((diagnostic) => diagnostic.message);

  for (const operator of ["<<", "&", "**", "+=", "**=", "in", "instanceof", ",", "delete"]) {
    assert.ok(
      diagnostics.some((message) => message.includes(`operator '${operator}'`)),
      `missing deterministic diagnostic for any operator ${operator}: ${diagnostics.join("\n")}`,
    );
  }
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

test("compat mode preserves selected closed operation facts from other providers", () => {
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

test("compat mode records opaque any property write operation facts", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name = 1;
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const propertyAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")[0];
  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];

  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
  assert.equal(extensionHost.facts.get(propertyAccess, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.property-read:name");
  assert.equal(extensionHost.facts.get(assignment, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.property-write:name");
});

test("compat mode accepts each closed Tsonic-owned compat carrier for opaque any operations", () => {
  const carrierIds = [
    "Tsonic.CSharp.Js.TsValue",
    "Tsonic.CSharp.Js.TsObject",
    "Tsonic.CSharp.Js.TsArray",
    "Tsonic.CSharp.Js.TsUnion",
    "Tsonic.CSharp.Js.TsFunction",
  ];
  const session = createNativeSession(`
    declare let value0: any;
    declare let value1: any;
    declare let value2: any;
    declare let value3: any;
    declare let value4: any;
    value0.name;
    value1.name;
    value2.name;
    value3.name;
    value4.name;
  `, { typescriptCompatibility: "compat" }, [
    createTestDynamicOperationFactExtension("KindPropertyAccessExpression", { carrierIds }),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const propertyAccesses = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression");

  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
  assert.equal(compatRuntimeDiagnostics(extensionHost).length, 0);
  assert.deepEqual(propertyAccesses.map((node) =>
    extensionHost.facts.get(node, csharpTargetOperationFactKey)?.declaringType?.id
  ), carrierIds);
});

test("compat mode rejects closed compat carrier facts on non-any unknown and object operations", () => {
  const session = createNativeSession(`
    declare let unknownValue: unknown;
    declare let objectValue: object;
    unknownValue.toString;
    objectValue.toString;
  `, { typescriptCompatibility: "compat" }, [
    createTestDynamicOperationFactExtension("KindPropertyAccessExpression"),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.match(formatDiagnostics(session.ensureChecked(sourceFile)), /unknown/u);

  const extensionHost = session.finalizeExtensions();
  const diagnostics = compatRuntimeDiagnostics(extensionHost);

  assert.equal(diagnostics.length, 2);
  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.message), [
    "C# compat-runtime carrier operation facts can only attach to explicit TypeScript any operations.",
    "C# compat-runtime carrier operation facts can only attach to explicit TypeScript any operations.",
  ]);
  assert.ok(diagnostics.every((diagnostic) =>
    JSON.stringify(diagnostic.evidence).includes("unknown, object, and statically typed values must not become dynamic")
  ));
  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
});

test("strict-native rejects every opaque any operation even when compatibility facts exist", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
    value.name = 1;
    value["name"];
    value();
    new value();
    value + 1;
    void value;
  `, { typescriptCompatibility: "strict-native" }, [
    createTestDynamicOperationFactExtension("KindPropertyAccessExpression"),
    createTestDynamicOperationFactExtension("KindElementAccessExpression"),
    createTestDynamicOperationFactExtension("KindCallExpression"),
    createTestDynamicOperationFactExtension("KindNewExpression"),
    createTestDynamicOperationFactExtension("KindBinaryExpression", { skipAssignment: true }),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  assertAnyDiagnosticMessages(extensionHost, expectedOpaqueAnyOperationMessages("strict-native"));
});

test("compat mode records opaque any construction operation facts", () => {
  const session = createNativeSession(`
    declare let value: any;
    new value();
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const newExpression = collectNodesByKind(sourceFile, session.ast, "KindNewExpression")[0];

  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
  assert.equal(extensionHost.facts.get(newExpression, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.construct");
});

test("compat mode records opaque any call, element, and supported operator facts", () => {
  const session = createNativeSession(`
    declare let value: any;
    value();
    value["name"];
    value + 1;
    value === 1;
    !value;
    typeof value;
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const callExpression = collectNodesByKind(sourceFile, session.ast, "KindCallExpression")[0];
  const elementAccess = collectNodesByKind(sourceFile, session.ast, "KindElementAccessExpression")[0];
  const binaryExpressions = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression");
  const prefixUnaryExpression = collectNodesByKind(sourceFile, session.ast, "KindPrefixUnaryExpression")[0];
  const typeOfExpression = collectNodesByKind(sourceFile, session.ast, "KindTypeOfExpression")[0];

  assert.deepEqual(anyOperationDiagnostics(extensionHost).map((diagnostic) => diagnostic.message), []);
  assert.equal(extensionHost.facts.get(callExpression, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.call");
  assert.equal(extensionHost.facts.get(elementAccess, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.element-read");
  assert.equal(extensionHost.facts.get(binaryExpressions[0], csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.operator:+");
  assert.equal(extensionHost.facts.get(binaryExpressions[1], csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.operator:===");
  assert.equal(extensionHost.facts.get(prefixUnaryExpression, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.operator:!");
  assert.equal(extensionHost.facts.get(typeOfExpression, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.compat.any.operator:typeof");
});

test("compat mode hard rejects unsupported opaque any operators without fallback", () => {
  const session = createNativeSession(`
    declare let value: any;
    value << 1;
    "name" in value;
    value += 1;
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const diagnostics = extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_COMPAT_ANY_OPERATOR_UNSUPPORTED"
  );

  assert.equal(diagnostics.length, 3);
  assert.deepEqual(sortedMessages(diagnostics.map((diagnostic) => diagnostic.message)), sortedMessages([
    "C# compatibility mode has no closed compat-runtime carrier operation for TypeScript any operator '<<'.",
    "C# compatibility mode has no closed compat-runtime carrier operation for TypeScript any operator 'in'.",
    "C# compatibility mode has no closed compat-runtime carrier operation for TypeScript any operator '+='.",
  ]));
  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
});

test("compat mode hard rejects opaque any delete without fallback", () => {
  const session = createNativeSession(`
    declare let value: any;
    delete value.name;
  `, { typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const diagnostics = compatRuntimeDiagnostics(extensionHost);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].message, "C# compatibility mode has no closed compat-runtime carrier operation for TypeScript any operator 'delete'.");
  assert.match(JSON.stringify(diagnostics[0].evidence), /sparse-slot state/u);
  assert.equal(anyOperationDiagnostics(extensionHost).length, 0);
});

test("strict-native rejects opaque any when only an unclosed selected signature fact exists", () => {
  const session = createNativeSession(`
    declare let value: any;
    value.name;
  `, { typescriptCompatibility: "strict-native" }, [
    createTestSelectedSignatureOnlyExtension("KindPropertyAccessExpression"),
  ]);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const propertyAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")[0];
  const anyDiagnostics = anyOperationDiagnostics(extensionHost);

  assert.equal(anyDiagnostics.length, 1);
  assert.match(anyDiagnostics[0].message, /strict-native mode/u);
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
        createTsonicCoreSourceExtension(),
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

function tsValueCarrier() {
  return compatCarrier();
}

function compatCarrier(id = "Tsonic.CSharp.Js.TsValue") {
  const segments = id.split(".");
  return {
    kind: "target-named",
    id,
    csharpRender: { kind: "named", namespace: segments.slice(0, -1), name: segments.at(-1) },
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
    selectedPackages: [],
    selectedSurfaces: [],
  };
}

function expectedOpaqueAnyOperationMessages(compatibilityMode) {
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

function assertAnyDiagnosticMessages(extensionHost, expectedMessages) {
  assert.deepEqual(
    sortedMessages(anyOperationDiagnostics(extensionHost).map((diagnostic) => diagnostic.message)),
    sortedMessages(expectedMessages),
  );
}

function sortedMessages(messages) {
  return [...messages].sort((left, right) => left.localeCompare(right));
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
