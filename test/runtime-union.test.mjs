import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import {
  createCompilerSessionFromFiles,
  formatDiagnostics,
  runtimeCarrierFactKey,
} from "@tsonic/tsts";
import { createTsonicCoreSourceExtension } from "@tsonic/source-core";
import { getCsharpTypeForNode } from "../dist/backend/planner/csharp-types.js";
import { planExpression } from "../dist/backend/planner/expressions.js";
import {
  KindIdentifier,
  KindNumericLiteral,
  KindUnionType,
} from "../dist/backend/planner/source-ast.js";
import {
  printCsharpExpression,
  printCsharpType,
} from "../dist/print/csharp-printer.js";
import { csharpTargetConversionOperationFactKey } from "../dist/source/csharp-facts.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpRuntimeUnionTargetType,
  csharpSourcePrimitiveTargetType,
  csharpStringTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";
import {
  createCsharpSourceSemanticsExtension,
  createCsharpTargetSemanticsExtension,
} from "../dist/index.js";

test("source semantics records runtime union carrier from TSTS union constituents", () => {
  const sourceText = `
    export function choose(flag: boolean): number | string {
      const value: number | string = flag ? 1 : "ready";
      return value;
    }
  `;
  const session = createCompilerSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const unionType = collectNodesByKind(sourceFile, session.ast, KindUnionType)[0];
  assert.ok(unionType);
  const carrier = extensionHost.facts.get(unionType, runtimeCarrierFactKey)?.carrier;

  assert.equal(carrier?.kind, "target-named");
  assert.equal(carrier.id, "Tsonic.CSharp.Runtime.Union`2");
  assert.deepEqual((carrier.typeArguments ?? []).map(carrierKey).sort(), [
    "source:float64",
    "target:System.String",
  ]);
  assert.deepEqual((carrier.csharpRuntimeUnionArms ?? []).map(carrierKey).sort(), [
    "source:float64",
    "target:System.String",
  ]);
});

test("source semantics records runtime union carriers for TSTS-proven nullish constituents", () => {
  const sourceText = `
    type MaybeUndefined = number | string | undefined;
    type MaybeNull = number | string | null;
    let maybeUndefined!: MaybeUndefined;
    let maybeNull!: MaybeNull;
  `;
  const session = createCompilerSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const carriers = collectNodesByKind(sourceFile, session.ast, KindUnionType)
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier)
    .filter((carrier) => carrier !== undefined);
  const armSets = carriers.map((carrier) => (carrier.csharpRuntimeUnionArms ?? []).map(carrierKey).sort());

  assert.ok(armSets.some((arms) => armSetEquals(arms, [
    "source:float64",
    "target:System.String",
    "target:Tsonic.CSharp.Runtime.Undefined",
  ])));
  assert.ok(armSets.some((arms) => armSetEquals(arms, [
    "source:float64",
    "target:System.String",
    "target:Tsonic.CSharp.Runtime.Null",
  ])));
});

test("source semantics keeps narrowed branch carrier direct instead of union-carrier guessing", () => {
  const sourceText = `
    export function read(value: number | string): string {
      if (typeof value === "string") {
        value;
        return value;
      }
      return "";
    }
  `;
  const session = createCompilerSession(sourceText);
  const sourceFile = session.getSourceFile("/src/index.ts");
  const diagnostics = session.ensureChecked(sourceFile);
  assert.equal(formatDiagnostics(diagnostics), "");

  const extensionHost = session.finalizeExtensions();
  const valueCarriers = collectIdentifiersByText(sourceFile, session.ast, "value")
    .map((node) => extensionHost.facts.get(node, runtimeCarrierFactKey)?.carrier)
    .filter((carrier) => carrier !== undefined);

  assert.ok(valueCarriers.some((carrier) => carrierKey(carrier) === "target:System.String"));
  assert.ok(valueCarriers.some((carrier) => carrierKey(carrier) === "target:Tsonic.CSharp.Runtime.Union`2"));
  assert.equal(valueCarriers.some((carrier) => /As[0-9]|__tsonic_value/.test(JSON.stringify(carrier))), false);
});

