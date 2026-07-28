import { test, assert, TstsProviderContractVersion, argumentPassingFactKey, attributeFactKey, createCompilerSessionFromFiles, defaultValueFactKey, fieldFactKey, flowStateFactKey, functionPointerFactKey, formatDiagnostics, pointerFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, sourcePrimitiveFactKey, structFactKey, targetConversionFactKey, targetOperationFactKey, createCsharpTargetSemanticsExtension, createCsharpSourceSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, createTsonicCoreSourceExtension, providerExportDeclarationsForSourceModule, tsonicCoreSourceSemanticsModules, csharpArrayBoundaryFactKey, csharpObjectShapeFactKey, csharpAttributeApplicationFactKey, csharpTargetOperationFactKey, csharpTargetConversionOperationFactKey, csharpSourceSemanticsModules, createCsharpSourceVirtualModulesProvider, collectFacts, collectFactsForKey, collectIdentifiersByText, collectNodesByKind, collectCallsByCalleeText, collectCallsByCalleeExpressionText, collectTypeReferencesByText, typeAliasTypeNode, calleeText, expressionText, typeReferenceText, argumentPassingFactForCall, primitiveSummary, packageJson, csharpTestExtensions, csharpProviderContext, csharpSourceProfileFiles, csharpJsSourceProfileFiles, createAttributeProviderExtension, assertNoExtensionDiagnostics } from "./source-semantics.helpers.mjs";

