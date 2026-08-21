import type { TargetDiagnostic } from "@tsonic/target-api/artifacts";
import type {
  CsharpTypeNode,
} from "../../../target-ast/roslyn/index.js";
import type {
  CsharpObjectShapeFact,
} from "../../../../target-model/types/index.js";
import {
  unsupportedNodeDiagnostic,
} from "../../diagnostics.js";
import {
  csharpTypeFromTargetTypeRef,
} from "../../types/target-types.js";

export function renderObjectShapeInterfaces(
  fact: CsharpObjectShapeFact,
  diagnostics: TargetDiagnostic[] | undefined,
  diagnosticSubject: Parameters<typeof unsupportedNodeDiagnostic>[0] | undefined,
): readonly CsharpTypeNode[] | undefined {
  const rendered = (fact.implements ?? []).map((contract) => csharpTypeFromTargetTypeRef(contract));
  if (rendered.some((contract) => contract === undefined)) {
    if (diagnostics !== undefined && diagnosticSubject !== undefined) {
      diagnostics.push(unsupportedNodeDiagnostic(diagnosticSubject, "Object-shape implemented contracts must carry renderable target type references before C# emission."));
    }
    return undefined;
  }
  return rendered as readonly CsharpTypeNode[];
}
