import type { Node } from "@tsonic/tsts";
import type { CsharpTypeParameter } from "../../../target-ast/syntax/index.js";
import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import type { CsharpObjectShapeEmissionRecords } from "../../../../target-model/records/object-shape-emission.js";
import { csharpGenericConstraintFromTargetTypeParameterConstraint } from "../../types/type-parameters.js";
import { failCsharpPlannerInvariant } from "../../../invariants.js";

export function renderObjectShapeTypeParameters(
  typeParameterNames: ReadonlyMap<string, string> | undefined,
  fact: CsharpObjectShapeFact,
  records: Pick<CsharpObjectShapeEmissionRecords, "objectShapeParameters">,
  subject: Node | undefined,
): readonly CsharpTypeParameter[] {
  const parameters = records.objectShapeParameters.get(fact);
  if (parameters === undefined) failCsharpPlannerInvariant("An admitted object declaration requires its selected native generic parameters.", subject);
  return parameters.map(selected => {
    const constraints = selected.constraints.map(constraint => csharpGenericConstraintFromTargetTypeParameterConstraint(
      typeParameterNames, constraint, selected.parameter.csharpDeclaration ?? subject!, []));
    if (constraints.some(constraint => constraint === undefined)) failCsharpPlannerInvariant("An admitted object declaration requires its renderable native generic constraints.", subject);
    return { name: selected.name,
      ...(constraints.length === 0 ? {} : { constraints: constraints as NonNullable<typeof constraints[number]>[] }),
      ...(selected.variance === undefined ? {} : { variance: selected.variance }) };
  });
}
