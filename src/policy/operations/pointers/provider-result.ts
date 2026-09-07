import { selectTsonicProviderPointerResult } from "@tsonic/source-core/facts";
import type { ResolvedSourceCallInfo, SourceProviderTypeParameterSelection } from "@tsonic/target-api/source";
import type { SourceFile } from "@tsonic/tsts";
import type { CsharpProviderCallInstantiationHost } from "../../members/instantiation/instantiation.js";
import { csharpRuntimeLocationTargetType, csharpRuntimeRawPointerTargetType } from "../../../target-model/types/runtime-carriers.js";
import { csharpSourcePrimitiveTargetType } from "../../../target-model/types/scalar-types.js";
import { csharpNullableTargetType } from "../../../target-model/types/nullable.js";
import { csharpJsArrayTargetType } from "../../types/resolution/surface-types.js";
import { selectedCsharpSourceProfileOwner } from "../../types/resolution/source-profile.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";

export function selectCsharpProviderPointerResult(
  host: CsharpProviderCallInstantiationHost,
  source: ResolvedSourceCallInfo,
  file: SourceFile,
  typeParameter: (parameter: SourceProviderTypeParameterSelection) => TargetTypeRef | undefined,
) {
  if (host.sourceFacts === undefined) return undefined;
  return selectTsonicProviderPointerResult<TargetTypeRef>(source, host.ast, host.semantics(file), host.sourceFacts, {
    primitive: csharpSourcePrimitiveTargetType,
    raw: csharpRuntimeRawPointerTargetType,
    pointer: csharpRuntimeLocationTargetType,
    optional: csharpNullableTargetType,
    array: element => selectedCsharpSourceProfileOwner(host.target) === "js"
      ? csharpJsArrayTargetType(element) : { kind: "array", element },
    tuple: elements => ({ kind: "tuple", elements }),
    typeParameter,
    sourceType: (type, syntax) => host.types.resolveSelectedType(syntax, type, file),
  });
}
