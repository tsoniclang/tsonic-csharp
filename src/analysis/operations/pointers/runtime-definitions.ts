import type { Node } from "@tsonic/tsts";
import type { CsharpPolicyContext } from "../../../policy/model/context.js";
import type { CsharpNativeGenericTypeDefinition } from "../../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import { sourceNativeGenericDefinition } from "../../../policy/types/source-type-flow/representation-runtime.js";

export function selectCsharpMemoryRuntimeDefinition(
  input: Pick<CsharpPolicyContext, "providers">,
  name: "Location" | "RawPointer" | "NativeLayout" | "NativeArray" | "RecordField",
  site: Node,
): CsharpRepresentationOutcome<CsharpNativeGenericTypeDefinition> {
  const arity = name === "RawPointer" ? 0 : 1;
  return sourceNativeGenericDefinition({ providers: input.providers,
    acquireNativeDeclaration: identity => input.providers.acquireNativeDeclaration(identity) },
  `Tsonic.CSharp.Runtime.${name}${arity === 0 ? "" : "`1"}`, arity, name === "RecordField" ? "struct" : "class", site);
}
