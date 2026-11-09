import type { Node } from "@tsonic/tsts";
import type { CsharpNativeGenericTypeDefinition, CsharpOptionalStorageDefinitions } from "../../../target-model/types/native-type-data.js";
import type { CsharpRepresentationOutcome } from "../../../target-model/types/representation.js";
import type { CsharpRepresentationHost } from "./representation-host.js";
import { sourceNativeGenericDefinition } from "./representation-runtime.js";
import { represented } from "./representation-results.js";

const definitionsByHost = new WeakMap<CsharpRepresentationHost["acquireNativeDeclaration"], CsharpOptionalStorageDefinitions>();

export function acquireCsharpOptionalStorageDefinitions(host: Pick<CsharpRepresentationHost, "providers" | "acquireNativeDeclaration">,
  site: Node): Exclude<CsharpRepresentationOutcome<CsharpOptionalStorageDefinitions>, { readonly kind: "source-refused" }> {
  const previous = definitionsByHost.get(host.acquireNativeDeclaration);
  if (previous !== undefined) return represented(previous);
  const declarations = [
    ["contract", "IOptionalStorage`2", 2, "interface"],
    ["value", "ValueOptionalStorage`1", 1, "struct"],
    ["nullableValue", "NullableValueOptionalStorage`1", 1, "struct"],
    ["reference", "ReferenceOptionalStorage`1", 1, "struct"],
    ["absence", "AbsentOptionalStorage", 0, "struct"],
    ["jsValue", "JsValueOptionalStorage", 0, "struct"],
  ] as const;
  const acquired = new Map<keyof CsharpOptionalStorageDefinitions, CsharpNativeGenericTypeDefinition>();
  for (const [key, name, arity, kind] of declarations) {
    const definition = sourceNativeGenericDefinition(host, `Tsonic.CSharp.Runtime.${name}`, arity, kind, site);
    if (definition.kind !== "represented") return definition;
    acquired.set(key, definition.value);
  }
  const definitions: CsharpOptionalStorageDefinitions = Object.freeze({ contract: acquired.get("contract")!,
    value: acquired.get("value")!, nullableValue: acquired.get("nullableValue")!, reference: acquired.get("reference")!,
    absence: acquired.get("absence")!, jsValue: acquired.get("jsValue")! });
  definitionsByHost.set(host.acquireNativeDeclaration, definitions);
  return represented(definitions);
}
