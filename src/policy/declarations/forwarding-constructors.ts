import type { CsharpTargetParameter } from "../../target-model/types/model.js";
import { tryCsharpIdentifier } from "../../target-model/names/identifiers.js";
import { selectCsharpTypeEmission } from "../types/type-emission.js";
import type { CsharpForwardingConstructorEmission } from "../../target-model/records/class-emission.js";

export function selectCsharpForwardingConstructor(parameters: readonly CsharpTargetParameter[]):
  | { readonly kind: "selected"; readonly variants: readonly CsharpForwardingConstructorEmission["parameters"][] }
  | { readonly kind: "unsupported"; readonly code: "CSHARP_UNSUPPORTED_AST" | "CSHARP_INVALID_IDENTIFIER"; readonly message: string } {
  const paramsIndex = parameters.findIndex(parameter => parameter.paramsArray === true);
  let required = parameters.length;
  while (required > 0 && parameters[required - 1]?.csharpOmittableOptionalArgument === true) required -= 1;
  if (paramsIndex >= 0 ? paramsIndex !== parameters.length - 1 || parameters.slice(0, paramsIndex).some(parameter => parameter.csharpOmittableOptionalArgument === true)
    : parameters.slice(0, required).some(parameter => parameter.csharpOmittableOptionalArgument === true))
    return { kind: "unsupported", code: "CSHARP_UNSUPPORTED_AST", message: "Implicit constructor parameters do not have one representable C# omission order." };
  const selected: CsharpForwardingConstructorEmission["parameters"][number][] = [];
  for (const parameter of parameters) {
    if (!selectCsharpTypeEmission({ carrier: parameter.type })) return { kind: "unsupported", code: "CSHARP_UNSUPPORTED_AST",
      message: `Implicit constructor parameter '${parameter.name}' has no renderable C# type.` };
    const mode = parameter.passingMode;
    if (mode === "borrow-shared" || mode === "borrow-mut" || mode === "move") return { kind: "unsupported", code: "CSHARP_UNSUPPORTED_AST",
      message: `Implicit constructor parameter '${parameter.name}' uses unsupported passing mode '${mode}'.` };
    const name = tryCsharpIdentifier(parameter.name);
    if (name === undefined) return { kind: "unsupported", code: "CSHARP_INVALID_IDENTIFIER",
      message: `Implicit constructor parameter '${parameter.name}' is not a valid C# identifier. Add an explicit target name/fact instead of relying on backend name rewriting.` };
    selected.push(Object.freeze({ name, carrier: parameter.type, passing: mode === "byref-readonly" ? "in" : mode === "byref-readwrite" ? "ref"
      : mode === "byref-writeonly-must-init" ? "out" : undefined, paramsArray: parameter.paramsArray === true }));
  }
  return Object.freeze({ kind: "selected", variants: Object.freeze(paramsIndex >= 0 ? [Object.freeze(selected)]
    : Array.from({ length: selected.length - required + 1 }, (_, index) => Object.freeze(selected.slice(0, required + index)))) });
}
