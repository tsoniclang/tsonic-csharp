import type { CsharpForInKeyBinding, CsharpForOfBinding, CsharpResolvedIteration } from "../../../target-model/records/selection.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage.js";
import { csharpConversionIsApplicable, selectCsharpConversion } from "../../conversions/index.js";
import { csharpTargetTypeRenderingRejection } from "../../types/model/renderability.js";
import type {
  Node,
  ResolvedSourceIterationInfo,
  SourceFile,
} from "@tsonic/tsts";
import type {
  CsharpPolicyContext,
} from "../../model/context.js";
import type { CsharpTargetNamedTypeRef, TargetTypeRef } from "../../types/index.js";
import {
  csharpStringTargetType,
  getCsharpCollectionElementTargetType,
  isCsharpRecordDictionaryTargetType,
  isCsharpStringTargetType,
  targetTypeRefEquals,
} from "../../types/index.js";
import type { CsharpOperationSelection } from "../../../target-model/records/operator-selection.js";

export type CsharpForInIteration = Extract<
  CsharpResolvedIteration,
  { readonly iterationKind: "for-in" }
>;

export type CsharpForOfIteration = Extract<
  CsharpResolvedIteration,
  { readonly iterationKind: "for-of" }
>;

export type CsharpForAwaitOfIteration = Extract<
  CsharpResolvedIteration,
  { readonly iterationKind: "for-await-of" }
>;

export function selectCsharpForInKeyBinding(
  input: CsharpPolicyContext & { readonly storage: Pick<CsharpStorageClassifications, "storageType"> },
  statement: Node,
  iteration: CsharpForInIteration,
): { readonly kind: "resolved"; readonly binding: CsharpForInKeyBinding }
  | { readonly kind: "rejected"; readonly node: Node; readonly reason: string } {
  const ast = input.ast;
  const initializer = ast.as.AsForInOrOfStatement(statement)?.Initializer;
  const refuse = (node: Node, reason: string) => ({ kind: "rejected" as const, node, reason });
  if (initializer === undefined) return refuse(statement, "For-in statement has no initializer.");
  let node: Node;
  let name: Node;
  let declaration: Node;
  let form: { readonly kind: "assignment" } |
    { readonly kind: "declaration"; readonly declarationKind: "var" | "let" | "const" };
  if (ast.is.IsVariableDeclarationList(initializer)) {
    const declarations = ast.children(initializer).filter((child): child is Node =>
      child !== undefined && ast.is.IsVariableDeclaration(child));
    if (declarations.length !== 1) return refuse(initializer, "For-in variable declaration must contain exactly one binding.");
    declaration = declarations[0]!;
    const variable = ast.as.AsVariableDeclaration(declaration);
    if (variable?.Initializer !== undefined) return refuse(declaration, "For-in variable declaration cannot have an initializer.");
    const bindingName = variable?.name;
    if (bindingName === undefined || !ast.is.IsIdentifier(bindingName)) return refuse(bindingName ?? declaration,
      "For-in C# key binding must be an identifier; binding patterns require finalized object-key destructuring facts.");
    const declarationKind = ast.variableDeclarationKind(initializer);
    if (declarationKind !== "var" && declarationKind !== "let" && declarationKind !== "const") return refuse(initializer,
      "For-in C# key bindings require an exact var, let, or const declaration kind.");
    node = declaration;
    name = bindingName;
    form = { kind: "declaration", declarationKind };
  } else {
    if (!ast.is.IsIdentifier(initializer)) return refuse(initializer,
      "For-in initializer binding is outside the current C# planning surface.");
    const selected = input.navigation.sourceReferenceFor(initializer)?.declaration;
    if (selected === undefined) return refuse(initializer, "For-in assignment requires its exact checked binding declaration.");
    node = initializer;
    name = initializer;
    declaration = selected;
    form = { kind: "assignment" };
  }
  const storageType = input.storage.storageType.get(declaration);
  if (storageType === undefined || csharpTargetTypeRenderingRejection(storageType) !== undefined) return refuse(node,
    "The exact for-in binding storage representation is not renderable in C#.");
  if (csharpTargetTypeRenderingRejection(iteration.elementType) !== undefined) return refuse(statement,
    "C# for-in key emission requires a renderable checked target key type.");
  if (csharpTargetTypeRenderingRejection(iteration.iterableType) !== undefined) return refuse(statement,
    "For-in collection temp requires a renderable checked target iterable type.");
  if (iteration.lowering.kind === "object-shape-keys" &&
    csharpTargetTypeRenderingRejection(iteration.lowering.objectShape.targetType) !== undefined) return refuse(statement,
    "Object-shape for-in requires a renderable object-shape target type before C# emission.");
  const conversion = selectCsharpConversion(input, iteration.elementType, storageType, "implicit");
  if (!csharpConversionIsApplicable(conversion, "implicit")) return refuse(node,
    "For-in key binding must have the finalized provider key type.");
  return { kind: "resolved", binding: Object.freeze({ node, name, declaration, storageType, conversion, ...form }) };
}

