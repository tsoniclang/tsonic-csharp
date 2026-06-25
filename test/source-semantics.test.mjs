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
  createTsonicCoreSourceExtension,
  providerExportDeclarationsForSourceModule,
  tsonicCoreSourceSemanticsModules,
} from "@tsonic/source-core";
import {
  csharpObjectShapeFactKey,
  csharpTargetOperationFactKey,
  csharpTargetConversionOperationFactKey,
} from "../dist/source/csharp-facts.js";
import { csharpSourceSemanticsModules } from "../dist/source/csharp-source-semantics/source-modules.js";
import { createCsharpSourceVirtualModulesProvider } from "../dist/source/csharp-source-semantics/source-virtual-modules.js";

test("source-semantics virtual attribute helpers do not introduce any-typed lanes", () => {
  const declarations = providerExportDeclarationsForSourceModule({
    moduleSpecifier: "@tsonic/core/lang.js",
    packageName: "@tsonic/core",
    subpath: "lang.js",
    exports: [],
  });
  const serialized = JSON.stringify(declarations);

  assert.equal(serialized.includes('"kind":"any"'), false);
  assert.equal(serialized.includes('"kind":"unknown"'), true);
});

test("source-semantics keeps neutral primitives separate from C# aliases", () => {
  const modules = new Map([
    ...tsonicCoreSourceSemanticsModules(),
    ...csharpSourceSemanticsModules(),
  ].map((module) => [module.moduleSpecifier, module]));
  const neutralTypes = modules.get("@tsonic/core/types.js");
  const csharpTypes = modules.get("@tsonic/csharp/types.js");
  assert.ok(neutralTypes);
  assert.ok(csharpTypes);

  const neutralExports = neutralTypes.exports.map((declaration) => declaration.exportName).sort();
  const csharpExports = csharpTypes.exports.map((declaration) => declaration.exportName).sort();

  assert.deepEqual(neutralExports, [
    "bool",
    "char",
    "decimal",
    "float16",
    "float32",
    "float64",
    "int128",
    "int16",
    "int32",
    "int64",
    "int8",
    "nativeInt",
    "nativeUint",
    "uint128",
    "uint16",
    "uint32",
    "uint64",
    "uint8",
  ]);
  assert.equal(neutralExports.includes("int"), false);
  assert.equal(neutralExports.includes("long"), false);
  assert.equal(neutralExports.includes("byte"), false);
  assert.deepEqual(csharpExports, [
    "bool",
    "byte",
    "char",
    "decimal",
    "double",
    "float",
    "int",
    "long",
    "nint",
    "nuint",
    "sbyte",
    "short",
    "uint",
    "ulong",
    "ushort",
  ]);
});

test("C# source alias provider does not own or redefine portable core modules", () => {
  const provider = createCsharpSourceVirtualModulesProvider();

  assert.deepEqual(provider.ownsModule("@tsonic/core/types.js", {}), { kind: "unowned" });
  assert.deepEqual(provider.ownsModule("@tsonic/core/lang.js", {}), { kind: "unowned" });
  assert.deepEqual(provider.ownsModule("@tsonic/csharp/types.js", {}), { kind: "owned" });
  assert.deepEqual(provider.ownsModule("@tsonic/csharp/lang.js", {}), { kind: "owned" });

  const coreResolution = provider.resolveModule("@tsonic/core/types.js", {});
  assert.equal(coreResolution.extensionCode, "CSHARP_SOURCE_MODULE_UNOWNED");

  const csharpTypesResolution = provider.resolveModule("@tsonic/csharp/types.js", {});
  assert.equal(csharpTypesResolution.kind, "virtual");
  const csharpTypesModel = provider.getDeclarationModel(csharpTypesResolution);
  assert.equal(csharpTypesModel.moduleSpecifier, "@tsonic/csharp/types.js");
  assert.deepEqual(csharpTypesModel.exports.map((declaration) => declaration.name).sort(), [
    "bool",
    "byte",
    "char",
    "decimal",
    "double",
    "float",
    "int",
    "long",
    "nint",
    "nuint",
    "sbyte",
    "short",
    "uint",
    "ulong",
    "ushort",
  ]);
});