test("source-semantics closes generic structural object-literal carriers over type parameters", () => {
  const sourceText = `
    type Box<T> = { value: T };

    export function create<T>(value: T): Box<T> {
      return { value };
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
  assertNoExtensionDiagnostics(extensionHost);

  const objectLiteral = collectNodesByKind(sourceFile, session.ast, "KindObjectLiteralExpression")[0];
  const fact = extensionHost.facts.get(objectLiteral, csharpObjectShapeFactKey);
  const sourceMember = collectNodesByKind(sourceFile, session.ast, "KindShorthandPropertyAssignment")[0];
  const { sourceSubjects, ...memberShape } = fact.members[0];

  assert.match(fact?.targetType.id, /^__TsonicShape_/u);
  assert.deepEqual(fact.targetType.typeArguments, [{ kind: "type-parameter", name: "T" }]);
  assert.deepEqual(memberShape, {
    sourceName: "value",
    targetName: "value",
    memberKind: "property",
    type: { kind: "type-parameter", name: "T" },
  });
  assert.equal(sourceSubjects?.includes(sourceMember), true);
  assert.deepEqual(extensionHost.facts.get(objectLiteral, runtimeCarrierFactKey)?.carrier, fact.targetType);
});
test("source-semantics reuses utility-projected object shape identity inside Parameters tuple carriers", () => {
  const sourceText = `
    type Fn = (input: { count: number }) => number;
    type Args = Parameters<Fn>;

    export function read([input]: Args): number {
      return input.count;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
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
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  assertNoExtensionDiagnostics(extensionHost);

  const typeLiteral = collectNodesByKind(sourceFile, session.ast, "KindTypeLiteral")[0];
  const argsReference = collectNodesByKind(sourceFile, session.ast, "KindTypeReference")
    .find((node) => session.ast.text(node.TypeName) === "Args");
  const parameter = collectNodesByKind(sourceFile, session.ast, "KindParameter")
    .find((node) => session.ast.kindName(node.name) === "KindArrayBindingPattern");
  const objectShape = extensionHost.facts.get(typeLiteral, csharpObjectShapeFactKey);
  const argsCarrier = extensionHost.facts.get(argsReference, runtimeCarrierFactKey)?.carrier;
  const parameterCarrier = extensionHost.facts.get(parameter, runtimeCarrierFactKey)?.carrier;

  assert.equal(argsCarrier?.kind, "tuple");
  assert.equal(parameterCarrier?.kind, "tuple");
  assert.equal(argsCarrier.elements[0].id, objectShape.targetType.id);
  assert.equal(parameterCarrier.elements[0].id, objectShape.targetType.id);
});
test("source-semantics records tuple member operation facts from TSTS numeric literal types", () => {
  const sourceText = `
    const one = 1 as const;

    export function read(pair: [number, string]): string {
      return pair[one];
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
  assertNoExtensionDiagnostics(extensionHost);

  const elementAccess = collectNodesByKind(sourceFile, session.ast, "KindElementAccessExpression")[0];
  const operation = extensionHost.facts.get(elementAccess, targetOperationFactKey);
  const csharpOperation = extensionHost.facts.get(elementAccess, csharpTargetOperationFactKey);

  assert.equal(operation.operationId, "tsonic.csharp.source.tuple.item.1");
  assert.equal(operation.targetOperation, "Item2");
  assert.equal(csharpOperation.operationKind, "property");
  assert.equal(csharpOperation.memberName, "Item2");
});
test("source-semantics records generic and C# operation facts for optional source array element access", () => {
  const sourceText = `
    import type { int32 } from "@tsonic/core/types.js";

    export function read(values: number[] | null, index: int32, fallback: number): number {
      return values?.[index] ?? fallback;
    }
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ...csharpSourceProfileFiles().map((file) => [file.path, file.text]),
      ["/src/node_modules/@tsonic/core/package.json", packageJson("@tsonic/core", {
        "./types.js": "./types.js",
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
  assertNoExtensionDiagnostics(extensionHost);

  const elementAccess = collectNodesByKind(sourceFile, session.ast, "KindElementAccessExpression")[0];
  const operation = extensionHost.facts.get(elementAccess, targetOperationFactKey);
  const csharpOperation = extensionHost.facts.get(elementAccess, csharpTargetOperationFactKey);

  assert.equal(operation.operationId, "tsonic.csharp.source-profile.Array.indexer");
  assert.equal(operation.operationKind, "indexer");
  assert.equal(operation.targetOperation, "Item");
  assert.deepEqual(operation.resultType, { kind: "source-primitive", name: "float64" });
  assert.equal(csharpOperation.operationId, operation.operationId);
  assert.equal(csharpOperation.operationKind, "indexer");
  assert.equal(csharpOperation.memberName, "Item");
});
test("source-semantics records inline object parameter shapes for checked member access", () => {
  const sourceText = `
    export function read(input: { count: number }): number {
      return input.count;
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
  assertNoExtensionDiagnostics(extensionHost);

  const typeLiteral = collectNodesByKind(sourceFile, session.ast, "KindTypeLiteral")[0];
  const propertyAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .find((node) => session.ast.text(node.Expression) === "input");
  const fact = extensionHost.facts.get(typeLiteral, csharpObjectShapeFactKey);

  assert.match(fact?.targetType.id, /^__TsonicShape_/u);
  assert.deepEqual(fact.members.map((member) => [member.sourceName, member.targetName]), [["count", "count"]]);
  assert.equal(extensionHost.facts.get(propertyAccess, targetOperationFactKey)?.targetOperation, "count");
  assert.equal(extensionHost.facts.get(propertyAccess, csharpTargetOperationFactKey)?.memberName, "count");
});
test("source-semantics records structural type-literal methods with contextual delegate returns", () => {
  const sourceText = `
    type Visitor = { visit(value: number): number };

    export const visitor: Visitor = {
      visit(value) {
        return value + 1;
      },
    };
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
  assertNoExtensionDiagnostics(extensionHost);

  const objectLiteral = collectNodesByKind(sourceFile, session.ast, "KindObjectLiteralExpression")[0];
  const fact = extensionHost.facts.get(objectLiteral, csharpObjectShapeFactKey);
  const method = fact?.members.find((member) => member.sourceName === "visit");

  assert.equal(method?.memberKind, "method");
  assert.equal(method?.type.kind, "target-named");
  assert.equal(method?.type.kind === "target-named" ? method.type.id : undefined, "System.Func`2");
  assert.deepEqual(method?.type.kind === "target-named"
    ? method.type.csharpDelegateSignature
    : undefined, {
      parameters: [{ kind: "source-primitive", name: "float64" }],
      returnType: { kind: "source-primitive", name: "float64" },
    });
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
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.match(formatDiagnostics(diagnostics), /TSONIC_SOURCE_CORE_9901102/);
  assert.match(formatDiagnostics(diagnostics), /TSONIC_SOURCE_CORE_9901105/);
  assert.match(formatDiagnostics(diagnostics), /TSONIC_SOURCE_CORE_9901106/);

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).sort(), [
    "CSHARP_ATTRIBUTE_MARKER_FACT_NOT_PROVEN",
    "CSHARP_DEFAULT_MARKER_FACT_NOT_PROVEN",
    "CSHARP_FIELD_MARKER_FACT_NOT_PROVEN",
    "SOURCE_SEMANTICS_MISSING_ATTRIBUTE_TARGET_EVIDENCE",
    "SOURCE_SEMANTICS_MISSING_DEFAULT_TYPE_EVIDENCE",
    "SOURCE_SEMANTICS_MISSING_FIELD_TYPE_EVIDENCE",
  ]);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "field")[0], fieldFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "attribute")[0], attributeFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "defaultof")[0], defaultValueFactKey), undefined);
});
test("C# source semantics does not map shadowed source-core marker names", () => {
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
  assert.equal(extensionHost.facts.get(calls[0], selectedTargetSignatureFactKey), undefined);
  assert.equal(extensionHost.facts.get(calls[0], targetOperationFactKey), undefined);
  assert.equal(extensionHost.facts.get(calls[0], csharpTargetOperationFactKey), undefined);
  assertNoExtensionDiagnostics(extensionHost);
});
test("C# source semantics rejects unsupported local barrels for C# lang aliases", () => {
  const sourceText = `
    import { out } from "./barrel.js";

    let value!: number;
    out(value);
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/barrel.ts", [
        "export { out, ref, inref, struct, field, attribute, defaultof } from '@tsonic/csharp/lang.js';",
        "export type { ptr, fnptr } from '@tsonic/csharp/lang.js';",
      ].join("\n")],
      ["/src/node_modules/@tsonic/csharp/package.json", packageJson("@tsonic/csharp", {
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
  const reexportDiagnostics = extensionHost.diagnostics.all();
  assert.deepEqual(reexportDiagnostics.map((diagnostic) => diagnostic.extensionCode), [
    "CSHARP_SOURCE_LANG_REEXPORT_UNSUPPORTED",
    "CSHARP_SOURCE_LANG_REEXPORT_UNSUPPORTED",
  ]);
  assert.deepEqual(reexportDiagnostics.map((diagnostic) => diagnostic.numericCode), [9100170, 9100170]);
  assert.equal(reexportDiagnostics.every((diagnostic) => diagnostic.nodeOrSpan !== undefined), true);
  const calls = collectCallsByCalleeText(sourceFile, session.ast, "out");
  assert.equal(calls.length, 1);
  assert.equal(extensionHost.facts.get(calls[0], argumentPassingFactKey), undefined);
});
test("C# source semantics rejects renamed and namespace local barrels for C# lang aliases", () => {
  const sourceText = `
    import { writeOut, CsharpLang } from "./barrel.js";
    import type { Pointer, Callback } from "./barrel.js";

    let value!: number;
    writeOut(value);
    CsharpLang.out(value);
    type ValuePointer = Pointer<number>;
    type ValueCallback = Callback<[number], number>;
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/barrel.ts", [
        "export { out as writeOut } from '@tsonic/csharp/lang.js';",
        "export type { ptr as Pointer, fnptr as Callback } from '@tsonic/csharp/lang.js';",
        "export * as CsharpLang from '@tsonic/csharp/lang.js';",
      ].join("\n")],
      ["/src/node_modules/@tsonic/csharp/package.json", packageJson("@tsonic/csharp", {
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
  session.ensureChecked(sourceFile);

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode), [
    "CSHARP_SOURCE_LANG_REEXPORT_UNSUPPORTED",
    "CSHARP_SOURCE_LANG_REEXPORT_UNSUPPORTED",
    "CSHARP_SOURCE_LANG_REEXPORT_UNSUPPORTED",
  ]);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "writeOut")[0], argumentPassingFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeExpressionText(sourceFile, session.ast, "CsharpLang.out")[0], argumentPassingFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectTypeReferencesByText(sourceFile, session.ast, "Pointer")[0], pointerFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectTypeReferencesByText(sourceFile, session.ast, "Callback")[0], functionPointerFactKey), undefined);
});
test("C# source semantics rejects unsupported type-only barrels for C# type aliases", () => {
  const sourceText = `
    export type { ptr, fnptr } from "@tsonic/csharp/lang.js";
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/node_modules/@tsonic/csharp/package.json", packageJson("@tsonic/csharp", {
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
  session.ensureChecked(sourceFile);
  const extensionHost = session.finalizeExtensions();
  const diagnostics = session.getDiagnostics("semantic", sourceFile);
  assert.match(formatDiagnostics(diagnostics), /TSONIC_CSHARP_9100170/u);
  assert.deepEqual(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode), [
    "CSHARP_SOURCE_LANG_REEXPORT_UNSUPPORTED",
  ]);
});
test("source-semantics rejects attribute builder chains with unproven declaration targets", () => {
  const sourceText = `
    import { attribute } from "@tsonic/core/lang.js";

    class ExampleAttribute {}
    class User {
      name = "";
      save(route: string): void {}
    }
    declare const dynamicTarget: string;
    declare const dynamicParameter: string;

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
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ),
    },
  });
  const sourceFile = session.getSourceFile("/src/index.ts");
  session.ensureChecked(sourceFile);

  const extensionHost = session.finalizeExtensions();
  assert.deepEqual(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).sort(), [
    "SOURCE_SEMANTICS_ATTRIBUTE_PARAMETER_NAME_NOT_PROVEN",
    "SOURCE_SEMANTICS_ATTRIBUTE_SELECTOR_TARGET_NOT_PROVEN",
    "SOURCE_SEMANTICS_ATTRIBUTE_TARGET_SPECIFIER_NOT_PROVEN",
  ]);
});
test("C# target rejects neutral borrow and move markers instead of silently erasing them", () => {
  const sourceText = `
    import { borrow, borrowMut, move, borrow as sharedBorrow, borrowMut as mutableBorrow, move as movedValue } from "@tsonic/core/lang.js";
    import * as CoreLang from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";
    import { borrow as localBorrow, borrowMut as localBorrowMut, move as localMove } from "./local.js";

    let value!: int32;
    borrow(value);
    borrowMut(value);
    move(value);
    sharedBorrow(value);
    mutableBorrow(value);
    movedValue(value);
    CoreLang.borrow(value);
    CoreLang.borrowMut(value);
    CoreLang.move(value);
    localBorrow(value);
    localBorrowMut(value);
    localMove(value);
  `;
  const session = createCompilerSessionFromFiles({
    currentDirectory: "/src",
    files: new Map([
      ["/src/index.ts", sourceText],
      ["/src/local.ts", [
        "export function borrow<T>(value: T): T { return value; }",
        "export function borrowMut<T>(value: T): T { return value; }",
        "export function move<T>(value: T): T { return value; }",
      ].join("\n")],
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
  const flowStates = ["borrow", "borrowMut", "move", "sharedBorrow", "mutableBorrow", "movedValue", "CoreLang.borrow", "CoreLang.borrowMut", "CoreLang.move"].map((callee) =>
    extensionHost.facts.get(collectCallsByCalleeExpressionText(sourceFile, session.ast, callee)[0], flowStateFactKey)?.state
  );
  assert.deepEqual(flowStates, [
    "borrowed-shared",
    "borrowed-mut",
    "moved",
    "borrowed-shared",
    "borrowed-mut",
    "moved",
    "borrowed-shared",
    "borrowed-mut",
    "moved",
  ]);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "localBorrow")[0], flowStateFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "localBorrowMut")[0], flowStateFactKey), undefined);
  assert.equal(extensionHost.facts.get(collectCallsByCalleeText(sourceFile, session.ast, "localMove")[0], flowStateFactKey), undefined);
  const flowDiagnostics = extensionHost.diagnostics.all()
    .filter((diagnostic) => diagnostic.extensionCode === "CSHARP_SOURCE_FLOW_MARKER_UNSUPPORTED");
  assert.equal(flowDiagnostics.length, 3);
  assert.deepEqual(flowDiagnostics.map((diagnostic) => diagnostic.message.match(/'(borrow|borrowMut|move)'/u)?.[1]), [
    "borrow",
    "borrowMut",
    "move",
  ]);
});
test("source-semantics ignores local names that are not configured source-core imports", () => {
  const sourceText = `
    function out<T>(value: T): T {
      return value;
    }
    function borrow<T>(value: T): T {
      return value;
    }

    type int = number;
    type ptr<T> = T;
    type LocalInt = int;
    type LocalPtr = ptr<number>;
    let value = 1;
    out(value);
    borrow(value);
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
  const localPointerAlias = collectNodesByKind(sourceFile, session.ast, "KindTypeAliasDeclaration")
    .find((node) => session.ast.text(session.ast.name(node)) === "LocalPtr");
  const outCall = collectCallsByCalleeText(sourceFile, session.ast, "out")[0];
  const borrowCall = collectCallsByCalleeText(sourceFile, session.ast, "borrow")[0];

  assert.equal(extensionHost.facts.get(localAlias, sourcePrimitiveFactKey), undefined);
  assert.equal(extensionHost.facts.get(localPointerAlias, pointerFactKey), undefined);
  assert.equal(extensionHost.facts.get(outCall, argumentPassingFactKey), undefined);
  assert.equal(extensionHost.facts.get(borrowCall, flowStateFactKey), undefined);
  assertNoExtensionDiagnostics(extensionHost);
});