export function selectCsharpForOfBinding(
  input: CsharpPolicyContext & { readonly storage: Pick<CsharpStorageClassifications, "storageType"> },
  statement: Node,
  iteration: CsharpForOfIteration | CsharpForAwaitOfIteration,
): { readonly kind: "resolved"; readonly binding: CsharpForOfBinding }
  | { readonly kind: "rejected"; readonly node: Node; readonly reason: string } {
  const ast = input.ast;
  const initializer = ast.as.AsForInOrOfStatement(statement)?.Initializer;
  const refuse = (node: Node, reason: string) => ({ kind: "rejected" as const, node, reason });
  if (initializer === undefined) return refuse(statement, "For-of statement has no initializer.");
  let node: Node;
  let declaration: Node;
  let form: Pick<Extract<CsharpForOfBinding, { readonly kind: "assignment" }>, "kind" | "name"> |
    Pick<Extract<CsharpForOfBinding, { readonly kind: "declaration" }>, "kind" | "name" | "declarationKind"> |
    Pick<Extract<CsharpForOfBinding, { readonly kind: "pattern" }>, "kind" | "pattern" | "declarationKind">;
  if (ast.is.IsVariableDeclarationList(initializer)) {
    const declarations = ast.children(initializer).filter((child): child is Node =>
      child !== undefined && ast.is.IsVariableDeclaration(child));
    if (declarations.length !== 1) return refuse(initializer, "For-of declaration requires exactly one binding.");
    declaration = declarations[0]!;
    const variable = ast.as.AsVariableDeclaration(declaration);
    if (variable?.Initializer !== undefined) return refuse(declaration, "For-of declaration cannot have an initializer.");
    const name = variable?.name;
    if (name === undefined) return refuse(declaration, "For-of declaration requires its checked binding name.");
    const declarationKind = ast.variableDeclarationKind(initializer);
    if (declarationKind !== "var" && declarationKind !== "let" && declarationKind !== "const" &&
      declarationKind !== "using" && declarationKind !== "await using") return refuse(initializer,
      "For-of declaration requires its exact native lifetime kind.");
    if (ast.is.IsObjectBindingPattern(name) || ast.is.IsArrayBindingPattern(name)) {
      form = { kind: "pattern", pattern: name, declarationKind };
    } else if (ast.is.IsIdentifier(name)) form = { kind: "declaration", name, declarationKind };
    else return refuse(name, "For-of initializer binding is outside the current C# planning surface.");
    node = declaration;
  } else {
    if (!ast.is.IsIdentifier(initializer)) return refuse(initializer,
      "For-of initializer binding is outside the current C# planning surface.");
    const selected = input.navigation.sourceReferenceFor(initializer)?.declaration;
    if (selected === undefined) return refuse(initializer, "For-of assignment requires its exact checked binding declaration.");
    declaration = selected;
    node = initializer;
    form = { kind: "assignment", name: initializer };
  }
  const storageType = input.storage.storageType.get(declaration);
  if (storageType === undefined || csharpTargetTypeRenderingRejection(storageType) !== undefined) return refuse(node,
    "The exact for-of binding storage representation is not renderable in C#.");
  if (csharpTargetTypeRenderingRejection(iteration.elementType) !== undefined ||
    csharpTargetTypeRenderingRejection(iteration.iterableType) !== undefined) return refuse(statement,
    "The exact for-of element and collection representations must be renderable in C#.");
  if (iteration.lowering.kind === "string-code-point" &&
    (csharpTargetTypeRenderingRejection(iteration.lowering.policy.highSurrogateMethod.declaringType) !== undefined ||
      csharpTargetTypeRenderingRejection(iteration.lowering.policy.lowSurrogateMethod.declaringType) !== undefined)) return refuse(statement,
    "String code-point surrogate test requires a renderable static target method policy.");
  const conversion = selectCsharpConversion(input, iteration.elementType, storageType, "implicit");
  if (!csharpConversionIsApplicable(conversion, "implicit")) return refuse(node,
    "For-of element requires an exact implicit native conversion to its binding storage.");
  return { kind: "resolved", binding: Object.freeze({ node, declaration, storageType, conversion, ...form }) };
}

