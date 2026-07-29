import type { CsharpTranslationContext } from "../../translate/context/index.js";
import {
  AsBindingElement,
  AsParameterDeclaration,
  AsStringLiteral,
  HasSourceKind,
  KindBindingElement,
  KindIdentifier,
  KindParameter,
  KindStringLiteral,
  Node_Text,
} from "./source-ast.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type {
  TargetDiagnostic,
} from "@tsonic/target-api";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../roslyn/syntax.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { unsupportedNodeDiagnostic } from "./diagnostics.js";
import {
  requireCsharpIdentifier,
  tryCsharpIdentifier,
} from "./identifiers.js";
import { isSourceOwnedProjectShapeSubject } from "../../policy/types/index.js";

export function planObjectBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding pattern element must be a binding element."));
    return [];
  }
  if (element.DotDotDotToken !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object rest destructuring requires finalized provider object-spread semantics before C# emission."));
    return [];
  }
  if (element.Initializer !== undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(element.Initializer, "Destructuring defaults require finalized undefined/default-value semantics before C# emission."));
    return [];
  }
  const name = element.name;
  if (name === undefined) {
    diagnostics.push(unsupportedNodeDiagnostic(elementNode, "Object binding element must have a target binding name."));
    return [];
  }
  const propertyName = getDirectSourcePropertyName(elementNode, input, diagnostics);
  if (propertyName === undefined) {
    return [];
  }
  const projected: CsharpExpression = {
    kind: "SimpleMemberAccessExpression",
    receiver: sourceExpression,
    name: propertyName,
  };
  return planBindingNameFromProjection(name, projected, undefined, elementNode, sourceFile, input, diagnostics, state);
}

export function isSourceOwnedBindingElement(
  sourceNode: Node | undefined,
  sourceFile: SourceFile,
  input: CsharpTranslationContext,
): boolean {
  if (!HasSourceKind(input.ast, sourceNode, KindBindingElement) && !HasSourceKind(input.ast, sourceNode, KindParameter)) {
    return false;
  }
  if (HasSourceKind(input.ast, sourceNode, KindParameter) && AsParameterDeclaration(sourceNode)?.Type === undefined) {
    return false;
  }
  return isSourceOwnedProjectShapeSubject(sourceNode, sourceFile, input);
}

function getDirectSourcePropertyName(
  elementNode: Node,
  input: CsharpTranslationContext,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const element = AsBindingElement(elementNode);
  if (element === undefined) {
    return undefined;
  }
  const propertyName = element.PropertyName ?? element.name;
  if (propertyName === undefined) {
    return undefined;
  }
  if (!HasSourceKind(input.ast, propertyName, KindIdentifier)) {
    if (HasSourceKind(input.ast, propertyName, KindStringLiteral)) {
      const text = Node_Text(input.ast, AsStringLiteral(propertyName));
      if (text !== undefined && tryCsharpIdentifier(text) === text) {
        return text;
      }
    }
    diagnostics.push(unsupportedNodeDiagnostic(propertyName, "Object destructuring from source-owned declarations supports only identifier property names until provider object-shape facts supply target member names."));
    return undefined;
  }
  return requireCsharpIdentifier(Node_Text(input.ast, propertyName), diagnostics, "Object destructuring source property");
}
