import type { Node, SourceFile } from "@tsonic/tsts";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpObjectLiteralCallableEmission } from "../../../../target-model/records/object-literals.js";
import type { CsharpExpression, CsharpTypeNode } from "../../../target-ast/syntax/index.js";
import type { CsharpPlanningContext } from "../../context.js";
import { createCsharpThisBindingPlanningContext } from "../../context.js";
import { allocateSyntheticParameter, createDestructuringPlannerState } from "../../bindings/index.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";
import { planLambdaBlockBody, planLambdaParameters, type LambdaTargetContext } from "../../expressions/callable.js";
import { planLambdaParameterStorage } from "../../expressions/lambda-parameter-storage.js";
import { csharpPlannedValue } from "../../expressions/planned-values.js";
import type { CsharpPlannedObjectInitializer } from "../../expressions/planned-initializers.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function planObjectShapeMethodMemberAssignment(
  methodNode: Node, objectShape: CsharpObjectShapeFact, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpPlannedObjectInitializer {
  const selected = input.program.records.objectLiteralMember.get(objectShape, methodNode);
  if (selected?.kind !== "method") failCsharpPlannerInvariant("An admitted object method requires its sealed callable initialization.", methodNode);
  const expression = renderCsharpObjectLiteralCallable(methodNode, selected.callable, sourceFile, input, diagnostics);
  return {
    value: csharpPlannedValue(selected.callable.storage, expression), presence: { kind: "required" },
    assignments: value => [{ kind: "AssignmentExpression", name: selected.callable.storageName, carrier: selected.callable.storage, expression: value }],
  };
}

export function renderCsharpObjectLiteralCallable(
  declaration: Node, selected: CsharpObjectLiteralCallableEmission, sourceFile: SourceFile,
  input: CsharpPlanningContext, diagnostics: TargetDiagnostic[],
): CsharpExpression {
  const render = (carrier: CsharpObjectLiteralCallableEmission["carrier"]): CsharpTypeNode => {
    const type = csharpTypeFromTargetTypeRef(carrier, input.scope.typeParameterNames);
    if (type === undefined) failCsharpPlannerInvariant("An admitted object callable requires its renderable native signature.", declaration);
    return type;
  };
  const selfType = selected.receiver === undefined ? undefined : render(selected.receiver);
  const state = createDestructuringPlannerState(declaration, input.program.source.ast);
  const selfName = selfType === undefined ? undefined : allocateSyntheticParameter(state);
  const scoped = selfName === undefined || selected.receiver === undefined ? input
    : createCsharpThisBindingPlanningContext(input, selfName, selected.receiver);
  const target: LambdaTargetContext = {
    carrier: selected.carrier, type: render(selected.carrier), signature: {
      parameters: selected.signature.parameters.map(render), parameterTargetTypes: selected.signature.parameters,
      returnType: render(selected.signature.returnType), returnTargetType: selected.signature.returnType,
      ...(selected.signature.restParameterIndex === undefined ? {} : { restParameterIndex: selected.signature.restParameterIndex }),
    },
  };
  const parameterPlan = planLambdaParameterStorage(selected.parameters,
    planLambdaParameters(selected.parameters, sourceFile, scoped, diagnostics, state, target),
    sourceFile, scoped, diagnostics, state);
  if (parameterPlan === undefined) failCsharpPlannerInvariant("An admitted object callable requires its native parameter storage plan.", declaration);
  const body = planLambdaBlockBody(declaration, selected.body, sourceFile, scoped, diagnostics, state, target);
  if (body === undefined) failCsharpPlannerInvariant("An admitted object callable requires its native body plan.", declaration);
  return { kind: "LambdaExpression", ...(selected.async ? { async: true } : {}), parameters: [
    ...(selfName === undefined || selfType === undefined ? [] : [{ kind: "Parameter" as const, name: selfName, type: selfType }]),
    ...parameterPlan.parameters,
  ], body: { ...body, statements: [...parameterPlan.prelude, ...body.statements] } };
}
