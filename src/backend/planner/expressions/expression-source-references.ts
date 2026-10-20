import type { CsharpPlanningContext } from "../context.js";
import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpExpression } from "../../target-ast/syntax/index.js";
import { failCsharpPlannerInvariant } from "../../invariants.js";
import { getCsharpLocalBindingName, type DestructuringPlannerState } from "../bindings/index.js";
import { getCsharpExpressionOverride } from "../bindings/binding-state.js";
import { planFlowReadUseSiteProjection } from "./flow-read-projections.js";
import { planCsharpSourceModuleValueReference } from "../bindings/module-values.js";
import { csharpTypeFromTargetTypeRef } from "../types/target-types.js";
import { csharpCapturedBindingExpression } from "../bindings/capture-storage.js";
import { planCsharpFrameClosureReference } from "../bindings/capture-closures.js";
import { getCsharpTypeFromProjectSourceReference } from "../types/project-source-types.js";

export function planIdentifierExpression(identifier: Node, sourceFile: SourceFile, input: CsharpPlanningContext,
  diagnostics: TargetDiagnostic[], state?: DestructuringPlannerState): CsharpExpression | undefined {
  const override = getCsharpExpressionOverride(identifier, state);
  if (override !== undefined) return override;
  const selected = input.program.records.identifierEmission.get(identifier);
  if (selected === undefined) failCsharpPlannerInvariant("An admitted identifier requires its sealed source-reference plan.", identifier);
  switch (selected.kind) {
    case "frame": return planCsharpFrameClosureReference(selected.declaration, input, diagnostics, state);
    case "class": {
      const value = input.scope.classValues?.get(selected.declaration);
      if (value !== undefined) return value;
      if (selected.factory) return { kind: "IdentifierName", name: getCsharpLocalBindingName(identifier, input, state) ?? requireSealedSourceReferenceName(identifier, input) };
      if (selected.constructor !== undefined) {
        const result = csharpTypeFromTargetTypeRef(selected.constructor.returnType, input.scope.typeParameterNames);
        const parameters = selected.constructor.parameters.map((carrier, index) => ({ name: `argument${index}`, type: csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames) }));
        if (result === undefined || parameters.some(parameter => parameter.type === undefined))
          failCsharpPlannerInvariant("An admitted constructor value requires its exact native factory signature.", identifier);
        return { kind: "LambdaExpression", parameters: parameters.map(parameter => ({ kind: "Parameter", name: parameter.name, type: parameter.type! })),
          body: { kind: "ObjectCreationExpression", type: result, arguments: parameters.map(parameter => ({ kind: "Argument", expression: { kind: "IdentifierName", name: parameter.name } })) } };
      }
      const reference = input.program.records.sourceReferenceIdentity.get(identifier)?.value;
      return getCsharpTypeFromProjectSourceReference(reference, input, diagnostics) ?? failCsharpPlannerInvariant("An admitted project class requires its exact native type reference.", identifier);
    }
    case "absence": return { kind: "LiteralExpression", value: null };
    case "provider": {
      const receiver = csharpTypeFromTargetTypeRef(selected.owner, input.scope.typeParameterNames);
      if (receiver === undefined) failCsharpPlannerInvariant("An admitted provider value requires its exact native declaring type.", identifier);
      return { kind: "SimpleMemberAccessExpression", receiver, name: selected.name };
    }
    case "module": return planCsharpSourceModuleValueReference(selected.reference, input, diagnostics);
    case "type": return getCsharpTypeFromProjectSourceReference(selected.reference, input, diagnostics);
    case "local": {
      const expression = (selected.declaration === undefined ? undefined : csharpCapturedBindingExpression(selected.declaration, input, state)) ??
        { kind: "IdentifierName" as const, name: getCsharpLocalBindingName(identifier, input, state) ?? requireSealedSourceReferenceName(identifier, input) };
      const value: CsharpExpression = selected.backing ? { kind: "SimpleMemberAccessExpression", receiver: expression, name: "Value" } : expression;
      return planFlowReadUseSiteProjection(identifier, value, sourceFile, input, diagnostics);
    }
  }
}

function requireSealedSourceReferenceName(node: Node, input: CsharpPlanningContext): string {
  const selected = input.program.names.resolve(node);
  return selected.kind === "resolved" ? selected.name : failCsharpPlannerInvariant("An admitted authored reference lost its sealed native name.", node);
}

export function tryPlanProjectSourceModuleStaticMemberReference(node: Node, _sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[]): CsharpExpression | undefined {
  const reference = input.program.records.sourceModuleReference.get(node);
  return reference === undefined ? undefined : planCsharpSourceModuleValueReference(reference, input, diagnostics);
}
