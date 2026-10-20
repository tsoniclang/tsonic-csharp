import type { TargetTypeRef } from "../../target-model/types/model.js";
import type { CsharpTypeEmissionInput } from "../model/type-emission.js";
import { csharpRenderShapeForTargetNamedType, isCsharpNeverTargetType } from "../../target-model/types/index.js";
import { getCsharpMethodValue } from "../../target-model/types/method-values.js";
import { csharpFunctionPointerCallingConvention } from "../../target-model/syntax/function-pointer-conventions.js";
import { tryCsharpIdentifier } from "../../target-model/names/identifiers.js";

export function selectCsharpTypeEmission(input: CsharpTypeEmissionInput): boolean {
  const visited = new Set<TargetTypeRef>();
  const admitted = (carrier: TargetTypeRef): boolean => {
    if (visited.has(carrier) || isCsharpNeverTargetType(carrier)) return true;
    visited.add(carrier);
    const method = getCsharpMethodValue(carrier);
    if (method !== undefined) return admitted(method.owner);
    switch (carrier.kind) {
      case "opaque": return false;
      case "source-primitive": return true;
      case "type-parameter": return tryCsharpIdentifier(carrier.name) !== undefined;
      case "array": return admitted(carrier.element);
      case "tuple": return carrier.elements.every(admitted);
      case "pointer": return admitted(carrier.pointee);
      case "function-pointer": return csharpFunctionPointerCallingConvention(carrier.abi) !== undefined && carrier.args.every(admitted) && admitted(carrier.result);
      case "target-named": {
        const shape = csharpRenderShapeForTargetNamedType(carrier);
        const arguments_ = carrier.typeArguments ?? [];
        if (shape === undefined || !arguments_.every(admitted)) return false;
        if (shape.kind === "predefined") return arguments_.length === 0;
        if (shape.kind === "nullable") return arguments_.length === 1;
        if (shape.usingNamespace !== undefined && (shape.usingNamespace.length === 0 || (shape.namespace?.length ?? 0) !== 0 || shape.externAlias !== undefined)) return false;
        if (shape.externAlias !== undefined && tryCsharpIdentifier(shape.externAlias) === undefined) return false;
        const segments = [{ name: shape.name, genericArity: shape.genericArity }, ...(shape.nested ?? [])];
        let offset = 0;
        for (const [index, segment] of segments.entries()) {
          if (tryCsharpIdentifier(segment.name) === undefined) return false;
          const arity = segment.genericArity ?? (shape.nested === undefined && index === segments.length - 1 ? arguments_.length - offset : 0);
          if (arity < 0 || offset + arity > arguments_.length) return false;
          offset += arity;
        }
        return offset === arguments_.length && [...shape.namespace ?? [], ...shape.usingNamespace ?? []].every(name => tryCsharpIdentifier(name) !== undefined);
      }
    }
  };
  return admitted(input.carrier);
}
