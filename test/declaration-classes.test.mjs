import { test } from "node:test";
import assert from "node:assert/strict";
import {
  missingCarrierResolution,
  missingParameterCarrierResolution,
  resolvedCarrierResolution,
} from "./helpers/target-facts.mjs";
import {
  KindAwaitExpression,
  KindClassDeclaration,
  KindClassStaticBlockDeclaration,
  KindFunctionDeclaration,
  KindGetAccessor,
  KindIdentifier,
  KindMethodDeclaration,
  KindParameter,
  KindPrivateIdentifier,
  KindPropertyDeclaration,
  KindReturnStatement,
  ModifierFlagsAbstract,
  ModifierFlagsAsync,
  ModifierFlagsPrivate,
  ModifierFlagsStatic,
} from "../dist/backend/planner/source-ast.js";
import { planClassDeclaration, planFunctionDeclaration } from "../dist/backend/planner/declarations.js";
import { printCsharpCompilationUnit } from "../dist/print/csharp-printer.js";
import { csharpTargetNameFactKey } from "../dist/source/csharp-facts.js";
import {
  csharpSourcePrimitiveTargetType,
  csharpTaskTargetType,
} from "../dist/source/csharp-source-semantics/target-types.js";

test("class declarations emit public/static members and static blocks through Roslyn AST", () => {
  const sourceExample = `
    export class Counter {
      static count: number;
      static {
      }
    }
  `;
  assert.match(sourceExample, /static count: number/);
  assert.match(sourceExample, /static \{/);

  const sourceFile = sourceFileNode("/src/counter.ts");
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("Counter"),
    Members: { Nodes: [
      property("count", numberType(), ModifierFlagsStatic),
      node(KindClassStaticBlockDeclaration, { Body: block([]) }),
    ] },
  });
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, fakeInput(sourceFile), diagnostics);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: [planned],
  });

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned.members[0]?.modifiers, ["public", "static"]);
  assert.deepEqual(planned.members[1]?.kind, "ConstructorDeclaration");
  assert.deepEqual(planned.members[1]?.modifiers, ["static"]);
  assert.match(printed, /public class Counter/);
  assert.match(printed, /public static double count;/);
  assert.match(printed, /static Counter\(\)\n\s+\{/);
});

test("private class fields require a finalized target-name fact", () => {
  const sourceExample = `
    export class SecretBox {
      #value: string;
    }
  `;
  assert.match(sourceExample, /#value: string/);

  const sourceFile = sourceFileNode("/src/secret-box.ts");
  const privateName = privateIdentifier("#value");
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("SecretBox"),
    Members: { Nodes: [
      property(privateName, stringType()),
    ] },
  });
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, fakeInput(sourceFile, {
    targetNames: new Map([[privateName, "__value"]]),
  }), diagnostics);
  const printed = printCsharpCompilationUnit({
    kind: "CompilationUnit",
    usings: [],
    members: [planned],
  });

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned.members[0]?.modifiers, ["private"]);
  assert.match(printed, /private string __value;/);
});

test("private class fields fail closed without finalized target-name facts", () => {
  const sourceExample = `
    export class SecretBox {
      #value: string;
    }
  `;
  assert.match(sourceExample, /#value: string/);

  const sourceFile = sourceFileNode("/src/secret-box.ts");
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("SecretBox"),
    Members: { Nodes: [
      property(privateIdentifier("#value"), stringType()),
    ] },
  });
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, fakeInput(sourceFile), diagnostics);

  assert.equal(planned.members[0]?.kind, "FieldDeclaration");
  assert.deepEqual(planned.members[0]?.modifiers, ["private"]);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_UNSUPPORTED_NAME");
  assert.match(diagnostics[0].message, /requires a finalized C# target-name fact/);
});