export function selectCsharpIteration(
  input: CsharpPolicyContext,
  statement: Node,
  expression: Node | undefined,
  sourceFile: SourceFile,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (expression === undefined) {
    return rejected("Checked iteration has no iterable expression.");
  }
  const source = input.semantics(sourceFile).operations.iteration(
    statement,
  );
  if (source === undefined) {
    return rejected(
      "TSTS did not retain an exact checked iteration selection for this statement.",
    );
  }
  const iterableType = input.types.resolveNode(
    expression,
    sourceFile,
  );
  if (iterableType === undefined) {
    return rejected(
      "The checked iterable expression does not have a closed C# target representation.",
    );
  }
  if (source.iterationKind === "for-await-of") {
    return selectForAwaitOf(source, iterableType);
  }
  if (source.iterationKind === "for-of") {
    return selectForOf(source, iterableType);
  }
  const elementType = input.types.resolveType(
    source.sourceElementType,
    sourceFile,
  );
  if (elementType === undefined) {
    return rejected(
      "The checked property-key type does not have a closed C# target representation.",
    );
  }
  return selectForIn(input, source, expression, sourceFile, iterableType, elementType);
}

function selectForAwaitOf(
  source: Extract<
    ResolvedSourceIterationInfo,
    { readonly iterationKind: "for-await-of" }
  >,
  iterableType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (
    isCsharpStringTargetType(iterableType) &&
    (
      source.mechanism.kind === "string-code-unit-index-adapted-to-async" ||
      source.mechanism.kind === "synchronous-iterator-adapted-to-async"
    )
  ) {
    const policy = (iterableType as CsharpTargetNamedTypeRef)
      .csharpStringIteration;
    return policy === undefined
      ? rejected(
          "The selected C# string representation has no exact code-point iteration policy.",
        )
      : {
          kind: "resolved",
          iterationKind: "for-await-of",
          source,
          iterableType,
          elementType: csharpStringTargetType(),
          lowering: { kind: "string-code-point", policy },
        };
  }
  const elementType = getCsharpCollectionElementTargetType(iterableType);
  if (elementType === undefined) {
    return rejected(
      "The selected C# async-iterable representation does not prove an enumerable target element.",
    );
  }
  switch (source.mechanism.kind) {
    case "asynchronous-iterator-protocol":
      return {
        kind: "resolved",
        iterationKind: "for-await-of",
        source,
        iterableType,
        elementType,
        lowering: { kind: "await-foreach" },
      };
    case "synchronous-iterator-adapted-to-async":
    case "array-like-index-adapted-to-async":
      return {
        kind: "resolved",
        iterationKind: "for-await-of",
        source,
        iterableType,
        elementType,
        lowering: { kind: "await-foreach-sync-adapter" },
      };
    case "string-code-unit-index-adapted-to-async":
      return rejected(
        "The exact source string iteration mechanism requires a selected target string carrier.",
      );
    case "union":
      return rejected(
        "For-await union iteration requires every exact source alternative to select one target iteration policy.",
      );
    case "untyped-dynamic-iteration":
      return rejected(
        "Untyped dynamic for-await iteration has no closed C# target protocol.",
      );
  }
}

