import type {
  TargetTypeRef,
} from "@tsonic/tsts";
import type {
  CsharpTargetIterationFact,
} from "../../source/csharp-facts.js";

export function targetTypeRefFromFactSubject(subject: CsharpTargetIterationFact["elementType"]): TargetTypeRef | undefined {
  if (subject === undefined || typeof subject !== "object" || subject === null) {
    return undefined;
  }
  const kind = (subject as { readonly kind?: unknown }).kind;
  switch (kind) {
    case "source-primitive":
    case "target-named":
    case "type-parameter":
    case "array":
    case "tuple":
    case "pointer":
    case "function-pointer":
    case "opaque":
    case "associated-type":
    case "lifetime":
    case "target-specific":
      return subject as TargetTypeRef;
    default:
      return undefined;
  }
}