test("source-semantics records neutral primitive facts, char and bool, and configured aliases", () => {
  const sourceText = `
    import type { bool, int32 as i32, float64 } from "@tsonic/core/types.js";
    import type * as CoreTypes from "@tsonic/core/types.js";
    import type { byte, int, long } from "@tsonic/csharp/types.js";

    type LocalBool = bool;
    type LocalChar = CoreTypes.char;
    type I32 = i32;
    type I32Again = I32;
    type DoubleAlias = float64;
    type CsharpInt = int;
    type CsharpLong = long;
    type CsharpByte = byte;
    type LocalInt = number;
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./types.js": "./types.js",
      })],
      ["/src/node_modules/@tsonic/csharp/package.json", packageJson("@tsonic/csharp", {
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const aliases = new Map(collectNodesByKind(sourceFile, session.ast, "KindTypeAliasDeclaration")
    .map((node) => [session.ast.text(session.ast.name(node)), node]));

  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("LocalBool"), sourcePrimitiveFactKey)), {
    kind: "bool",
    runtimeBase: "boolean",
  });
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("LocalChar"), sourcePrimitiveFactKey)), {
    kind: "char",
    runtimeBase: "string",
    signed: false,
    width: 16,
  });
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("I32"), sourcePrimitiveFactKey)), {
    kind: "int32",
    runtimeBase: "number",
    signed: true,
    width: 32,
  });
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("I32Again"), sourcePrimitiveFactKey)), {
    kind: "int32",
    runtimeBase: "number",
    signed: true,
    width: 32,
  });
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("DoubleAlias"), sourcePrimitiveFactKey)), {
    kind: "float64",
    runtimeBase: "number",
    signed: true,
    width: 64,
  });
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("CsharpInt"), sourcePrimitiveFactKey)), {
    kind: "int32",
    runtimeBase: "number",
    signed: true,
    width: 32,
  });
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("CsharpLong"), sourcePrimitiveFactKey)), {
    kind: "int64",
    runtimeBase: "bigint",
    signed: true,
    width: 64,
  });
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("CsharpByte"), sourcePrimitiveFactKey)), {
    kind: "uint8",
    runtimeBase: "number",
    signed: false,
    width: 8,
  });
  assert.equal(extensionHost.facts.get(aliases.get("LocalInt"), sourcePrimitiveFactKey), undefined);
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createAttributeProviderExtension(),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
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

test("source-semantics records source-core marker facts and rejects unproven storage", () => {
  const sourceText = `
    import { attribute, defaultof, field, inref, out, ref as passRef, struct } from "@tsonic/core/lang.js";
    import type { fnptr, ptr } from "@tsonic/core/lang.js";
    import type { bool, char, int32 } from "@tsonic/core/types.js";

    class ExampleAttribute {}
    class User {
      name = "";
    }

    let value!: int32;
    out(value);
    passRef(value);
    inref(value);
    out(value + 1);

    const defaultChar = defaultof<char>();
    const orphanField = field<int32>();
    const Point = struct({ x: field<int32>(), ok: field<bool>() });
    attribute<User>().add(ExampleAttribute, "user");

    type ValuePtr = ptr<int32>;
    type Predicate = fnptr<[int32, bool], char>;
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.deepEqual((session.extensionHost?.diagnostics.all() ?? []).map((diagnostic) => diagnostic.extensionCode).sort(), [
    "SOURCE_SEMANTICS_FIELD_TARGET_NOT_PROVEN",
    "SOURCE_SEMANTICS_NON_STORAGE_ARGUMENT",
  ]);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0001/);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0003/);

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).sort(), [
    "SOURCE_SEMANTICS_FIELD_TARGET_NOT_PROVEN",
    "SOURCE_SEMANTICS_NON_STORAGE_ARGUMENT",
  ]);

  assert.deepEqual(argumentPassingFactForCall(sourceFile, session.ast, extensionHost, "out", 0), {
    mode: "byref-writeonly-must-init",
    targetKind: "KindIdentifier",
  });
  assert.deepEqual(argumentPassingFactForCall(sourceFile, session.ast, extensionHost, "passRef", 0), {
    mode: "byref-readwrite",
    targetKind: "KindIdentifier",
  });
  assert.deepEqual(argumentPassingFactForCall(sourceFile, session.ast, extensionHost, "inref", 0), {
    mode: "byref-readonly",
    targetKind: "KindIdentifier",
  });
  assert.deepEqual(argumentPassingFactForCall(sourceFile, session.ast, extensionHost, "out", 1), {
    mode: "byref-writeonly-must-init",
    targetKind: "KindBinaryExpression",
  });

  const defaultCall = collectCallsByCalleeText(sourceFile, session.ast, "defaultof")[0];
  assert.equal(session.ast.kindName(extensionHost.facts.get(defaultCall, defaultValueFactKey)?.type), "KindTypeReference");

  const fieldFacts = collectCallsByCalleeText(sourceFile, session.ast, "field")
    .map((call) => extensionHost.facts.get(call, fieldFactKey))
    .filter((fact) => fact !== undefined)
    .map((fact) => ({
      name: fact.name,
      typeKind: session.ast.kindName(fact.type),
      primitive: extensionHost.facts.get(fact.type, sourcePrimitiveFactKey)?.kind,
    }));
  assert.deepEqual(fieldFacts, [
    { name: "x", typeKind: "KindTypeReference", primitive: "int32" },
    { name: "ok", typeKind: "KindTypeReference", primitive: "bool" },
  ]);

  const structCall = collectCallsByCalleeText(sourceFile, session.ast, "struct")[0];
  const structFact = extensionHost.facts.get(structCall, structFactKey);
  assert.equal(structFact?.valueType, true);
  assert.deepEqual(structFact.fields?.map((field) => field.name), ["x", "ok"]);

  const addCall = collectCallsByCalleeText(sourceFile, session.ast, "add")[0];
  const attributeFact = extensionHost.facts.get(addCall, attributeFactKey);
  assert.equal(attributeFact?.attributeName, "ExampleAttribute");
  assert.equal(session.ast.kindName(attributeFact?.applicationTarget), "KindTypeReference");
  assert.equal(attributeFact?.arguments?.length, 1);

  const pointerFacts = collectFactsForKey(sourceFile, session.ast, extensionHost, pointerFactKey);
  const functionPointerFacts = collectFactsForKey(sourceFile, session.ast, extensionHost, functionPointerFactKey);
  assert.ok(pointerFacts.some((entry) => session.ast.kindName(entry.fact.pointee) === "KindTypeReference" && entry.fact.mutability === "target-defined"));
  assert.ok(functionPointerFacts.some((entry) =>
    entry.fact.parameters.length === 2 &&
    session.ast.kindName(entry.fact.result) === "KindTypeReference" &&
    entry.fact.abi.join(",") === "target-default"
  ));
});

