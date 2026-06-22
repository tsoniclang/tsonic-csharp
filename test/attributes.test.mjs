import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KindClassDeclaration,
  KindConstructor,
  KindGetAccessor,
  KindIdentifier,
  KindMethodDeclaration,
  KindParameter,
  KindPropertyAccessExpression,
  KindPropertyDeclaration,
  KindStringLiteral,
  KindTypeReference,
} from "../dist/backend/planner/source-ast.js";
import { diagnoseUnresolvedAttributeApplications } from "../dist/backend/planner/attributes.js";
import { planClassDeclaration } from "../dist/backend/planner/declarations.js";
import { printCsharpCompilationUnit } from "../dist/print/csharp-printer.js";

test("planner emits finalized source attribute facts on supported declaration placements", () => {
  const sourceExample = `
    import { attribute } from "@tsonic/core/lang.js";
    import { ObsoleteAttribute, SerializableAttribute } from "@example/attributes/index.js";

    export class User {
      constructor(id: string) {}
      name = "";
      get display(): string { return this.name; }
      save(route: string): void {}
    }

    attribute<User>().add(SerializableAttribute);
    attribute<User>().add(ObsoleteAttribute, "class");
    attribute<User>().constructor().add(ObsoleteAttribute, "constructor");
    attribute<User>().constructor().parameter("id").add(ObsoleteAttribute, "id");
    attribute<User>().property((target) => target.name).add(ObsoleteAttribute, "field");
    attribute<User>().property((target) => target.display).add(ObsoleteAttribute, "property");
    attribute<User>().method((target) => target.save).add(ObsoleteAttribute, "method");
    attribute<User>().method((target) => target.save).parameter("route").add(ObsoleteAttribute, "route");
  `;
  assert.match(sourceExample, /attribute<User>\(\)\.method/);

  const sourceFile = sourceFileNode("/src/index.ts");
  const stringType = node("KindStringKeyword");
  const voidType = node("KindVoidKeyword");
  const idParameter = node(KindParameter, { name: identifier("id"), Type: stringType });
  const routeParameter = node(KindParameter, { name: identifier("route"), Type: stringType });
  const constructor = node(KindConstructor, {
    Parameters: { Nodes: [idParameter] },
    Body: block(),
  });
  const field = node(KindPropertyDeclaration, { name: identifier("name"), Type: stringType });
  const property = node(KindGetAccessor, { name: identifier("display"), Type: stringType, Body: block() });
  const method = node(KindMethodDeclaration, {
    name: identifier("save"),
    Type: voidType,
    Parameters: { Nodes: [routeParameter] },
    Body: block(),
  });
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("User"),
    Members: { Nodes: [constructor, field, property, method] },
  });
  const classTarget = typeReference("User");
  const fieldTarget = propertyAccess("name");
  const propertyTarget = propertyAccess("display");
  const methodTarget = propertyAccess("save");
  const serializableAttribute = identifier("SerializableAttribute");
  const obsoleteAttribute = identifier("ObsoleteAttribute");
  const classArgument = stringLiteral("class");
  const fieldArgument = stringLiteral("field");
  const propertyArgument = stringLiteral("property");
  const methodArgument = stringLiteral("method");
  const routeArgument = stringLiteral("route");
  const constructorArgument = stringLiteral("constructor");
  const idArgument = stringLiteral("id");
  const classSerializableCall = node("KindCallExpression");
  const classObsoleteCall = node("KindCallExpression");
  const constructorAttributeCall = node("KindCallExpression");
  const constructorParameterAttributeCall = node("KindCallExpression");
  const fieldAttributeCall = node("KindCallExpression");
  const propertyAttributeCall = node("KindCallExpression");
  const methodAttributeCall = node("KindCallExpression");
  const parameterAttributeCall = node("KindCallExpression");
  sourceFile.Statements = {
    Nodes: [
      classDeclaration,
      classSerializableCall,
      classObsoleteCall,
      constructorAttributeCall,
      constructorParameterAttributeCall,
      fieldAttributeCall,
      propertyAttributeCall,
      methodAttributeCall,
      parameterAttributeCall,
    ],
  };

  const input = fakeInput(sourceFile, {
    references: new Map([
      [classTarget, classDeclaration],
      [fieldTarget, field],
      [propertyTarget, property],
      [methodTarget, method],
    ]),
    targetBindings: new Map([
      [serializableAttribute, attributeBinding("SerializableAttribute")],
      [obsoleteAttribute, attributeBinding("ObsoleteAttribute")],
    ]),
    attributeFacts: new Map([
      [classSerializableCall, attributeFact(serializableAttribute, classTarget)],
      [classObsoleteCall, attributeFact(obsoleteAttribute, classTarget, [classArgument])],
      [constructorAttributeCall, {
        ...attributeFact(obsoleteAttribute, classTarget, [constructorArgument]),
        applicationPlacement: "constructor",
      }],
      [constructorParameterAttributeCall, {
        ...attributeFact(obsoleteAttribute, classTarget, [idArgument]),
        applicationPlacement: "constructor",
        applicationParameterName: "id",
      }],
      [fieldAttributeCall, attributeFact(obsoleteAttribute, fieldTarget, [fieldArgument])],
      [propertyAttributeCall, attributeFact(obsoleteAttribute, propertyTarget, [propertyArgument])],
      [methodAttributeCall, attributeFact(obsoleteAttribute, methodTarget, [methodArgument])],
      [parameterAttributeCall, {
        ...attributeFact(obsoleteAttribute, methodTarget, [routeArgument]),
        applicationParameterName: "route",
      }],
    ]),
  });
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, input, diagnostics);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: [planned],
  });

  assert.deepEqual(diagnostics, []);
  assert.match(printed, /\[System\.SerializableAttribute\]\n\[System\.ObsoleteAttribute\("class"\)\]\npublic class User/);
  assert.match(printed, /\[System\.ObsoleteAttribute\("constructor"\)\]\n    public User\(\[System\.ObsoleteAttribute\("id"\)\] string id\)/);
  assert.match(printed, /\[System\.ObsoleteAttribute\("field"\)\]\n    public string name;/);
  assert.match(printed, /\[System\.ObsoleteAttribute\("property"\)\]\n    public string display/);
  assert.match(printed, /\[System\.ObsoleteAttribute\("method"\)\]\n    public void save\(\[System\.ObsoleteAttribute\("route"\)\] string route\)/);
  assert.doesNotMatch(printed, /__tsonic_erased_source_marker|attribute<User>/);
});

