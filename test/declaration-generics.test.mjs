import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KindClassDeclaration,
  KindExpressionWithTypeArguments,
  KindExtendsKeyword,
  KindIdentifier,
  KindImplementsKeyword,
  KindInterfaceDeclaration,
  KindMethodSignature,
  KindParameter,
  KindTypeReference,
} from "../dist/backend/planner/source-ast.js";
import { planClassDeclaration, planInterfaceDeclaration } from "../dist/backend/planner/declarations.js";
import { printCsharpCompilationUnit } from "../dist/print/csharp-printer.js";
import { csharpTargetTypeParameterConstraintFactKey } from "../dist/source/csharp-facts.js";
import {
  csharpQualifiedTypeRenderShape,
  csharpTargetNamedType,
} from "../dist/source/csharp-source-semantics/target-types.js";

test("planner emits generic interface/class declarations from finalized constraint and heritage facts", () => {
  const sourceExample = `
    export interface NumericRepository<T extends number> {
      read(key: int32): T;
    }

    export class MemoryRepository<T extends number> implements NumericRepository<T> {}
  `;
  assert.match(sourceExample, /NumericRepository<T extends number>/);
  assert.match(sourceExample, /implements NumericRepository<T>/);

  const sourceFile = sourceFileNode("/src/index.ts");
  const interfaceTypeParameter = typeParameter("T", node("KindNumberKeyword"));
  const classTypeParameter = typeParameter("T", node("KindNumberKeyword"));
  const readReturnType = typeReference("T");
  const keyType = typeReference("int32");
  const heritageArgument = typeReference("T");
  const heritageExpression = identifier("NumericRepository");
  const repositoryInterface = node(KindInterfaceDeclaration, {
    name: identifier("NumericRepository"),
    TypeParameters: { Nodes: [interfaceTypeParameter] },
    Members: { Nodes: [
      node(KindMethodSignature, {
        name: identifier("read"),
        Type: readReturnType,
        Parameters: { Nodes: [parameter("key", keyType)] },
      }),
    ] },
  });
  const repositoryClass = node(KindClassDeclaration, {
    name: identifier("MemoryRepository"),
    TypeParameters: { Nodes: [classTypeParameter] },
    HeritageClauses: { Nodes: [heritageClause(KindImplementsKeyword, [
      expressionWithTypeArguments(heritageExpression, [heritageArgument]),
    ])] },
    Members: { Nodes: [] },
  });
  const input = fakeInput(sourceFile, {
    references: new Map([[heritageExpression, repositoryInterface]]),
    runtimeCarriers: new Map([
      [readReturnType, typeParameterCarrier("T")],
      [heritageArgument, typeParameterCarrier("T")],
      [keyType, { kind: "source-primitive", name: "int32" }],
    ]),
    constraintFacts: new Map([
      [interfaceTypeParameter, inumberConstraintFact("T")],
      [classTypeParameter, inumberConstraintFact("T")],
    ]),
  });
  const diagnostics = [];

  const plannedInterface = planInterfaceDeclaration(repositoryInterface, sourceFile, input, diagnostics);
  const plannedClass = planClassDeclaration(repositoryClass, sourceFile, input, diagnostics);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: [plannedInterface, plannedClass],
  });

  assert.deepEqual(diagnostics, []);
  assert.match(printed, /public interface NumericRepository<T>\nwhere T : System\.Numerics\.INumber<T>\n\{/);
  assert.match(printed, /T read\(int key\);/);
  assert.match(printed, /public class MemoryRepository<T> : NumericRepository<T>\nwhere T : System\.Numerics\.INumber<T>\n\{/);
});

test("planner diagnoses constrained generics when finalized facts contain no C# constraint", () => {
  const sourceExample = `
    export class TextBox<T extends string> {}
  `;
  assert.match(sourceExample, /T extends string/);

  const sourceFile = sourceFileNode("/src/index.ts");
  const stringConstraint = node("KindStringKeyword");
  const typeParameterNode = typeParameter("T", stringConstraint);
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("TextBox"),
    TypeParameters: { Nodes: [typeParameterNode] },
    Members: { Nodes: [] },
  });
  const input = fakeInput(sourceFile, {
    constraintFacts: new Map([[typeParameterNode, { constraints: [] }]]),
  });
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, input, diagnostics);

  assert.equal(planned.typeParameters?.[0]?.constraints, undefined);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_UNSUPPORTED_AST");
  assert.match(diagnostics[0].message, /Generic constraints require at least one finalized C# constraint fact/);
});

test("planner emits constructor and keyword generic constraints only from finalized facts", () => {
  const sourceExample = `
    export class Factory<T extends object> {}
  `;
  assert.match(sourceExample, /T extends object/);

  const sourceFile = sourceFileNode("/src/index.ts");
  const typeParameterNode = typeParameter("T", node("KindObjectKeyword"));
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("Factory"),
    TypeParameters: { Nodes: [typeParameterNode] },
    Members: { Nodes: [] },
  });
  const input = fakeInput(sourceFile, {
    constraintFacts: new Map([[typeParameterNode, {
      constraints: [
        { kind: "csharp-keyword", keyword: "class" },
        { kind: "csharp-constructor" },
      ],
    }]]),
  });
  const diagnostics = [];

  const plannedClass = planClassDeclaration(classDeclaration, sourceFile, input, diagnostics);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: [plannedClass],
  });

  assert.deepEqual(diagnostics, []);
  assert.match(printed, /public class Factory<T>\nwhere T : class, new\(\)\n\{/);
});

