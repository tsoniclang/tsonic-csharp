import { test, assert, createCompilerSessionFromFiles, formatDiagnostics, providerVirtualDeclarationFactKey, runtimeCarrierFactKey, selectedTargetSignatureFactKey, targetOperationFactKey, createTsonicCoreSourceExtension, csharpArrayBoundaryFactKey, csharpSourceReturnCarrierFactKey, csharpTargetIterationFactKey, csharpTargetMutationOperationFactKey, csharpTargetOperationFactKey, createCsharpJsSurfaceExtension, createCsharpSourceSemanticsExtension, createCsharpTargetSemanticsExtension, csharpJsSourceProfileOwnerId, csharpJsSurfaceSourceProfileContributions, csharpSourceProfileContributions, csharpSourceProfileOwnerId, planArrayLiteralExpressionWithCarrier, createCsharpNativeOperationsProvider, createProductCsharpJsSurfaceOperationsProvider, mapCsharpJsSurfaceCheckedIteration, csharpJsMapCollectionPolicy, csharpJsSetCollectionPolicy, createCsharpJsSurfaceOperationsProvider, arrayLengthRequest, arrayLengthDeclaration, arrayMemberDeclaration, arrayConstructorDeclaration, sourceLibraryMemberDeclaration, namespaceImportSourceFile, fakeNamespaceImportContext, sourceLibraryPropertyRequest, fakeNodeSubject, fakeHost, fakeContext, fakeAstIs, createCsharpSession, sourceProfileFiles, declarationFiles, fakeTargetPack, collectNodesByKind, collectFactValues, collectAllNodes, jsCallRequest, jsCallRequestWithoutSignature, fakeCallCallee, selectedSourceLibrarySignature, nodejsCallRequest, nodejsCallRequestWithoutSignature, nodejsPropertyRequest, nodejsVirtualDeclaration, nodejsVirtualMemberDeclaration, int32Type, float64Type, boolType, nullishType, stringType, regexpType, dateType, jsObjectType, tsValueType, jsArrayType, jsMapType, jsSetType, int32ArrayType, int32EnumerableType, int32ReadOnlyListType, genericSystemCollectionType, recordDictionaryType, surfaceObjectShapeFact, dictionaryBinding, actionOfInt32Type, funcInt32ToStringType, TestFactStore } from "./surface-boundary.helpers.mjs";
import { mapCsharpJsArrayMutationOperator } from "../dist/source/csharp-source-semantics/surfaces/js/array-mutations.js";
import { csharpSelectedCallTargetFactKey } from "../dist/source/csharp-facts.js";

