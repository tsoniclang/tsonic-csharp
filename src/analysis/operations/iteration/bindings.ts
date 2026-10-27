import type { CsharpForInKeyBinding, CsharpForOfBinding } from "../../../target-model/records/operations/selection.js";
import type { CsharpStorageClassifications } from "../../../target-model/records/storage/storage.js";
import { selectCsharpConversion } from "../../../policy/conversions/index.js";
import { csharpConversionIsApplicable } from "../../../policy/conversions/applicability.js";
import { csharpTargetTypeRenderingRejection } from "../../../policy/types/model/renderability.js";
import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";

import type { CsharpForInIteration, CsharpForOfIteration, CsharpForAwaitOfIteration } from "../../../policy/operations/iteration/selection.js";
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
