import type { CsharpPlanningContext } from "../context.js";
import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  Node,
} from "@tsonic/tsts";
import type { TargetTypeRef } from "../../../target-model/types/index.js";
import type { CsharpObjectShapeFact } from "../../../target-model/types/model.js";
import { isCsharpRuntimeUnionTargetType, isCsharpEmptyObjectTargetType, isCsharpJsValueObjectShapeTargetType } from "../../../target-model/types/index.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";
import type {
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import {
  csharpTypeFromTargetTypeRef,
} from "./target-types.js";

export function csharpTypeFromTargetTypeRefWithObjectShapeDeclarations(
  input: CsharpPlanningContext,
  type: TargetTypeRef,
  _diagnostics?: TargetDiagnostic[],
  _diagnosticSubject?: Node,
): CsharpTypeNode | undefined {
  const visited = new Set<TargetTypeRef>();
  const shapes = new Set<CsharpObjectShapeFact>();
  const payloads = new Set<CsharpObjectShapeFact>();
  requireRenderedType(type);
  return csharpTypeFromTargetTypeRef(type, input.scope.typeParameterNames);

  function requireShape(fact: CsharpObjectShapeFact, payload: boolean): void {
    if (isCsharpJsValueObjectShapeTargetType(fact.targetType) || isCsharpEmptyObjectTargetType(fact.targetType)) return;
    if (!shapes.has(fact)) {
      shapes.add(fact);
      input.artifacts.objectShape(fact);
    }
    if (payload && !payloads.has(fact)) {
      payloads.add(fact);
      for (const member of fact.members) requireRenderedType(member.methodStorageType ?? member.type);
      for (const inherited of fact.implements ?? []) requireRenderedType(inherited);
    }
  }

  function requireRenderedType(carrier: TargetTypeRef): void {
    if (visited.has(carrier)) return;
    visited.add(carrier);
    const method = getCsharpMethodValue(carrier);
    if (method !== undefined) {
      requireRenderedType(method.owner);
      return;
    }
    const fact = input.types.objectShapes.resolveTarget(carrier);
    if (fact !== undefined) requireShape(fact, false);
    if (isCsharpRuntimeUnionTargetType(carrier)) {
      for (const payload of carrier.csharpRuntimeUnionObjectShapes ?? []) if (payload !== undefined) {
        requireShape(payload, true);
        requireRenderedType(payload.targetType);
      }
    }
    switch (carrier.kind) {
      case "target-named":
        for (const argument of carrier.typeArguments ?? []) requireRenderedType(argument);
        return;
      case "array": requireRenderedType(carrier.element); return;
      case "tuple":
        for (const element of carrier.elements) requireRenderedType(element);
        return;
      case "pointer": requireRenderedType(carrier.pointee); return;
      case "function-pointer":
        for (const argument of carrier.args) requireRenderedType(argument);
        requireRenderedType(carrier.result);
        return;
      case "source-primitive": case "type-parameter": case "opaque": return;
    }
  }
}