test("explicit TypeScript visibility modifiers are diagnostics, not backend visibility inference", () => {
  const sourceExample = `
    export class Visibility {
      private value: string;
    }
  `;
  assert.match(sourceExample, /private value: string/);

  const sourceFile = sourceFileNode("/src/visibility.ts");
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("Visibility"),
    Members: { Nodes: [
      property("value", stringType(), ModifierFlagsPrivate),
    ] },
  });
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, fakeInput(sourceFile), diagnostics);

  assert.deepEqual(planned.members[0]?.modifiers, ["public"]);
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "CSHARP_UNSUPPORTED_AST");
  assert.match(diagnostics[0].message, /TypeScript-only modifier 'private'/);
});

test("abstract classes and members are deterministic diagnostics until provider facts own target shape", () => {
  const sourceExample = `
    export abstract class AbstractBox {
      abstract read(): string;
    }
  `;
  assert.match(sourceExample, /abstract class AbstractBox/);
  assert.match(sourceExample, /abstract read\(\): string/);

  const sourceFile = sourceFileNode("/src/abstract-box.ts");
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("AbstractBox"),
    ModifierFlags: ModifierFlagsAbstract,
    Members: { Nodes: [
      node(KindMethodDeclaration, {
        name: identifier("read"),
        ModifierFlags: ModifierFlagsAbstract,
        Type: stringType(),
      }),
    ] },
  });
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, fakeInput(sourceFile), diagnostics);

  assert.equal(planned.modifiers.includes("abstract"), false);
  assert.equal(planned.members[0]?.kind, "MethodDeclaration");
  assert.equal(planned.members[0]?.modifiers.includes("abstract"), false);
  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0].message, /TypeScript-only modifier 'abstract' on class declaration/);
  assert.match(diagnostics[1].message, /TypeScript-only modifier 'abstract' on method declaration/);
});