function selectForOf(
  source: Extract<ResolvedSourceIterationInfo, { readonly iterationKind: "for-of" }>,
  iterableType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (isCsharpStringTargetType(iterableType)) {
    const policy = (iterableType as CsharpTargetNamedTypeRef)
      .csharpStringIteration;
    return policy === undefined
      ? rejected(
          "The selected C# string representation has no exact code-point iteration policy.",
        )
      : {
          kind: "resolved",
          iterationKind: "for-of",
          source,
          iterableType,
          elementType: csharpStringTargetType(),
          lowering: { kind: "string-code-point", policy },
        };
  }
  const enumerableElement = getCsharpCollectionElementTargetType(iterableType);
  if (enumerableElement === undefined) {
    return rejected(
      "The selected C# iterable representation does not prove an enumerable target element.",
    );
  }
  return {
    kind: "resolved",
    iterationKind: "for-of",
    source,
    iterableType,
    elementType: enumerableElement,
    lowering: { kind: "foreach" },
  };
}

function selectForIn(
  input: CsharpPolicyContext,
  source: Extract<ResolvedSourceIterationInfo, { readonly iterationKind: "for-in" }>,
  expression: Node,
  sourceFile: SourceFile,
  iterableType: TargetTypeRef,
  elementType: TargetTypeRef,
): CsharpOperationSelection<CsharpResolvedIteration> {
  if (!targetTypeRefEquals(elementType, csharpStringTargetType())) {
    return rejected(
      "C# property-key iteration requires the checked source key to map exactly to string.",
    );
  }
  if (iterableType.kind === "array") {
    return {
      kind: "resolved",
      iterationKind: "for-in",
      source,
      iterableType,
      elementType,
      lowering: {
        kind: "index",
        lengthMemberName: "Length",
        keyConversion: "invariant-string",
      },
    };
  }
  if (iterableType.kind === "target-named") {
    const targetPolicy = (iterableType as CsharpTargetNamedTypeRef)
      .csharpPropertyKeyIteration;
    if (targetPolicy !== undefined) {
      if (targetPolicy.kind === "key-collection") {
        if (!isCsharpRecordDictionaryTargetType(iterableType)) {
          return rejected(
            "A key-collection iteration policy requires an explicit record-dictionary target representation.",
          );
        }
        return {
          kind: "resolved",
          iterationKind: "for-in",
          source,
          iterableType,
          elementType,
          lowering: targetPolicy,
        };
      }
      return {
        kind: "resolved",
        iterationKind: "for-in",
        source,
        iterableType,
        elementType,
        lowering: targetPolicy,
      };
    }
  }
  const objectShape = input.objectShapes.resolveNode(expression, sourceFile);
  return objectShape === undefined
    ? rejected(
        "The selected C# representation has no property-key iteration policy.",
      )
    : {
        kind: "resolved",
        iterationKind: "for-in",
        source,
        iterableType,
        elementType,
        lowering: { kind: "object-shape-keys", objectShape },
      };
}

function rejected(
  reason: string,
): Extract<CsharpOperationSelection<never>, { readonly kind: "rejected" }> {
  return { kind: "rejected", reason };
}
