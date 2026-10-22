import type { TargetTypeRef } from "../../../target-model/types/model.js";
import { getCsharpMethodValue } from "../../../target-model/types/method-values.js";

export function selectCsharpTypeUnsafeContext(carrier: TargetTypeRef): boolean {
  const seen = new Set<TargetTypeRef>();
  const inspect = (type: TargetTypeRef): boolean => {
    if (seen.has(type)) return false;
    seen.add(type);
    const method = getCsharpMethodValue(type);
    if (method !== undefined) return inspect(method.owner);
    switch (type.kind) {
      case "pointer": case "function-pointer": return true;
      case "array": return inspect(type.element);
      case "tuple": return type.elements.some(inspect);
      case "target-named": return type.typeArguments?.some(inspect) === true;
      case "source-primitive": case "type-parameter": case "opaque": return false;
    }
  };
  return inspect(carrier);
}
