import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpTypeNode,
} from "../../target-ast/syntax/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../../target-model/types/index.js";
import type { Node } from "@tsonic/tsts";
import { failCsharpPlannerInvariant } from "../diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../types/target-types.js";
import { qualifiedCsharpType } from "../types/primitives.js";

export function csharpClosedValueCarrierInterfaceType(): CsharpTypeNode {
  return qualifiedCsharpType("Tsonic.CSharp.Runtime", "ITsClosedValueCarrier");
}

export function renderObjectShapeInterfaces(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  fact: CsharpObjectShapeFact,
  _diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Node | undefined,
): readonly CsharpTypeNode[] | undefined {
  const rendered = (fact.implements ?? []).map((contract) => csharpTypeFromTargetTypeRef(contract, typeParameterNames));
  if (rendered.some((contract) => contract === undefined)) {
    failCsharpPlannerInvariant("Object-shape implemented contracts must carry renderable target type references before C# emission.", diagnosticSubject);
  }
  return rendered as readonly CsharpTypeNode[];
}