test("C# target maps source-core struct declarations to one named value-type carrier", () => {
  const sourceText = `
    import { field, struct } from "@tsonic/core/lang.js";

    const Point = struct({ x: field<number>(), y: field<number>() });
    type Point = typeof Point;

    function createPoint(x: number, y: number): Point {
      return { x, y };
    }

    function distance(p1: Point, p2: Point): number {
      return p2.x - p1.x;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./lang.js": "./lang.js",
      })],
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
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all(), []);

  const objectLiterals = collectNodesByKind(sourceFile, session.ast, "KindObjectLiteralExpression");
  assert.equal(objectLiterals.length, 2);
  assert.equal(extensionHost.facts.get(objectLiterals[0], runtimeCarrierFactKey), undefined);
  assert.equal(extensionHost.facts.get(objectLiterals[0], csharpObjectShapeFactKey), undefined);
  assert.equal(extensionHost.facts.get(objectLiterals[1], runtimeCarrierFactKey)?.carrier.id, "Point");
  assert.equal(extensionHost.facts.get(objectLiterals[1], csharpObjectShapeFactKey)?.targetType.id, "Point");

  const pointReferences = collectNodesByKind(sourceFile, session.ast, "KindTypeReference")
    .filter((node) => session.ast.text(node.TypeName) === "Point");
  assert.equal(pointReferences.length, 3);
  assert.deepEqual(pointReferences.map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier.id), [
    "Point",
    "Point",
    "Point",
  ]);
  assert.deepEqual(pointReferences.map((node) => extensionHost.facts.get(node, csharpObjectShapeFactKey)?.targetType.id), [
    "Point",
    "Point",
    "Point",
  ]);

  const propertyAccesses = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .filter((node) => ["p1", "p2"].includes(session.ast.text(node.Expression)));
  assert.equal(propertyAccesses.length, 2);
  assert.deepEqual(propertyAccesses.map((node) => extensionHost.facts.get(node, targetOperationFactKey)?.targetOperation), ["x", "x"]);
  assert.deepEqual(propertyAccesses.map((node) => extensionHost.facts.get(node, csharpTargetOperationFactKey)?.memberName), ["x", "x"]);
});

test("source-semantics rejects source-core marker calls missing required type evidence", () => {
  const sourceText = `
    import { attribute, defaultof, field } from "@tsonic/core/lang.js";

    const missingField = field();
    const missingAttribute = attribute();
    const missingDefault = defaultof();
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./lang.js": "./lang.js",
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0002/);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0005/);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0006/);

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).sort(), [
    "SOURCE_SEMANTICS_MISSING_ATTRIBUTE_TARGET_EVIDENCE",
    "SOURCE_SEMANTICS_MISSING_DEFAULT_TYPE_EVIDENCE",
    "SOURCE_SEMANTICS_MISSING_FIELD_TYPE_EVIDENCE",
  ]);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "field")[0], fieldFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "attribute")[0], attributeFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "defaultof")[0], defaultValueFactKey), undefined);
});

