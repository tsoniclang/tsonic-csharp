import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KindClassDeclaration,
  KindClassStaticBlockDeclaration,
  KindIdentifier,
  KindMethodDeclaration,
  KindPrivateIdentifier,
  KindPropertyDeclaration,
  ModifierFlagsAbstract,
  ModifierFlagsPrivate,
  ModifierFlagsStatic,
} from "../dist/backend/planner/source-ast.js";
import { planClassDeclaration } from "../dist/backend/planner/declarations.js";
import { printCsharpCompilationUnit } from "../dist/print/csharp-printer.js";
import { csharpTargetNameFactKey } from "../dist/source/csharp-facts.js";

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

function fakeInput(sourceFile, options = {}) {
  const targetNames = options.targetNames ?? new Map();
  return {
    ast: {
      kindName: (candidate) => String(candidate?.Kind),
      kindNameFromKind: (kind) => String(kind),
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
      getFact: (subject, key) => key === csharpTargetNameFactKey && targetNames.has(subject)
        ? { name: targetNames.get(subject) }
        : undefined,
      getRuntimeCarrierFact: () => undefined,
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
      getProjectSourceReferenceForNode: () => undefined,
      getProjectSourceDeclarationForNode: () => undefined,
      getTargetBindingForReference: () => undefined,
      getProjectSourceMethodDispatch: () => undefined,
      getTypeFromTypeNode: () => undefined,
      getTypeAtLocation: () => undefined,
      describeTypeAtLocation: () => undefined,
      getResolvedCallReturnRuntimeCarrier: () => undefined,
      getResolvedCallReturnType: () => undefined,
      getReturnTypeCarrierFromDeclaration: () => undefined,
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
