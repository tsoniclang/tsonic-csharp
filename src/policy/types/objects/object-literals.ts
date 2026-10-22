import type { CsharpDelegateSignatureShape } from "../../../target-model/types/model.js";
import { getCsharpLambdaSignature } from "../../../target-model/types/index.js";
import type { CsharpObjectLiteralCallablePolicyInput } from "../../model/object-literals.js";
import { csharpTargetTypeRenderingRejection } from "../model/renderability.js";

export function selectCsharpObjectLiteralCallable(input: CsharpObjectLiteralCallablePolicyInput):
  | { readonly kind: "selected"; readonly signature: CsharpDelegateSignatureShape }
  | { readonly kind: "rejected"; readonly reason: "carrier" | "signature" } {
  if (csharpTargetTypeRenderingRejection(input.storage) !== undefined ||
    input.receiver !== undefined && csharpTargetTypeRenderingRejection(input.receiver) !== undefined) {
    return { kind: "rejected", reason: "carrier" };
  }
  const signature = getCsharpLambdaSignature(input.carrier);
  if (signature === undefined || csharpTargetTypeRenderingRejection(input.carrier) !== undefined ||
    csharpTargetTypeRenderingRejection(signature.returnType) !== undefined ||
    signature.parameters.some(parameter => csharpTargetTypeRenderingRejection(parameter) !== undefined)) {
    return { kind: "rejected", reason: "signature" };
  }
  return { kind: "selected", signature };
}
