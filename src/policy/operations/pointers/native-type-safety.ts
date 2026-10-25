import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpNativePointerOperationSelection } from "../../../target-model/records/native-pointers.js";
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

export function selectCsharpNativePointerUnsafeContext(operation: CsharpNativePointerOperationSelection): boolean {
  switch (operation.kind) {
    case "not-native-pointer": case "rejected": case "layout-query": return false;
    case "load": case "store": case "offset": return true;
    case "raw-address": return operation.method === "Address" && selectCsharpTypeUnsafeContext(operation.resultType) ||
      operation.arguments.some(argument => argument.cast && selectCsharpTypeUnsafeContext(argument.parameterType));
    case "raw-identity": return selectCsharpTypeUnsafeContext(operation.carrier);
    case "raw-location": {
      if (selectCsharpTypeUnsafeContext(operation.inputType)) return true;
      const pending = [operation.layout];
      const seen = new Set<typeof operation.layout>();
      while (pending.length > 0) {
        const layout = pending.pop()!;
        if (seen.has(layout)) continue;
        seen.add(layout);
        if (selectCsharpTypeUnsafeContext(layout.pointeeType)) return true;
        if (layout.kind === "array") pending.push(layout.element);
        else pending.push(...layout.fields.map(field => field.layout));
      }
      return false;
    }
  }
}