test("JS surface maps JSON.parse from selected Tsonic JS source-profile declaration and closed string facts", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "parse"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSON.parse");
  assert.equal(result.value.selectedSignature.member.returnType.id, "Tsonic.CSharp.Js.TsValue");
  assert.equal(facts.get(call, runtimeCarrierFactKey), undefined);
});
test("JS surface maps JSON.stringify only from closed JSON value carrier facts", () => {
  const call = {};
  const parsedStringifyCall = {};
  const value = {};
  const parsedValue = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
    [parsedValue, tsValueType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [value],
  }), fakeContext(facts));
  const parsedResult = provider.mapCheckedCall(jsCallRequest(parsedStringifyCall, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [parsedValue],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSON.stringify:object");
  assert.equal(parsedResult.kind, "accept");
  assert.equal(parsedResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  assert.equal(parsedResult.value.selectedSignature.member.returnType.id, "System.String");
  assert.equal(facts.get(parsedStringifyCall, runtimeCarrierFactKey), undefined);
});
test("JS surface maps nested JSON.stringify(JSON.parse(value)) through finalized TsValue carrier facts", () => {
  const parseCall = {};
  const stringifyCall = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const parseResult = provider.mapCheckedCall(jsCallRequest(parseCall, sourceLibraryMemberDeclaration("JSON", "parse"), {
    arguments: [value],
  }), fakeContext(facts));
  assert.equal(parseResult.kind, "accept");
  facts.set(parseCall, selectedTargetSignatureFactKey, parseResult.value.selectedSignature);
  facts.setCsharpRuntimeCarrier(parseCall, tsValueType());

  const stringifyResult = provider.mapCheckedCall(jsCallRequest(stringifyCall, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [parseCall],
  }), fakeContext(facts));

  assert.equal(facts.get(parseCall, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.TsValue");
  assert.equal(stringifyResult.kind, "accept");
  assert.equal(stringifyResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  assert.equal(facts.get(stringifyCall, csharpTargetOperationFactKey), undefined);
  assert.equal(facts.get(stringifyCall, csharpSelectedCallTargetFactKey)?.member.id, "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  assert.deepEqual(facts.get(stringifyCall, csharpSelectedCallTargetFactKey)?.finalizationRequirement, {
    kind: "closed-json-value",
    argumentIndex: 0,
  });
});
test("JS surface defers JSON.stringify without closed JSON value carrier facts until finalization", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
});
test("JS surface rejects JSON.stringify when the argument carrier fact is mutated away from TsValue", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  facts.setCsharpRuntimeCarrier(value, { kind: "opaque", id: "any" });
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("JSON", "stringify"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.equal(facts.get(call, csharpTargetOperationFactKey), undefined);
});
test("selected JS surface finalizes source-level nested JSON.parse carrier for JSON.stringify", () => {
  const session = createCsharpSession(`
    export function roundtrip(value: string) {
      return JSON.stringify(JSON.parse(value));
    }
  `, { selectedSurfaces: [{ id: "js" }], typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const calls = collectNodesByKind(sourceFile, session.ast, "KindCallExpression");
  const stringifyCall = calls.find((call) =>
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id === "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  const parseCall = calls.find((call) =>
    extensionHost.facts.get(call, selectedTargetSignatureFactKey)?.member.id === "Tsonic.CSharp.Js.JSON.parse");

  assert.equal(extensionHost.facts.get(parseCall, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.TsValue");
  assert.equal(extensionHost.facts.get(stringifyCall, csharpTargetOperationFactKey)?.operationId, "Tsonic.CSharp.Js.JSON.stringify:tsvalue");
  assert.equal(extensionHost.diagnostics.all().some((diagnostic) => diagnostic.extensionCode === "FACT_CONFLICT"), false);
  assert.equal(extensionHost.diagnostics.all().some((diagnostic) => diagnostic.extensionCode === "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED"), false);
});
test("selected JS surface finalizes array element and length operations from carrier facts", () => {
  const session = createCsharpSession(`
    export function read(values: number[]): number {
      const value = values[0];
      return value + values.length;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const elementAccess = collectNodesByKind(sourceFile, session.ast, "KindElementAccessExpression")[0];
  const lengthAccess = collectNodesByKind(sourceFile, session.ast, "KindPropertyAccessExpression")
    .find((node) => session.ast.text(session.ast.name(node)) === "length");

  assert.ok(elementAccess);
  assert.ok(lengthAccess);
  assert.equal(extensionHost.facts.get(elementAccess, targetOperationFactKey)?.operationId, "tsonic.csharp.js.array.indexer");
  assert.equal(extensionHost.facts.get(elementAccess, csharpTargetOperationFactKey)?.operationId, "tsonic.csharp.js.array.indexer");
  assert.equal(extensionHost.facts.get(elementAccess, csharpTargetOperationFactKey)?.memberName, "Item");
  assert.equal(extensionHost.facts.get(lengthAccess, targetOperationFactKey)?.operationId, "tsonic.csharp.js.Array.length");
  assert.equal(extensionHost.facts.get(lengthAccess, csharpTargetOperationFactKey)?.memberName, "Count");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).includes("CSHARP_JS_ARRAY_ELEMENT_ACCESS_REQUIRES_CARRIER"), false);
});
test("selected JS surface finalizes Array length construction to JSArray carrier", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function make(size: int32): int32 {
      const values = new Array<int32>(size);
      return values.length;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const construct = collectNodesByKind(sourceFile, session.ast, "KindNewExpression")[0];

  assert.ok(construct);
  assert.equal(extensionHost.facts.get(construct, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.JSArray`1");
  assert.equal(extensionHost.facts.get(construct, runtimeCarrierFactKey)?.carrier.typeArguments[0].name, "int32");
  assert.equal(extensionHost.facts.get(construct, selectedTargetSignatureFactKey)?.member.id, "Tsonic.CSharp.Js.JSArray..ctor(System.Double)");
  assert.equal(extensionHost.facts.get(construct, selectedTargetSignatureFactKey)?.member.returnType.typeArguments[0].name, "int32");
  assert.equal(extensionHost.facts.get(construct, csharpTargetOperationFactKey)?.operationKind, "constructor");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});
test("selected JS surface finalizes Array length assignment as value-producing setLength operation", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function reset(values: int32[], size: int32): int32 {
      return values.length = size;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const assignment = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];
  const operation = extensionHost.facts.get(assignment, csharpTargetMutationOperationFactKey);

  assert.ok(assignment);
  assert.equal(operation?.operationId, "tsonic.csharp.js.array.setLength");
  assert.equal(operation?.operationKind, "method");
  assert.equal(operation?.memberName, "setLength");
  assert.equal(operation?.resultType?.name, "int32");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});
test("JS array length mutation maps only from selected property evidence on the checked operator request", () => {
  const receiver = fakeNodeSubject({});
  const left = fakeNodeSubject({ Expression: receiver }, "PropertyAccessExpression");
  const right = fakeNodeSubject({}, "NumericLiteral");
  const expression = fakeNodeSubject({}, "BinaryExpression");
  const carrier = jsArrayType();
  const facts = new TestFactStore();
  facts.setCsharpRuntimeCarrier(receiver, carrier);
  facts.set(left, targetOperationFactKey, {
    operationId: "tsonic.csharp.js.Array.length",
    operationKind: "property",
    targetOperation: "Count",
  });
  const host = {
    ...fakeHost(undefined, new Map([[right, int32Type()]])),
    targetId: "csharp",
    isIntegralTargetTypeRef: (type) => type?.kind === "source-primitive" && type.name === "int32",
    isLiteralRepresentableAsTargetType: () => false,
  };

  const mapped = mapCsharpJsArrayMutationOperator({
    target: "csharp",
    expression,
    operator: "=",
    left,
    right,
  }, fakeContext(facts), host);

  assert.equal(mapped?.kind, "accept");
  assert.equal(mapped?.value.operation.operationId, "tsonic.csharp.js.array.setLength");
  assert.equal(facts.get(expression, csharpTargetMutationOperationFactKey)?.operationId, "tsonic.csharp.js.array.setLength");
});
test("JS array length mutation refuses same-shaped syntax without selected property evidence", () => {
  const receiver = fakeNodeSubject({});
  const left = fakeNodeSubject({ Expression: receiver }, "PropertyAccessExpression");
  const right = fakeNodeSubject({}, "NumericLiteral");
  const expression = fakeNodeSubject({}, "BinaryExpression");
  const facts = new TestFactStore();
  facts.setCsharpRuntimeCarrier(receiver, jsArrayType());
  const host = {
    ...fakeHost(undefined, new Map([[right, int32Type()]])),
    targetId: "csharp",
    isIntegralTargetTypeRef: () => true,
    isLiteralRepresentableAsTargetType: () => false,
  };

  const mapped = mapCsharpJsArrayMutationOperator({
    target: "csharp",
    expression,
    operator: "=",
    left,
    right,
  }, fakeContext(facts), host);

  assert.equal(mapped, undefined);
  assert.equal(facts.get(expression, csharpTargetMutationOperationFactKey), undefined);
});
test("selected JS surface records inferred source-owned array return carriers on declarations", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function make(value: int32) {
      return [value, value];
    }

    const values = make(1);
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const functionDeclaration = collectNodesByKind(sourceFile, session.ast, "KindFunctionDeclaration")[0];
  const returnCarrier = extensionHost.facts.get(functionDeclaration, csharpSourceReturnCarrierFactKey)?.carrier;

  assert.ok(functionDeclaration);
  assert.equal(returnCarrier?.id, "System.Collections.Generic.List`1");
  assert.equal(returnCarrier?.typeArguments?.[0]?.name, "float64");
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});
test("selected JS surface classifies array hole-presence as full JS without inventing operation facts", () => {
  const session = createCsharpSession(`
    export function hasSlot(values: number[], index: number): boolean {
      return index in values;
    }
  `, { selectedSurfaces: [{ id: "js" }] });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const valuesIdentifier = collectNodesByKind(sourceFile, session.ast, "KindIdentifier")
    .filter((node) => session.ast.text(node) === "values")
    .find((node) => extensionHost.facts.get(node, runtimeCarrierFactKey) !== undefined);
  const holePresence = collectNodesByKind(sourceFile, session.ast, "KindBinaryExpression")[0];

  assert.ok(valuesIdentifier);
  assert.ok(holePresence);
  assert.equal(extensionHost.facts.get(valuesIdentifier, csharpArrayBoundaryFactKey)?.coreCarrierLane, "js-full-internal");
  assert.equal(extensionHost.facts.get(valuesIdentifier, csharpArrayBoundaryFactKey)?.publicShape, "compat-facade");
  assert.equal(extensionHost.facts.get(valuesIdentifier, runtimeCarrierFactKey)?.carrier.id, "Tsonic.CSharp.Js.JSArray`1");
  assert.equal(extensionHost.facts.get(holePresence, targetOperationFactKey), undefined);
  assert.equal(extensionHost.facts.get(holePresence, csharpTargetOperationFactKey), undefined);
});
test("selected JS surface finalizes unchanged chained standard-library TypeScript operations", () => {
  const session = createCsharpSession(`
    export function existingTs(values: number[], text: string): string {
      const normalized = text.trim().toUpperCase();
      const joined = values.join(",");
      const keys = Object.keys(values).join("|");
      const encoded = JSON.stringify(JSON.parse(text));
      const stamp = new Date(0).toISOString();
      const matched = /ok/.test(encoded);
      console.log(normalized, joined, keys, stamp, matched, Math.max(values.length, 1));
      return normalized + joined + keys + encoded + stamp;
    }
  `, { selectedSurfaces: [{ id: "js" }], typescriptCompatibility: "compat" });
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const selectedMemberIds = collectFactValues(sourceFile, session, extensionHost, selectedTargetSignatureFactKey)
    .map((fact) => fact.member.id);
  const operationIds = collectFactValues(sourceFile, session, extensionHost, targetOperationFactKey)
    .map((fact) => fact.operationId);

  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.String.trim"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.String.toUpperCase"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Array.join"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Array.join:full-js"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Array.join"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Object.keys:jsarray"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.JSON.parse"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.JSON.stringify:tsvalue"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Date..ctor(System.Double)"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Date.toISOString"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.RegExp.test"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.console.log"));
  assert.ok(selectedMemberIds.includes("Tsonic.CSharp.Js.Math.max"));
  assert.ok(operationIds.includes("tsonic.csharp.js.Array.length"));
});
test("C# source semantics finalizes prefix bitwise operator facts from proven operand target facts", () => {
  const session = createCsharpSession(`
    import type { int32 } from "@tsonic/core/types.js";

    export function mask(value: int32): int32 {
      const result: int32 = value + 1;
      return ~result;
    }
  `);
  const sourceFile = session.getSourceFile("/src/index.ts");
  assert.equal(formatDiagnostics(session.ensureChecked(sourceFile)), "");

  const extensionHost = session.finalizeExtensions();
  const prefix = collectNodesByKind(sourceFile, session.ast, "KindPrefixUnaryExpression")[0];

  assert.ok(prefix);
  const selectedOperation = extensionHost.facts.get(prefix, targetOperationFactKey);
  assert.deepEqual({
    operationId: selectedOperation?.operationId,
    operationKind: selectedOperation?.operationKind,
    targetOperation: selectedOperation?.targetOperation,
    resultType: selectedOperation?.resultType,
  }, {
    operationId: "tsonic.csharp.operator.~",
    operationKind: "operator",
    targetOperation: "~",
    resultType: { kind: "source-primitive", name: "int32" },
  });
  assert.equal(selectedOperation?.provenance?.sourceExpression, prefix);
  assert.deepEqual(Object.keys(selectedOperation?.provenance ?? {}).sort(), ["sourceExpression"]);
  assert.deepEqual(extensionHost.facts.get(prefix, csharpTargetOperationFactKey), {
    kind: "operator-token",
    operationId: "tsonic.csharp.operator.~",
    operator: "~",
    resultType: { kind: "source-primitive", name: "int32" },
  });
  assert.equal(extensionHost.diagnostics.all().map((diagnostic) => diagnostic.extensionCode).join("\n"), "");
});
test("C# planner rejects sparse array literal elisions before dense lowering", () => {
  const diagnostics = [];
  const literal = {
    Kind: "KindArrayLiteralExpression",
    Elements: {
      Nodes: [
        { Kind: "KindNumericLiteral", Text: "1" },
        { Kind: "KindOmittedExpression" },
        { Kind: "KindNumericLiteral", Text: "3" },
      ],
    },
  };

  const result = planArrayLiteralExpressionWithCarrier(literal, {}, {
    ast: {
      kindName: (node) => node?.Kind ?? "Undefined",
    },
  }, diagnostics, { kind: "array", element: int32Type() }, {
    planExpression: () => assert.fail("Sparse array literal elisions must fail before element expression planning."),
    planExpressionWithExpectedType: () => assert.fail("Sparse array literal elisions must fail before expected element planning."),
  });

  assert.equal(result, undefined);
  assert.equal(diagnostics[0]?.code, "CSHARP_UNSUPPORTED_AST");
  assert.match(diagnostics[0]?.message, /Sparse array literal elisions require closed JSArray hole construction facts/);
});
test("JS surface accepts method-valued console property access without C# operation facts", () => {
  const expression = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedPropertyAccess(sourceLibraryPropertyRequest(expression, sourceLibraryMemberDeclaration("Console", "log"), "log"), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.operation.operationId, "tsonic.csharp.js.Console.log.callee");
  assert.equal(facts.get(expression, csharpTargetOperationFactKey), undefined);
});
test("JS surface maps console.log calls from selected Tsonic JS source-profile declaration identity", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "log"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.log");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.parameters[0]?.paramsArray, true);
});
test("JS surface maps console.assert through closed condition and message facts", () => {
  const call = {};
  const condition = {};
  const message = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [condition, boolType()],
    [message, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "assert"), {
    arguments: [condition, message],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.assert");
});
test("JS surface maps console assert optional and variadic source shape", () => {
  const zeroArgCall = {};
  const multiArgCall = {};
  const condition = {};
  const message = {};
  const count = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [condition, boolType()],
    [message, stringType()],
    [count, float64Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const zeroArgResult = provider.mapCheckedCall(jsCallRequest(zeroArgCall, sourceLibraryMemberDeclaration("Console", "assert")), fakeContext(facts));
  const multiArgResult = provider.mapCheckedCall(jsCallRequest(multiArgCall, sourceLibraryMemberDeclaration("Console", "assert"), {
    arguments: [condition, message, count],
  }), fakeContext(facts));

  assert.equal(zeroArgResult.kind, "accept");
  assert.equal(zeroArgResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.assert");
  assert.equal(zeroArgResult.value.selectedSignature.member.parameters[0]?.optional, true);
  assert.equal(zeroArgResult.value.selectedSignature.member.parameters[1]?.paramsArray, true);
  assert.equal(multiArgResult.kind, "accept");
  assert.equal(multiArgResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.assert");
});
test("JS surface maps full selected Console member shapes", () => {
  const item = {};
  const options = {};
  const properties = {};
  const label = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [item, stringType()],
    [options, stringType()],
    [properties, int32ReadOnlyListType()],
    [label, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const dirResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "dir"), {
    arguments: [item, options],
  }), fakeContext(facts));
  const dirNoArgResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "dir")), fakeContext(facts));
  const dirxmlResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "dirxml"), {
    arguments: [item, options],
  }), fakeContext(facts));
  const tableResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "table"), {
    arguments: [item, properties],
  }), fakeContext(facts));
  const timeStampResult = provider.mapCheckedCall(jsCallRequest({}, sourceLibraryMemberDeclaration("Console", "timeStamp"), {
    arguments: [label],
  }), fakeContext(facts));

  assert.equal(dirResult.kind, "accept");
  assert.equal(dirResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.dir");
  assert.equal(dirNoArgResult.kind, "accept");
  assert.equal(dirNoArgResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.dir");
  assert.equal(dirxmlResult.kind, "accept");
  assert.equal(dirxmlResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.dirxml");
  assert.equal(dirxmlResult.value.selectedSignature.member.parameters[0]?.paramsArray, true);
  assert.equal(tableResult.kind, "accept");
  assert.equal(tableResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.table");
  assert.equal(timeStampResult.kind, "accept");
  assert.equal(timeStampResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.console.timeStamp");
});
test("JS surface rejects console.time when selected arguments do not match runtime shape", () => {
  const call = {};
  const label = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [label, float64Type()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "time"), {
    arguments: [label],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
});
test("JS surface rejects console.log without closed argument target facts", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Console", "log"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_ARGUMENT_REQUIRES_TARGET_FACT");
  assert.match(result.diagnostic.message, /argument 1/);
});
test("JS surface maps Object.keys from selected Tsonic JS source-profile declaration and closed JSObject carrier", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "keys"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.keys:jsobject");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].id, "System.String");
});
test("JS surface maps Object.values from selected Tsonic JS source-profile declaration and closed JSObject carrier", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "values"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.values:jsobject");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].id, "System.Object");
});
test("JS surface maps Object.entries from selected Tsonic JS source-profile declaration and closed JSObject carrier", () => {
  const call = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "entries"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.entries:jsobject");
  assert.equal(result.value.selectedSignature.member.static, true);
  assert.equal(result.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].kind, "tuple");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].elements[0].id, "System.String");
  assert.equal(result.value.selectedSignature.member.returnType.typeArguments[0].elements[1].id, "System.Object");
});
test("JS surface maps Object.keys for closed JSArray and string carriers", () => {
  const arrayCall = {};
  const arrayValue = {};
  const stringCall = {};
  const stringValue = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [arrayValue, jsArrayType(int32Type())],
    [stringValue, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const arrayResult = provider.mapCheckedCall(jsCallRequest(arrayCall, sourceLibraryMemberDeclaration("ObjectConstructor", "keys"), {
    arguments: [arrayValue],
  }), fakeContext(facts));
  const stringResult = provider.mapCheckedCall(jsCallRequest(stringCall, sourceLibraryMemberDeclaration("ObjectConstructor", "keys"), {
    arguments: [stringValue],
  }), fakeContext(facts));

  assert.equal(arrayResult.kind, "accept");
  assert.equal(arrayResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.keys:jsarray");
  assert.equal(stringResult.kind, "accept");
  assert.equal(stringResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.keys:string");
});
test("JS surface maps Object.values and Object.entries for closed Record dictionary carriers", () => {
  const valuesCall = {};
  const entriesCall = {};
  const value = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, recordDictionaryType(stringType(), int32Type())],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes, dictionaryBinding()));

  const valuesResult = provider.mapCheckedCall(jsCallRequest(valuesCall, sourceLibraryMemberDeclaration("ObjectConstructor", "values"), {
    arguments: [value],
  }), fakeContext(facts));
  const entriesResult = provider.mapCheckedCall(jsCallRequest(entriesCall, sourceLibraryMemberDeclaration("ObjectConstructor", "entries"), {
    arguments: [value],
  }), fakeContext(facts));

  assert.equal(valuesResult.kind, "accept");
  assert.equal(valuesResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.values:dictionary");
  assert.equal(valuesResult.value.selectedSignature.member.returnType.id, "System.Collections.Generic.List`1");
  assert.equal(valuesResult.value.selectedSignature.member.returnType.typeArguments[0].name, "int32");
  assert.equal(entriesResult.kind, "accept");
  assert.equal(entriesResult.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.entries:dictionary");
  assert.equal(entriesResult.value.selectedSignature.member.returnType.typeArguments[0].kind, "tuple");
  assert.equal(entriesResult.value.selectedSignature.member.returnType.typeArguments[0].elements[1].name, "int32");
});
test("JS surface maps Object.hasOwnProperty only from selected declaration and closed JSObject receiver", () => {
  const call = {};
  const receiver = {};
  const key = {};
  const facts = new TestFactStore();
  facts.setCsharpRuntimeCarrier(receiver, jsObjectType());
  const targetTypes = new Map([
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Object", "hasOwnProperty"), {
    arguments: [key],
    calleeReceiver: receiver,
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.JSObject.hasOwnProperty");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});
test("JS surface maps Object.hasOwn only from selected declaration and closed JSObject target facts", () => {
  const call = {};
  const value = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, jsObjectType()],
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "hasOwn"), {
    arguments: [value, key],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.hasOwn");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});
test("JS surface maps Object.hasOwn for closed Record dictionary target facts", () => {
  const call = {};
  const value = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, recordDictionaryType(stringType(), int32Type())],
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes, dictionaryBinding()));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "hasOwn"), {
    arguments: [value, key],
  }), fakeContext(facts));

  assert.equal(result.kind, "accept");
  assert.equal(result.value.selectedSignature.member.id, "Tsonic.CSharp.Js.Object.hasOwn:dictionary");
  assert.equal(result.value.selectedSignature.member.parameters[0]?.type.id, "System.Collections.Generic.Dictionary`2");
  assert.equal(result.value.selectedSignature.member.returnType.name, "bool");
});
test("JS surface rejects Object.hasOwn without supported closed object-helper target facts", () => {
  const call = {};
  const value = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [value, boolType()],
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("ObjectConstructor", "hasOwn"), {
    arguments: [value, key],
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /Object\.hasOwn/);
});
test("JS surface rejects Object.hasOwnProperty without closed JSObject receiver facts", () => {
  const call = {};
  const key = {};
  const facts = new TestFactStore();
  const targetTypes = new Map([
    [key, stringType()],
  ]);
  const provider = createCsharpJsSurfaceOperationsProvider(fakeHost(undefined, targetTypes));

  const result = provider.mapCheckedCall(jsCallRequest(call, sourceLibraryMemberDeclaration("Object", "hasOwnProperty"), {
    arguments: [key],
    calleeReceiver: {},
  }), fakeContext(facts));

  assert.equal(result.kind, "reject");
  assert.equal(result.diagnostic.extensionCode, "CSHARP_SOURCE_LIBRARY_CALL_NOT_MAPPED");
  assert.match(result.diagnostic.message, /receiver lacks finalized target runtime facts/);
});