test("source-semantics does not classify shadowed source-core marker names", () => {
  const sourceText = `
    import { out } from "@tsonic/core/lang.js";

    let value!: number;
    {
      const out = <T>(input: T): T => input;
      out(value);
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./lang.js": "./lang.js",
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const calls = collectCallsByCalleeText(sourceFile, session.ast, "out");
  assert.equal(calls.length, 1);
  assert.equal(extensionHost.facts.get(calls[0], argumentPassingFactKey), undefined);
  assert.deepEqual(extensionHost.diagnostics.all(), []);
});

test("source-semantics rejects attribute builder chains with unproven declaration targets", () => {
  const sourceText = `
    import { attribute } from "@tsonic/core/lang.js";

    class ExampleAttribute {}
    class User {
      name = "";
      save(route: string): void {}
    }
    const dynamicTarget = "return";
    const dynamicParameter = "route";

    attribute<User>().property((target) => target).add(ExampleAttribute);
    attribute<User>().method((target) => target.save).parameter(dynamicParameter).add(ExampleAttribute);
    attribute<User>().method((target) => target.save).target(dynamicTarget).add(ExampleAttribute);
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./lang.js": "./lang.js",
      })],
    ]),
    compilerOptions: {
      noLib: true,
      module: "esnext",
      moduleResolution: "bundler",
    },
    extensionHostOptions: {
      activeTarget: "csharp",
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0004/);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0007/);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0008/);

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).sort(), [
    "SOURCE_SEMANTICS_ATTRIBUTE_PARAMETER_NAME_NOT_PROVEN",
    "SOURCE_SEMANTICS_ATTRIBUTE_SELECTOR_TARGET_NOT_PROVEN",
    "SOURCE_SEMANTICS_ATTRIBUTE_TARGET_SPECIFIER_NOT_PROVEN",
  ]);
});

