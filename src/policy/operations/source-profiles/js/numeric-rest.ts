import type { SourcePrimitiveKind } from "@tsonic/tsts";
import { selectCsharpConversion } from "../../../conversions/index.js";
import { csharpSourcePrimitiveTargetType, getCsharpJsArrayElementTargetType, type TargetTypeRef } from "../../../types/index.js";
import { resolveCsharpSelectedSourceValue, type CsharpSourceProfileCallPolicyContext } from "../source-profile-policy.js";

export function csharpJsNumericRestCarrier(context: CsharpSourceProfileCallPolicyContext): TargetTypeRef | undefined {
  const elements: TargetTypeRef[] = [];
  for (const argument of context.source.sourceArguments) {
    if (context.host.ast.is.IsSpreadElement(argument.expression)) {
      const operand = context.host.ast.as.AsSpreadElement(argument.expression)?.Expression;
      const type = operand === undefined ? undefined : context.host.types.resolveNode(operand, context.sourceFile);
      const element = type?.kind === "array" ? type.element : getCsharpJsArrayElementTargetType(type);
      const selected = type?.kind === "tuple" ? type.elements : element === undefined ? undefined : [element];
      if (selected === undefined) return undefined;
      elements.push(...selected);
    } else {
      const type = resolveCsharpSelectedSourceValue(context, argument);
      if (type === undefined) return undefined;
      elements.push(type);
    }
  }
  if (elements.some(element => element.kind !== "source-primitive" || !numericKinds.includes(element.name))) return undefined;
  if (elements.length === 0) return csharpSourcePrimitiveTargetType("float64");
  const inputs = elements as Extract<TargetTypeRef, { kind: "source-primitive" }>[];
  const candidates = [...inputs, ...(["int32", "uint32", "int64", "uint64", "int128", "uint128", "float64"] as const)
    .map(csharpSourcePrimitiveTargetType)];
  return candidates.find(candidate => candidate.kind === "source-primitive" && inputs.every(input => {
    if (input.name === candidate.name) return true;
    if (candidate.name === "float64" && !["int8", "uint8", "int16", "uint16", "int32", "uint32", "float32"].includes(input.name)) return false;
    if (candidate.name === "float32" && !["int8", "uint8", "int16", "uint16"].includes(input.name)) return false;
    return selectCsharpConversion(context.host, input, candidate, "implicit").kind === "implicit";
  }));
}

const numericKinds: readonly SourcePrimitiveKind[] = [
  "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64",
  "int128", "uint128", "native-int", "native-uint", "float32", "float64", "decimal",
];
