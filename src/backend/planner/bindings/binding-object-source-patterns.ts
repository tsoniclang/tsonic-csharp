import type { CsharpPlanningContext } from "../context.js";
import {
  AsBindingElement,
  AsStringLiteral,
  HasSourceKind,
  KindIdentifier,
  KindStringLiteral,
  Node_Text,
} from "@tsonic/target-api/source";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpExpression,
  CsharpStatement,
} from "../../target-ast/roslyn/index.js";
import type { DestructuringPlannerState } from "./binding-state.js";
import type { BindingProjectionPlanner } from "./binding-pattern-contracts.js";
import { unsupportedNodeDiagnostic } from "../diagnostics.js";
import {
  requireCsharpIdentifier,
  tryCsharpIdentifier,
} from "../../../target-model/names/identifiers.js";

export function planObjectBindingElement(
  elementNode: Node,
  sourceExpression: CsharpExpression,
  sourceFile: SourceFile,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
  state: DestructuringPlannerState,
  planBindingNameFromProjection: BindingProjectionPlanner,
): readonly CsharpStatement[] {
  const element = AsBindingElement(input.program.source.ast, elementNode);
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

export function isSourceOwnedBindingSource(
  sourceNode: Node | undefined,
  _sourceFile: SourceFile,
  input: CsharpPlanningContext,
): boolean {
  return sourceNode !== undefined &&
    input.program.sourceEvidence.sourceOwnedProjectShape(sourceNode) === true;
}

function getDirectSourcePropertyName(
  elementNode: Node,
  input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[],
): string | undefined {
  const element = AsBindingElement(input.program.source.ast, elementNode);
  if (element === undefined) {
    return undefined;
  }
  const propertyName = element.PropertyName ?? element.name;
  if (propertyName === undefined) {
    return undefined;
  }
  if (!HasSourceKind(input.program.source.ast, propertyName, KindIdentifier)) {
    if (HasSourceKind(input.program.source.ast, propertyName, KindStringLiteral)) {
      const text = Node_Text(input.program.source.ast, AsStringLiteral(input.program.source.ast, propertyName));
      if (text !== undefined && tryCsharpIdentifier(text) === text) {
        return text;
      }
    }
    diagnostics.push(unsupportedNodeDiagnostic(propertyName, "Object destructuring from source-owned declarations supports only identifier property names until provider object-shape facts supply target member names."));
    return undefined;
  }
  return requireCsharpIdentifier(Node_Text(input.program.source.ast, propertyName), diagnostics, "Object destructuring source property");
}