test("C# target rejects neutral borrow and move markers instead of silently erasing them", () => {
  const sourceText = `
    import { borrow, borrowMut, move } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    let value!: int32;
    borrow(value);
    borrowMut(value);
    move(value);
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const flowStates = ["borrow", "borrowMut", "move"].map((callee) =>
    extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, callee)[0], flowStateFactKey)?.state
  );
  assert.deepEqual(flowStates, ["borrowed-shared", "borrowed-mut", "moved"]);
  const flowDiagnostics = extensionHost.diagnostics.all()
    .filter((diagnostic) => diagnostic.extensionCode === "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED");
  assert.equal(flowDiagnostics.length, 3);
  assert.match(flowDiagnostics[0].message, /borrow/u);
  assert.match(flowDiagnostics[1].message, /borrowMut/u);
  assert.match(flowDiagnostics[2].message, /move/u);
});

test("source-semantics ignores local names that are not configured source-core imports", () => {
  const sourceText = `
    function out<T>(value: T): T {
      return value;
    }

    type int = number;
    type LocalInt = int;
    let value = 1;
    out(value);
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const localAlias = collectNodesByKind(sourceFile, session.ast, "KindTypeAliasDeclaration")
    .find((node) => session.ast.text(session.ast.name(node)) === "LocalInt");
  const outCall = collectCallsByCalleeText(sourceFile, session.ast, "out")[0];

  assert.equal(extensionHost.facts.get(localAlias, sourcePrimitiveFactKey), undefined);
  assert.equal(extensionHost.facts.get(outCall, argumentPassingFactKey), undefined);
  assert.deepEqual(extensionHost.diagnostics.all(), []);
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
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

test("source-semantics rejects any assertion conversions without explicit target facts", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";

    export function unsafeCast(value: any): int32 {
      return value as int32;
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const assertion = collectNodesByKind(sourceFile, session.ast, "KindAsExpression")[0];
  assert.ok(assertion);

  assert.equal(extensionHost.facts.get(assertion, targetConversionFactKey), undefined);
  assert.equal(extensionHost.facts.get(assertion, csharpTargetConversionOperationFactKey), undefined);
  const anyAssertionDiagnostics = extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_ASSERTION_CONVERSION_UNSUPPORTED"
  );
  assert.equal(anyAssertionDiagnostics.length, 1);
  assert.match(anyAssertionDiagnostics[0].message, /TypeScript any boundary/);
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
      extensions: csharpTestExtensions(
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
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

function collectCallsByCalleeText(sourceFile, ast, text) {
  return collectNodesByKind(sourceFile, ast, "KindCallExpression")
    .filter((node) => calleeText(node, ast) === text);
}

function calleeText(callExpression, ast) {
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

function argumentPassingFactForCall(sourceFile, ast, extensionHost, callee, index) {
  const call = collectCallsByCalleeText(sourceFile, ast, callee)[index];
  const fact = extensionHost.facts.get(call, argumentPassingFactKey);
  return {
    mode: fact?.mode,
    targetKind: ast.kindName(fact?.targetExpression),
  };
}

function primitiveSummary(fact) {
  return fact === undefined
    ? undefined
    : {
        kind: fact.kind,
        runtimeBase: fact.runtimeBase,
        ...(fact.signed === undefined ? {} : { signed: fact.signed }),
        ...(fact.width === undefined ? {} : { width: fact.width }),
      };
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

function csharpTestExtensions(...extensions) {
  return [
    createTsonicCoreSourceExtension(),
    ...extensions,
  ];
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
