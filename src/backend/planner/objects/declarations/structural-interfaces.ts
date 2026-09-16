import type { CsharpObjectShapeFact } from "../../../../target-model/types/model.js";
import { getCsharpDelegateSignature } from "../../../../target-model/types/index.js";
import type { CsharpInterfaceMember } from "../../../target-ast/roslyn/index.js";
import { csharpTypeFromTargetTypeRef } from "../../types/target-types.js";

export function renderCsharpStructuralInterfaceMembers(shape: CsharpObjectShapeFact): readonly CsharpInterfaceMember[] | undefined {
  const result: CsharpInterfaceMember[] = [];
  for (const member of shape.members) {
    if (member.memberKind === "method") {
      const signature = getCsharpDelegateSignature(member.type);
      if (signature === undefined) return undefined;
      const returnType = csharpTypeFromTargetTypeRef(signature.returnType);
      const parameters = signature.parameters.map(csharpTypeFromTargetTypeRef);
      if (returnType === undefined || parameters.some(type => type === undefined)) return undefined;
      result.push({ kind: "MethodDeclaration", name: member.targetName, returnType,
        parameters: parameters.map((type, index) => ({ name: `arg${index}`, type: type!,
          ...(signature.restParameterIndex === index ? { isParams: true } : {}),
          ...(signature.optionalParameterIndexes?.includes(index) ? { defaultValue: { kind: "DefaultExpression" as const, type: type! } } : {}),
        })) });
    } else {
      const type = csharpTypeFromTargetTypeRef(member.type);
      if (type === undefined) return undefined;
      result.push({ kind: "PropertyDeclaration", name: member.targetName, type,
        writable: member.readonly !== true && member.accessor?.setter !== false });
    }
  }
  return result;
}