test("union type annotation emission consumes finalized runtime union carrier facts", () => {
  const unionTypeNode = { Kind: KindUnionType };
  const carrier = runtimeUnionCarrier();
  const diagnostics = [];

  const output = getCsharpTypeForNode(unionTypeNode, {}, fakeInput({
    runtimeCarrierSubject: unionTypeNode,
    runtimeCarrier: { carrier },
  }), undefined, diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpType(output), "Tsonic.CSharp.Runtime.Union<double, string>");
});

test("union type annotation emission fails closed without finalized runtime carrier facts", () => {
  const unionTypeNode = { Kind: KindUnionType };
  const diagnostics = [];

  const output = getCsharpTypeForNode(unionTypeNode, {}, fakeInput(), undefined, diagnostics);

  assert.equal(output.kind, "InvalidType");
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /Union type annotations require finalized TSTS\/provider storage facts/);
});

test("runtime union projection emits only from finalized C# target conversion facts", () => {
  const literal = { Kind: KindNumericLiteral, Text: "42" };
  const carrier = runtimeUnionCarrier();
  const diagnostics = [];

  const output = planExpression(literal, {}, fakeInput({
    conversionSubject: literal,
    conversion: {
      convertedType: carrier,
      operation: {
        operationId: "Tsonic.CSharp.Runtime.Union`2.From1",
        operationKind: "method",
        targetOperation: "From1",
      },
    },
    csharpConversionSubject: literal,
    csharpConversion: {
      kind: "member",
      operationId: "Tsonic.CSharp.Runtime.Union`2.From1",
      operationKind: "method",
      memberName: "From1",
      static: true,
      declaringType: carrier,
      resultType: carrier,
    },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(output.kind, "InvocationExpression");
  assert.equal(printCsharpExpression(output), "Tsonic.CSharp.Runtime.Union<double, string>.From1(42)");
});

test("narrowed branch expression emits the concrete finalized carrier value directly", () => {
  const value = identifier("value");
  const diagnostics = [];

  const output = planExpression(value, {}, fakeInput({
    runtimeCarrierSubject: value,
    runtimeCarrier: { carrier: csharpStringTargetType() },
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(output), "value");
  assert.doesNotMatch(printCsharpExpression(output), /As[0-9]|__tsonic_value/);
});

test("narrowed runtime union storage emits finalized arm projection", () => {
  const value = identifier("value");
  const declarationName = identifier("value");
  const declaration = { Kind: "KindParameter", name: declarationName };
  const sourceFile = {};
  const carrier = runtimeUnionCarrier();
  const diagnostics = [];

  const output = planExpression(value, sourceFile, fakeInput({
    projectSourceReferenceSubject: value,
    projectSourceReference: { declaration, sourceFile },
    runtimeCarrierFacts: new Map([
      [value, { carrier: csharpStringTargetType() }],
      [declaration, { carrier }],
      [declarationName, { carrier }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(printCsharpExpression(output), "value.As2()");
});

function createCompilerSession(sourceText) {
  return createCompilerSessionFromFiles({
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
        createTsonicCoreSourceExtension(),
        createCsharpSourceSemanticsExtension(csharpProviderContext()),
        createCsharpTargetSemanticsExtension(csharpProviderContext()),
      ],
    },
  });
}

function runtimeUnionCarrier() {
  const carrier = csharpRuntimeUnionTargetType([
    csharpSourcePrimitiveTargetType("float64"),
    csharpStringTargetType(),
  ]);
  assert.ok(carrier);
  return carrier;
}

function armSetEquals(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function carrierKey(carrier) {
  switch (carrier.kind) {
    case "source-primitive":
      return `source:${carrier.name}`;
    case "target-named":
      return `target:${carrier.id}`;
    default:
      return `${carrier.kind}:${carrier.id ?? carrier.name ?? ""}`;
  }
}

function identifier(name) {
  return {
    Kind: KindIdentifier,
    Text: name,
  };
}

function fakeInput(options = {}) {
  return {
    ast: fakeAst,
    sourceFiles: [],
    facts: {
      getDefaultValueFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getTargetConversionFact: (subject) => subject === options.conversionSubject ? options.conversion : undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getRuntimeCarrierFact: (subject) => options.runtimeCarrierFacts?.get(subject) ??
        (subject === options.runtimeCarrierSubject ? options.runtimeCarrier : undefined),
      getObjectShapeFact: () => undefined,
      getTargetBindingFact: () => undefined,
      getSourcePrimitiveFact: () => undefined,
      getFact: (subject, key) => {
        if (subject === options.csharpConversionSubject && key === csharpTargetConversionOperationFactKey) {
          return options.csharpConversion;
        }
        return undefined;
      },
      getTargetIterationFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getAttributeFact: () => undefined,
    },
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: (subject) => subject === options.projectSourceReferenceSubject
        ? options.projectSourceReference
        : undefined,
      getObjectShapeForNode: () => undefined,
      getResolvedSymbol: () => undefined,
      getSymbolAtLocation: () => undefined,
      getTypeAtLocation: () => undefined,
      getTypeFromTypeNode: () => undefined,
      describeTypeAtLocation: () => undefined,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => resolvedCarrierResolution((options.runtimeCarrierFacts?.get(subject) ??
        (subject === options.runtimeCarrierSubject ? options.runtimeCarrier : undefined))?.carrier),
      resolveRuntimeCarrierForNode: (subject) => resolvedCarrierResolution((options.runtimeCarrierFacts?.get(subject) ??
        (subject === options.runtimeCarrierSubject ? options.runtimeCarrier : undefined))?.carrier),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: () => missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
    types: {
      isAny: () => false,
      isUnknown: () => false,
      isNumberLike: () => false,
      isStringLike: () => false,
      isBooleanLike: () => false,
      isBigIntLike: () => false,
      isVoidLike: () => false,
      isUnion: () => false,
      isTuple: () => false,
      isArrayLike: () => false,
      isTypeReference: () => false,
      isNullish: () => false,
      getCallSignatures: () => [],
      getReturnTypeOfSignature: () => undefined,
      getUnionOrIntersectionTypes: () => [],
      getTupleElementTypes: () => [],
      getTypeArguments: () => [],
      getIndexInfos: () => [],
      getTypeReferenceTarget: (type) => type,
    },
  };
}

const fakeAst = {
  kindName: (node) => node === undefined ? "Undefined" : String(node.Kind),
  kindNameFromKind: (kind) => kind === undefined ? "Undefined" : String(kind),
  getSourceFile: () => undefined,
  is: {
    IsKeywordTypeNode: () => false,
    IsTypeReferenceNode: () => false,
    IsUnionTypeNode: (node) => node?.Kind === KindUnionType,
    IsIntersectionTypeNode: () => false,
    IsConditionalTypeNode: () => false,
    IsInferTypeNode: () => false,
    IsArrayTypeNode: () => false,
    IsIndexedAccessTypeNode: () => false,
    IsLiteralTypeNode: () => false,
    IsThisTypeNode: () => false,
    IsMappedTypeNode: () => false,
    IsTupleTypeNode: () => false,
    IsOptionalTypeNode: () => false,
    IsRestTypeNode: () => false,
    IsParenthesizedTypeNode: () => false,
    IsFunctionTypeNode: () => false,
    IsConstructorTypeNode: () => false,
    IsTemplateLiteralTypeNode: () => false,
    IsImportTypeNode: () => false,
  },
};

function collectIdentifiersByText(sourceFile, ast, text) {
  const nodes = [];
  visit(sourceFile);
  return nodes;

  function visit(node) {
    if (ast.kindName(node) === KindIdentifier && ast.text(node) === text) {
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

function csharpProviderContext() {
  const target = { id: "csharp" };
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