test("planner diagnoses constructor attributes without an explicit source constructor", () => {
  const sourceFile = sourceFileNode("/src/index.ts");
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("User"),
    Members: { Nodes: [] },
  });
  const classTarget = typeReference("User");
  const obsoleteAttribute = identifier("ObsoleteAttribute");
  const constructorAttributeCall = node("KindCallExpression");
  sourceFile.Statements = {
    Nodes: [
      classDeclaration,
      constructorAttributeCall,
    ],
  };
  const input = fakeInput(sourceFile, {
    references: new Map([[classTarget, classDeclaration]]),
    targetBindings: new Map([[obsoleteAttribute, attributeBinding("ObsoleteAttribute")]]),
    attributeFacts: new Map([
      [constructorAttributeCall, {
        ...attributeFact(obsoleteAttribute, classTarget),
        applicationPlacement: "constructor",
      }],
    ]),
  });
  const diagnostics = [];

  diagnoseUnresolvedAttributeApplications(sourceFile, input, diagnostics);

  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_UNSUPPORTED_ATTRIBUTE_APPLICATION");
  assert.match(diagnostics[0].message, /implicit default constructors have no finalized source declaration/);
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

function stringLiteral(text) {
  return node(KindStringLiteral, { Text: text });
}

function typeReference(text) {
  return node(KindTypeReference, { TypeName: identifier(text), Text: text });
}

function propertyAccess(name) {
  return node(KindPropertyAccessExpression, {
    Expression: identifier("target"),
    name: identifier(name),
    Text: `target.${name}`,
  });
}

function block() {
  return node("KindBlock", { Statements: { Nodes: [] } });
}

function attributeBinding(name) {
  return {
    id: `System.${name}`,
    sourceName: name,
    targetName: `System.${name}`,
    target: "csharp",
    kind: "class",
    csharpRender: { kind: "named", namespace: ["System"], name },
  };
}

function attributeFact(target, applicationTarget, args = []) {
  return {
    target,
    applicationTarget,
    attributeName: target.Text,
    arguments: args,
  };
}

function fakeInput(sourceFile, options) {
  return {
    ast: {
      kindName: (candidate) => String(candidate?.Kind),
      kindNameFromKind: (kind) => String(kind),
      text: (candidate) => String(candidate?.Text ?? ""),
      name: (candidate) => candidate?.name,
      typeArguments: (candidate) => candidate?.TypeArguments?.Nodes ?? [],
      typeParameters: (candidate) => candidate?.TypeParameters?.Nodes ?? [],
      parameters: (candidate) => candidate?.Parameters?.Nodes ?? [],
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
      getAttributeFact: (subject) => options.attributeFacts.get(subject),
      getTargetBindingFact: () => undefined,
      getFact: () => undefined,
      getRuntimeCarrierFact: () => undefined,
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
        const declaration = options.references.get(subject);
        return declaration === undefined
          ? undefined
          : { declaration, sourceFile, symbol: { Name: declaration.name?.Text ?? "" } };
      },
      getProjectSourceDeclarationForNode: (subject) => options.references.get(subject),
      getTargetBindingForReference: (subject) => options.targetBindings.get(subject),
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
