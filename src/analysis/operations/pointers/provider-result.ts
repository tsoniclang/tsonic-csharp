import { selectTsonicProviderPointerResult } from "@tsonic/source-core/facts";
import type { SourceCallSelection, SourceProviderTypeParameterSelection } from "@tsonic/target-api/source";
import type { CsharpProviderCallInstantiationHost } from "../../../policy/model/provider-calls.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpJsArrayTargetType } from "../../../target-model/types/carriers/js.js";
import { selectedCsharpSourceProfileOwner } from "../../../policy/identities/source-types.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

/** The pointer result of a provider call, from the Host call selection and published descriptors (source-core protocol). */
export function selectCsharpProviderPointerResult(
  host: CsharpProviderCallInstantiationHost,
  source: SourceCallSelection,
  typeParameter: (parameter: SourceProviderTypeParameterSelection) => TargetTypeRef | undefined,
) {
  if (host.sourceFacts === undefined) return undefined;
  return selectTsonicProviderPointerResult<TargetTypeRef>(source, host.ast, host.facts, host.sourceFacts, {
    primitive: csharpSourcePrimitiveTargetType,
    raw: csharpRuntimeRawPointerTargetType,
    pointer: csharpRuntimeLocationTargetType,
    optional: csharpNullableTargetType,
    array: element => selectedCsharpSourceProfileOwner(host.target) === "js"
      ? csharpJsArrayTargetType(element) : { kind: "array", element },
    tuple: elements => ({ kind: "tuple", elements }),
    typeParameter,
    sourceType: (descriptor, occurrence) => {
      const represented = host.types.represent(descriptor, occurrence, "value");
      return represented.kind === "csharp-refused" ? undefined : represented;
    },
  });
}
