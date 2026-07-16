import type {
  Node,
  SourceFile,
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpRuntimeCarrierSemanticsHost,
} from "../runtime-carrier-types.js";
import {
  isRuntimeUnionCarrier,
  isSourceDeclarationCarrier,
} from "./carrier-classification.js";
import {
  getCheckedExpressionRuntimeCarrierTargetTypeRef,
} from "./checked-expressions.js";
import type {
  RuntimeCarrierLifecycleFactsContext,
} from "./context.js";
import {
  getReferencedRuntimeCarrierTargetTypeRef,
} from "./referenced-facts.js";

export function getUseSiteRuntimeCarrierTargetTypeRef(
  lifecycleContext: RuntimeCarrierLifecycleFactsContext,
  sourceFile: SourceFile,
  node: Node,
  host: CsharpRuntimeCarrierSemanticsHost,
): TargetTypeRef | undefined {
  const referenced = getReferencedRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node);
  if (referenced !== undefined && isSourceDeclarationCarrier(referenced)) {
    return referenced;
  }
  const checked = getCheckedExpressionRuntimeCarrierTargetTypeRef(lifecycleContext, sourceFile, node, host);
  if (referenced === undefined) {
    return checked;
  }
  if (checked === undefined) {
    return referenced;
  }
  return checkedRuntimeCarrierShouldOverrideReferencedCarrier(checked, referenced)
    ? checked
    : referenced;
}

function checkedRuntimeCarrierShouldOverrideReferencedCarrier(checked: TargetTypeRef, referenced: TargetTypeRef): boolean {
  if (isRuntimeUnionCarrier(referenced) && !isRuntimeUnionCarrier(checked)) {
    return true;
  }
  if (isSourceDeclarationCarrier(checked) && !isSourceDeclarationCarrier(referenced)) {
    return false;
  }
  return false;
}
