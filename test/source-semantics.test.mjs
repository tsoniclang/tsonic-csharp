import { test, assert, TstsProviderContractVersion, argumentPassingFactKey, attributeFactKey, createCompilerSessionFromFiles, defaultValueFactKey, fieldFactKey, flowStateFactKey, functionPointerFactKey, formatDiagnostics, pointerFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetConversionFactKey, targetOperationFactKey, createCsharpTargetSemanticsExtension, createCsharpSourceSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, createTsonicCoreSourceExtension, providerExportDeclarationsForSourceModule, tsonicCoreSourceSemanticsModules, csharpArrayBoundaryFactKey, csharpObjectShapeFactKey, csharpAttributeApplicationFactKey, csharpTargetOperationFactKey, csharpTargetConversionOperationFactKey, csharpSourceSemanticsModules, createCsharpSourceVirtualModulesProvider, collectFacts, collectFactsForKey, collectIdentifiersByText, collectNodesByKind, collectCallsByCalleeText, collectCallsByCalleeExpressionText, collectTypeReferencesByText, typeAliasTypeNode, calleeText, expressionText, typeReferenceText, argumentPassingFactForCall, primitiveSummary, packageJson, csharpTestExtensions, csharpProviderContext, csharpSourceProfileFiles, csharpJsSourceProfileFiles, createAttributeProviderExtension } from "./source-semantics.helpers.mjs";

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
    import type { bool as csharpBool, byte, char as csharpChar, decimal, double, float, int, long, nint, nuint, sbyte, short, uint, ulong, ushort } from "@tsonic/csharp/types.js";
    import type * as CsharpTypes from "@tsonic/csharp/types.js";

    type LocalBool = bool;
    type LocalChar = CoreTypes.char;
    type I32 = i32;
    type I32Again = I32;
    type DoubleAlias = float64;
    type CsharpBool = csharpBool;
    type CsharpInt = int;
    type CsharpLong = long;
    type CsharpByte = byte;
    type CsharpChar = csharpChar;
    type CsharpDecimal = decimal;
    type CsharpDouble = double;
    type CsharpFloat = float;
    type CsharpNint = nint;
    type CsharpNuint = nuint;
    type CsharpSbyte = sbyte;
    type CsharpShort = short;
    type CsharpUint = uint;
    type CsharpUlong = ulong;
    type CsharpUshort = ushort;
    type NamespaceCsharpInt = CsharpTypes.int;
    type NamespaceCsharpByte = CsharpTypes.byte;
    type NamespaceCsharpDouble = CsharpTypes.double;
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
    .map((node) => [session.ast.text(session.ast.name(node)), typeAliasTypeNode(session, node)]));

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
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("DoubleAlias"), sourcePrimitiveFactKey)), {
    kind: "float64",
    runtimeBase: "number",
    signed: true,
    width: 64,
  });
  const expectedCsharpAliases = new Map([
    ["CsharpBool", { kind: "bool", runtimeBase: "boolean" }],
    ["CsharpByte", { kind: "uint8", runtimeBase: "number", signed: false, width: 8 }],
    ["CsharpChar", { kind: "char", runtimeBase: "string", signed: false, width: 16 }],
    ["CsharpDecimal", { kind: "decimal", runtimeBase: "number", signed: true, width: 128 }],
    ["CsharpDouble", { kind: "float64", runtimeBase: "number", signed: true, width: 64 }],
    ["CsharpFloat", { kind: "float32", runtimeBase: "number", signed: true, width: 32 }],
    ["CsharpInt", { kind: "int32", runtimeBase: "number", signed: true, width: 32 }],
    ["CsharpLong", { kind: "int64", runtimeBase: "bigint", signed: true, width: 64 }],
    ["CsharpNint", { kind: "native-int", runtimeBase: "number", signed: true }],
    ["CsharpNuint", { kind: "native-uint", runtimeBase: "number", signed: false }],
    ["CsharpSbyte", { kind: "int8", runtimeBase: "number", signed: true, width: 8 }],
    ["CsharpShort", { kind: "int16", runtimeBase: "number", signed: true, width: 16 }],
    ["CsharpUint", { kind: "uint32", runtimeBase: "number", signed: false, width: 32 }],
    ["CsharpUlong", { kind: "uint64", runtimeBase: "bigint", signed: false, width: 64 }],
    ["CsharpUshort", { kind: "uint16", runtimeBase: "number", signed: false, width: 16 }],
  ]);
  for (const [aliasName, expectedFact] of expectedCsharpAliases) {
    assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get(aliasName), sourcePrimitiveFactKey)), expectedFact, aliasName);
  }
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("NamespaceCsharpInt"), sourcePrimitiveFactKey)), expectedCsharpAliases.get("CsharpInt"));
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("NamespaceCsharpByte"), sourcePrimitiveFactKey)), expectedCsharpAliases.get("CsharpByte"));
  assert.deepEqual(primitiveSummary(extensionHost.facts.get(aliases.get("NamespaceCsharpDouble"), sourcePrimitiveFactKey)), expectedCsharpAliases.get("CsharpDouble"));
  assert.equal(extensionHost.facts.get(aliases.get("LocalInt"), sourcePrimitiveFactKey), undefined);
});
test("source-semantics keeps any declarations opaque while strict-native rejects dynamic operation facts", () => {
  const context = csharpProviderContext({ typescriptCompatibility: "strict-native" });
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
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
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
  assert.equal(extensionHost.facts.get(elementAccess, runtimeCarrierFactKey)?.carrier?.id, "any");
  assert.equal(extensionHost.facts.get(call, runtimeCarrierFactKey)?.carrier?.id, "any");
  assert.equal(extensionHost.facts.get(elementAccess, targetOperationFactKey), undefined);
  assert.equal(extensionHost.facts.get(call, selectedTargetSignatureFactKey), undefined);
  const anyOperationDiagnostics = extensionHost.diagnostics.all().filter((diagnostic) =>
    diagnostic.extensionCode === "CSHARP_ANY_DYNAMIC_OPERATION_UNSUPPORTED"
  );
  assert.equal(anyOperationDiagnostics.length, 2);
  assert.ok(anyOperationDiagnostics.some((diagnostic) => diagnostic.message.includes("element access")));
  assert.ok(anyOperationDiagnostics.some((diagnostic) => diagnostic.message.includes("call")));
});
test("source-semantics rejects strict-native opaque any operator facts", () => {
  const context = csharpProviderContext({ typescriptCompatibility: "strict-native" });
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
        createCsharpSourceSemanticsExtension(context),
        createCsharpTargetSemanticsExtension(context),
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
  const applicationFacts = collectFactsForKey(sourceFile, session.ast, extensionHost, csharpAttributeApplicationFactKey)
    .map((entry) => entry.fact)
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
    ["ObsoleteAttribute", "declaration", undefined, undefined, 2],
    ["ObsoleteAttribute", "declaration", undefined, "return", 1],
    ["ObsoleteAttribute", "declaration", "route", undefined, 1],
    ["ObsoleteAttribute", "declaration", "route", "param", 1],
    ["NonSerializedAttribute", "declaration", undefined, undefined, 1],
    ["NonSerializedAttribute", "declaration", undefined, "field", 1],
    ["ObsoleteAttribute", "declaration", undefined, "property", 1],
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
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.deepEqual((session.extensionHost?.diagnostics.all() ?? []).map((diagnostic) => diagnostic.extensionCode).sort(), [
    "CSHARP_FIELD_MARKER_FACT_NOT_PROVEN",
    "SOURCE_SEMANTICS_FIELD_CONTEXT_NOT_PROVEN",
    "SOURCE_SEMANTICS_NON_STORAGE_ARGUMENT",
  ]);
  assert.match(formatDiagnostics(diagnostics), /TSTS_SOURCE_SEMANTICS_0001/);

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).sort(), [
    "CSHARP_FIELD_MARKER_FACT_NOT_PROVEN",
    "SOURCE_SEMANTICS_FIELD_CONTEXT_NOT_PROVEN",
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
  assert.equal(session.ast.text(attributeFact?.target), "ExampleAttribute");
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
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
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
test("source-semantics keeps imported interface storage carriers separate from object-literal adapter carriers", () => {
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/types.ts", `
        export const touched = 1;
        export interface Marker {
          value: number;
        }
        export interface Named {
          name: string;
        }
      `],
      ["/src/index.ts", `
        import type { Marker } from "./types.js";
        import { type Named } from "./types.js";

        const marker: Marker = { value: 1 };
        const named: Named = { name: "item" };

        export function read(): string {
          return named.name;
        }
      `],
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
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all(), []);

  const objectLiteralCarrierIds = collectNodesByKind(sourceFile, session.ast, "KindObjectLiteralExpression")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier.id);
  assert.equal(objectLiteralCarrierIds.length, 2);
  assert.match(objectLiteralCarrierIds[0], /^__TsonicShape_Marker_/u);
  assert.match(objectLiteralCarrierIds[1], /^__TsonicShape_Named_/u);

  const declaredStorageCarrierIds = collectNodesByKind(sourceFile, session.ast, "KindVariableDeclaration")
    .map((node) => session.ast.name(node))
    .filter((name) => name !== undefined && ["marker", "named"].includes(session.ast.text(name)))
    .map((name) => extensionHost.facts.get(name, runtimeCarrierFactKey)?.carrier.id);
  assert.deepEqual(declaredStorageCarrierIds, ["Marker", "Named"]);

  const typeReferenceCarrierIds = collectNodesByKind(sourceFile, session.ast, "KindTypeReference")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier.id)
    .filter((id) => id === "Marker" || id === "Named");
  assert.deepEqual(typeReferenceCarrierIds, ["Marker", "Named"]);
});