test("accessor properties consume finalized project-source member dispatch facts", () => {
  const sourceExample = `
    class Animal {
      get label(): string { return "animal"; }
    }
    class Dog extends Animal {
      get label(): string { return "dog"; }
    }
  `;
  assert.match(sourceExample, /get label/);

  const sourceFile = sourceFileNode("/src/accessor-dispatch.ts");
  const baseGetter = node(KindGetAccessor, {
    name: identifier("label"),
    Type: stringType(),
    Body: block([]),
  });
  const derivedGetter = node(KindGetAccessor, {
    name: identifier("label"),
    Type: stringType(),
    Body: block([]),
  });
  const baseClass = node(KindClassDeclaration, {
    name: identifier("Animal"),
    Members: { Nodes: [baseGetter] },
  });
  const derivedClass = node(KindClassDeclaration, {
    name: identifier("Dog"),
    Members: { Nodes: [derivedGetter] },
  });
  baseGetter.Parent = baseClass;
  derivedGetter.Parent = derivedClass;
  const diagnostics = [];

  const input = fakeInput(sourceFile, {
    memberDispatches: new Map([
      [baseGetter, { overridesBase: false, hasDerivedOverride: true }],
      [derivedGetter, { overridesBase: true, hasDerivedOverride: false }],
    ]),
  });
  const basePlanned = planClassDeclaration(baseClass, sourceFile, input, diagnostics);
  const derivedPlanned = planClassDeclaration(derivedClass, sourceFile, input, diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(basePlanned.members[0]?.kind, "PropertyDeclaration");
  assert.deepEqual(basePlanned.members[0]?.modifiers, ["public", "virtual"]);
  assert.equal(derivedPlanned.members[0]?.kind, "PropertyDeclaration");
  assert.deepEqual(derivedPlanned.members[0]?.modifiers, ["public", "override"]);
});

test("class property declarations consume finalized dispatch facts as C# properties", () => {
  const sourceExample = `
    class Base {
      value: string = "base";
      print(): string { return this.value; }
    }
    class Derived extends Base {
      value: string = "derived";
    }
  `;
  assert.match(sourceExample, /value: string/);

  const sourceFile = sourceFileNode("/src/property-dispatch.ts");
  const baseProperty = property("value", stringType());
  const derivedProperty = property("value", stringType());
  const baseClass = node(KindClassDeclaration, {
    name: identifier("Base"),
    Members: { Nodes: [baseProperty] },
  });
  const derivedClass = node(KindClassDeclaration, {
    name: identifier("Derived"),
    Members: { Nodes: [derivedProperty] },
  });
  baseProperty.Parent = baseClass;
  derivedProperty.Parent = derivedClass;
  const diagnostics = [];

  const input = fakeInput(sourceFile, {
    memberDispatches: new Map([
      [baseProperty, { overridesBase: false, hasDerivedOverride: true }],
      [derivedProperty, { overridesBase: true, hasDerivedOverride: false }],
    ]),
  });
  const basePlanned = planClassDeclaration(baseClass, sourceFile, input, diagnostics);
  const derivedPlanned = planClassDeclaration(derivedClass, sourceFile, input, diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.equal(basePlanned.members[0]?.kind, "PropertyDeclaration");
  assert.deepEqual(basePlanned.members[0]?.modifiers, ["public", "virtual"]);
  assert.equal(basePlanned.members[0]?.autoGetter, true);
  assert.equal(basePlanned.members[0]?.autoSetter, true);
  assert.equal(derivedPlanned.members[0]?.kind, "PropertyDeclaration");
  assert.deepEqual(derivedPlanned.members[0]?.modifiers, ["public", "override"]);
  assert.equal(derivedPlanned.members[0]?.autoGetter, true);
  assert.equal(derivedPlanned.members[0]?.autoSetter, true);
});

test("async function declarations consume finalized Task return and await result facts", () => {
  const sourceExample = `
    async function load(task: Promise<number>): Promise<number> {
      return await task;
    }
  `;
  assert.match(sourceExample, /async function load/);
  assert.match(sourceExample, /await task/);

  const sourceFile = sourceFileNode("/src/async.ts");
  const taskName = identifier("task");
  const taskTypeNode = typeNode("Promise<number>");
  const awaited = node(KindAwaitExpression, { Expression: taskName });
  const functionDeclaration = node(KindFunctionDeclaration, {
    name: identifier("load"),
    ModifierFlags: ModifierFlagsAsync,
    Parameters: { Nodes: [
      node(KindParameter, { name: taskName, Type: taskTypeNode }),
    ] },
    Body: block([
      node(KindReturnStatement, { Expression: awaited }),
    ]),
  });
  const intType = csharpSourcePrimitiveTargetType("int32");
  const taskType = csharpTaskTargetType(intType);
  const diagnostics = [];

  const planned = planFunctionDeclaration(functionDeclaration, sourceFile, fakeInput(sourceFile, {
    declarationReturnCarriers: new Map([
      [functionDeclaration, { carrier: taskType }],
    ]),
    runtimeCarrierFacts: new Map([
      [taskTypeNode, { carrier: taskType }],
      [taskName, { carrier: taskType }],
      [awaited, { carrier: intType }],
    ]),
  }), diagnostics);

  assert.deepEqual(diagnostics, []);
  assert.deepEqual(planned.modifiers, ["public", "static", "async"]);
  assert.deepEqual(planned.returnType, {
    kind: "QualifiedName",
    left: {
      kind: "QualifiedName",
      left: {
        kind: "QualifiedName",
        left: { kind: "IdentifierName", name: "System" },
        name: "Threading",
      },
      name: "Tasks",
    },
    name: "Task",
    typeArguments: [{ kind: "PredefinedType", name: "int" }],
  });
  assert.deepEqual(planned.parameters[0], {
    name: "task",
    type: planned.returnType,
    attributes: undefined,
  });
  assert.deepEqual(planned.body.statements, [{
    kind: "ReturnStatement",
    expression: {
      kind: "AwaitExpression",
      expression: { kind: "IdentifierName", name: "task" },
    },
  }]);
});

test("async class methods consume finalized Task return and await result facts", () => {
  const sourceExample = `
    class Loader {
      async load(task: Promise<number>): Promise<number> {
        return await task;
      }
    }
  `;
  assert.match(sourceExample, /async load/);
  assert.match(sourceExample, /Promise<number>/);

  const sourceFile = sourceFileNode("/src/async-method.ts");
  const taskName = identifier("task");
  const taskParameterTypeNode = typeNode("Promise<number>");
  const methodReturnTypeNode = typeNode("Promise<number>");
  const awaited = node(KindAwaitExpression, { Expression: taskName });
  const methodDeclaration = node(KindMethodDeclaration, {
    name: identifier("load"),
    ModifierFlags: ModifierFlagsAsync,
    Type: methodReturnTypeNode,
    Parameters: { Nodes: [
      node(KindParameter, { name: taskName, Type: taskParameterTypeNode }),
    ] },
    Body: block([
      node(KindReturnStatement, { Expression: awaited }),
    ]),
  });
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("Loader"),
    Members: { Nodes: [methodDeclaration] },
  });
  const intType = csharpSourcePrimitiveTargetType("int32");
  const taskType = csharpTaskTargetType(intType);
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, fakeInput(sourceFile, {
    runtimeCarrierFacts: new Map([
      [methodReturnTypeNode, { carrier: taskType }],
      [taskParameterTypeNode, { carrier: taskType }],
      [taskName, { carrier: taskType }],
      [awaited, { carrier: intType }],
    ]),
  }), diagnostics);
  const method = planned.members[0];

  assert.deepEqual(diagnostics, []);
  assert.equal(method.kind, "MethodDeclaration");
  assert.deepEqual(method.modifiers, ["public", "async"]);
  assert.deepEqual(method.returnType, {
    kind: "QualifiedName",
    left: {
      kind: "QualifiedName",
      left: {
        kind: "QualifiedName",
        left: { kind: "IdentifierName", name: "System" },
        name: "Threading",
      },
      name: "Tasks",
    },
    name: "Task",
    typeArguments: [{ kind: "PredefinedType", name: "int" }],
  });
  assert.deepEqual(method.parameters[0], {
    name: "task",
    type: method.returnType,
    attributes: undefined,
  });
  assert.deepEqual(method.body.statements, [{
    kind: "ReturnStatement",
    expression: {
      kind: "AwaitExpression",
      expression: { kind: "IdentifierName", name: "task" },
    },
  }]);
});

