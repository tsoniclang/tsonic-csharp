import type { Node, Type } from "@tsonic/tsts";
import type { SourceFileSemantics } from "@tsonic/target-api/source";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { targetTypeRefEquals } from "../../../target-model/types/equality.js";

export function resolveCsharpInstanceType(
  semantics: SourceFileSemantics,
  constructor: Node,
  resolveCarrier: (type: Type) => TargetTypeRef | undefined,
): TargetTypeRef | undefined {
  const type = semantics.types.expressionType(constructor);
  const signatures = type === undefined ? [] : semantics.types.signatureInfos(type, "construct");
  const instances = signatures.map(signature => signature.returnType === undefined
    ? undefined : resolveCarrier(signature.returnType));
  const selected = instances[0];
  return selected !== undefined && instances.every(instance => instance !== undefined && targetTypeRefEquals(selected, instance))
    ? selected : undefined;
}