function node(kind, properties = {}) {
  return { Kind: kind, ...properties };
}

function sourceFileNode(fileName) {
  return { Kind: "KindSourceFile", FileName: fileName, IsDeclarationFile: false, Statements: { Nodes: [] } };
}

function identifier(text) {
  return node(KindIdentifier, { Text: text });
}

function typeReference(text) {
  return node(KindTypeReference, { TypeName: identifier(text), Text: text });
}

function typeParameter(name, constraint) {
  return node("KindTypeParameter", {
    name: identifier(name),
    ...(constraint === undefined ? {} : { Constraint: constraint }),
  });
}

function parameter(name, type) {
  return node(KindParameter, {
    name: identifier(name),
    Type: type,
  });
}

function expressionWithTypeArguments(expression, typeArguments) {
  return node(KindExpressionWithTypeArguments, {
    Expression: expression,
    TypeArguments: { Nodes: typeArguments },
  });
}

function heritageClause(tokenKind, types) {
  return node("KindHeritageClause", {
    Token: tokenValue(tokenKind),
    Types: { Nodes: types },
  });
}

function tokenValue(kind) {
  switch (kind) {
    case KindExtendsKeyword:
      return 1;
    case KindImplementsKeyword:
      return 2;
    default:
      throw new Error(`Unsupported token kind ${kind}`);
  }
}

function inumberConstraintFact(name) {
  return {
    constraints: [{
      kind: "csharp-type",
      type: csharpTargetNamedType("System.Numerics.INumber`1", [typeParameterCarrier(name)], csharpQualifiedTypeRenderShape("System.Numerics", "INumber")),
    }],
  };
}

function typeParameterCarrier(name) {
  return { kind: "type-parameter", name };
}

function fakeInput(sourceFile, options) {
  const references = options.references ?? new Map();
  const runtimeCarriers = options.runtimeCarriers ?? new Map();
  const constraintFacts = options.constraintFacts ?? new Map();
  return {
    ast: {
      kindName: (candidate) => String(candidate?.Kind),
      kindNameFromKind: (kind) => kind === 1 ? KindExtendsKeyword : kind === 2 ? KindImplementsKeyword : String(kind),
      text: (candidate) => String(candidate?.Text ?? ""),
      name: (candidate) => candidate?.name,
      typeArguments: (candidate) => candidate?.TypeArguments?.Nodes ?? [],
      typeParameters: (candidate) => candidate?.TypeParameters?.Nodes ?? [],
      parameters: (candidate) => candidate?.Parameters?.Nodes ?? [],
      parent: () => undefined,
      getSourceFile: () => sourceFile,
      forEachChild(candidate, visit) {
        for (const child of children(candidate)) {
          visit(child);
        }
      },
      is: emptyAstPredicates(),
    },
    sourceFiles: [sourceFile],
    facts: {
      getFact: (subject, key) => key === csharpTargetTypeParameterConstraintFactKey ? constraintFacts.get(subject) : undefined,
      getRuntimeCarrierFact: (subject) => {
        const carrier = runtimeCarriers.get(subject);
        return carrier === undefined ? undefined : { carrier };
      },
      getTargetBindingFact: () => undefined,
      getAttributeFact: () => undefined,
      getSourcePrimitiveFact: () => undefined,
      getPointerFact: () => undefined,
      getFunctionPointerFact: () => undefined,
      getStructFact: () => undefined,
      getTargetConversionFact: () => undefined,
      getContextualTargetTypeFact: () => undefined,
      getArgumentPassingFact: () => undefined,
      getValueTypeFact: () => undefined,
      getFieldFact: () => undefined,
      getSourceMarkerFact: () => undefined,
      getDefaultValueFact: () => undefined,
      getSelectedTargetCall: () => undefined,
      getSelectedTargetOperator: () => undefined,
      getSelectedTargetProperty: () => undefined,
      getSelectedTargetElementAccess: () => undefined,
    },
    semantics: {
      getProjectSourceReferenceForNode: (subject) => {
        const declaration = references.get(subject);
        return declaration === undefined
          ? undefined
          : { declaration, sourceFile, symbol: { Name: declaration.name?.Text ?? "" } };
      },
      getProjectSourceDeclarationForNode: (subject) => references.get(subject),
      getTargetBindingForReference: () => undefined,
      getProjectSourceMethodDispatch: () => undefined,
      getTypeFromTypeNode: () => undefined,
      getTypeAtLocation: () => undefined,
      describeTypeAtLocation: () => undefined,
      getResolvedCallReturnRuntimeCarrier: () => undefined,
      getResolvedCallReturnType: () => undefined,
      getRuntimeCarrierForNode: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getProjectSourceReferenceForSymbol: () => undefined,
    },
    types: emptyTypeQueries(),
  };
}

function children(candidate) {
  if (candidate === undefined || candidate === null || typeof candidate !== "object") {
    return [];
  }
  const result = [];
  for (const value of Object.values(candidate)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value.Nodes)) {
      result.push(...value.Nodes.filter(Boolean));
    } else if (typeof value === "object" && "Kind" in value) {
      result.push(value);
    }
  }
  return result;
}

function emptyAstPredicates() {
  return new Proxy({}, {
    get: () => () => false,
  });
}

function emptyTypeQueries() {
  return {
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
  };
}
