import { foldTsonicProviderPointerResult } from "@tsonic/source-core/facts";
import { csharpSourceCoreAnalyses } from "../../../source/extension/source-core.js";
import type { SourceCallSelection, SourceProviderTypeParameterSelection } from "@tsonic/target-api/source";
import type { CsharpProviderCallInstantiationHost } from "../../../policy/model/provider-calls.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType } from "../../../target-model/types/carriers/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/carriers/scalar-types.js";
import { csharpNullableTargetType } from "../../../target-model/types/carriers/nullable.js";
import { csharpJsArrayTargetType } from "../../../target-model/types/carriers/js.js";
import { selectedCsharpSourceProfileOwner } from "../../../policy/identities/source-types.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

/** The pointer result of a provider call: the source-core Host shape of the call, folded into C# carriers. */
export function selectCsharpProviderPointerResult(
  host: CsharpProviderCallInstantiationHost,
  source: SourceCallSelection,
  typeParameter: (parameter: SourceProviderTypeParameterSelection) => TargetTypeRef | undefined,
) {
  return foldTsonicProviderPointerResult<TargetTypeRef>(csharpSourceCoreAnalyses(host.facts).providerPointerResult(source.use), {
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
