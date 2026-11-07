// C# representation entry (nextgen plan §2, C-2542). The ONE mapping from Host facts to .NET types (I6).
// Reads SourceProgramFacts only: no checker Type / Signature / Symbol, no Source decision (I2).
// Sums are positional in the Host arm order; Native never re-sorts or re-dedupes (R6).
// A missing fact for a supported form is an invariant failure (throw), never a fallback (I4).
import type { CsharpRepresentationInputs, CsharpRepresentationServices } from "./context.js";
import { createCsharpSourceTypeParameterEnvironment } from "./generics.js";

export type {
  CsharpPlatformBridge,
  CsharpRefusal,
  CsharpRepresentation,
  CsharpRepresentationContext,
  CsharpRepresentationInputs,
  CsharpRepresentationProfile,
  CsharpRepresentationServices,
  CsharpRepresentationShapeRegistry,
  CsharpValueRepresentation,
} from "./context.js";
export { csharpRefusal, csharpRepresentationContext, isCsharpRefusal, isCsharpRepresented, isSourceRefusal } from "./context.js";
export { representInstantiation, representObject, representSourceSum, representSourceType, representedSourceType,
  type CsharpInstantiationRepresentation } from "./descriptors.js";
export { representAwaited, representCallableReturn, representSlot, representValue } from "./values.js";
export { representSourceUnionOperations, representSourceUnionRole, sourceSumSelection } from "./sums.js";
export { representSignatureTypeParameters, type CsharpMemberTypeParameters } from "./callables.js";
export { createCsharpTypeParameterEnvironment, representTypeParameterConstraints } from "./generics.js";
export { authoredTypeDescriptor } from "./declared.js";
export { representObjectMembers } from "./objects.js";

/** One services object per program view (the facts object's lifetime). */
export function createCsharpRepresentationServices(inputs: CsharpRepresentationInputs): CsharpRepresentationServices {
  let services: CsharpRepresentationServices | undefined;
  const typeParameters = createCsharpSourceTypeParameterEnvironment(() => {
    if (services === undefined) throw new TypeError("C# representation services are used before they are created.");
    return services;
  });
  services = Object.freeze({ ...inputs, typeParameters, recursiveAliases: new Map() });
  return services;
}