test("async function declarations fail closed without Promise/Task return facts", () => {
  const sourceExample = `
    async function load() {
      return 1;
    }
  `;
  assert.match(sourceExample, /return 1/);

  const sourceFile = sourceFileNode("/src/async-missing.ts");
  const functionDeclaration = node(KindFunctionDeclaration, {
    name: identifier("load"),
    ModifierFlags: ModifierFlagsAsync,
    Parameters: { Nodes: [] },
    Body: block([
      node(KindReturnStatement, { Expression: node("KindNumericLiteral", { Text: "1" }) }),
    ]),
  });
  const diagnostics = [];

  planFunctionDeclaration(functionDeclaration, sourceFile, fakeInput(sourceFile), diagnostics);

  assert.ok(diagnostics.some((diagnostic) =>
    /C# function declaration emission requires a finalized signature return carrier/.test(diagnostic.message)
  ));
  assert.ok(diagnostics.some((diagnostic) =>
    /Async C# function declaration emission requires finalized Promise\/Task result carrier facts/.test(diagnostic.message)
  ));
});

test("async class methods fail closed without Promise/Task return facts", () => {
  const sourceExample = `
    class Loader {
      async load() {
        return 1;
      }
    }
  `;
  assert.match(sourceExample, /async load/);
  assert.match(sourceExample, /return 1/);

  const sourceFile = sourceFileNode("/src/async-method-missing.ts");
  const classDeclaration = node(KindClassDeclaration, {
    name: identifier("Loader"),
    Members: { Nodes: [
      node(KindMethodDeclaration, {
        name: identifier("load"),
        ModifierFlags: ModifierFlagsAsync,
        Parameters: { Nodes: [] },
        Body: block([
          node(KindReturnStatement, { Expression: node("KindNumericLiteral", { Text: "1" }) }),
        ]),
      }),
    ] },
  });
  const diagnostics = [];

  const planned = planClassDeclaration(classDeclaration, sourceFile, fakeInput(sourceFile), diagnostics);

  assert.equal(planned.members[0]?.kind, "MethodDeclaration");
  assert.ok(diagnostics.some((diagnostic) =>
    /C# method declaration emission requires a finalized signature return carrier/.test(diagnostic.message)
  ));
  assert.ok(diagnostics.some((diagnostic) =>
    /Async C# method declaration emission requires finalized Promise\/Task result carrier facts/.test(diagnostic.message)
  ));
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

function privateIdentifier(text) {
  return node(KindPrivateIdentifier, { Text: text });
}

function stringType() {
  return node("KindStringKeyword");
}

function numberType() {
  return node("KindNumberKeyword");
}

function block(statements) {
  return node("KindBlock", { Statements: { Nodes: statements } });
}

function property(name, type, modifierFlags = 0) {
  return node(KindPropertyDeclaration, {
    name: typeof name === "string" ? identifier(name) : name,
    Type: type,
    ...(modifierFlags === 0 ? {} : { ModifierFlags: modifierFlags }),
  });
}

function typeNode(text) {
  return node(KindIdentifier, { Text: text });
}

function fakeInput(sourceFile, options = {}) {
  const targetNames = options.targetNames ?? new Map();
  const runtimeCarrierFacts = options.runtimeCarrierFacts ?? new Map();
  const declarationReturnCarriers = options.declarationReturnCarriers ?? new Map();
  return {
    ast: {
      kindName: (candidate) => String(candidate?.Kind),
      kindNameFromKind: (kind) => String(kind),
      text: (candidate) => String(candidate?.Text ?? ""),
      name: (candidate) => candidate?.name,
      typeArguments: (candidate) => candidate?.TypeArguments?.Nodes ?? [],
      typeParameters: (candidate) => candidate?.TypeParameters?.Nodes ?? [],
      parameters: (candidate) => candidate?.Parameters?.Nodes ?? [],
      heritageElements: () => [],
      extendsHeritageElements: () => [],
      implementsHeritageElements: () => [],
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
      getFact: (subject, key) => key === csharpTargetNameFactKey && targetNames.has(subject)
        ? { name: targetNames.get(subject) }
        : undefined,
      getRuntimeCarrierFact: (subject) => runtimeCarrierFacts.get(subject),
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
    analysis: {
      getSymbolName: () => undefined,
      getSymbolDeclarations: () => [],
      getTypeSymbol: () => undefined,
      getTypeAliasSymbol: () => undefined,
      getProjectSourceReferenceForNode: () => undefined,
      getProjectSourceDeclarationForNode: () => undefined,
      getProjectSourceMemberDispatch: (subject) => options.memberDispatches?.get(subject),
      getTypeFromTypeNode: () => undefined,
      getTypeAtLocation: () => undefined,
      describeTypeAtLocation: () => undefined,
      getSymbolAtLocation: () => undefined,
      getResolvedSymbol: () => undefined,
      getProjectSourceReferenceForSymbol: () => undefined,
    },
    targetFacts: {
      getTargetBinding: () => undefined,
      getTargetBindingForReference: () => undefined,
      resolveRuntimeCarrier: (subject) => runtimeCarrierResolution(runtimeCarrierFacts, subject),
      resolveRuntimeCarrierForNode: (subject) => runtimeCarrierResolution(runtimeCarrierFacts, subject),
      resolveCallReturnRuntimeCarrier: () => missingCarrierResolution(),
      resolveDeclarationReturnCarrier: (subject) => declarationReturnCarriers.has(subject)
        ? resolvedCarrierResolution(declarationReturnCarriers.get(subject).carrier)
        : missingCarrierResolution(),
      resolveCallParameterRuntimeCarriers: () => missingParameterCarrierResolution(),
    },
    types: emptyTypeQueries(),
  };
}

function runtimeCarrierResolution(runtimeCarrierFacts, subject) {
  const fact = runtimeCarrierFacts.get(subject);
  return fact === undefined
    ? missingCarrierResolution()
    : resolvedCarrierResolution(fact.carrier);
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
