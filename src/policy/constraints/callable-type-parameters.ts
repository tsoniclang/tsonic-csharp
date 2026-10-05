import type { Node, SourceFile } from "@tsonic/tsts";
import type { CsharpObjectShapeMemberFact } from "../../target-model/types/model.js";
import { csharpSourceTypeParameter } from "../../target-model/names/type-parameters.js";
import { resolveCsharpTypeParameterConstraints, type CsharpTypeParameterConstraintPolicyHost } from "./type-parameter-constraints.js";

export function resolveCsharpCallableTypeParameters(
  declaration: Node | undefined, sourceFile: SourceFile, host: CsharpTypeParameterConstraintPolicyHost,
): NonNullable<CsharpObjectShapeMemberFact["typeParameters"]> | undefined {
  if (declaration === undefined) return [];
  const selected = host.ast.typeParameters(declaration).map(declaration => {
    if (declaration === undefined) return undefined;
    const parameter = csharpSourceTypeParameter(declaration, host.ast);
    if (parameter === undefined) return undefined;
    const constraints = resolveCsharpTypeParameterConstraints(declaration, parameter, sourceFile, host);
    return constraints.kind === "resolved" ? Object.freeze({ declaration, identity: parameter.identity, name: parameter.name,
      constraints: Object.freeze([...constraints.constraints]),
    }) : undefined;
  });
  return selected.some(parameter => parameter === undefined) ? undefined
    : Object.freeze(selected as NonNullable<typeof selected[number]>[]);
}
