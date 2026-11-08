import type { Node } from "@tsonic/tsts";
import type { CsharpObjectMethodSignature } from "../../../target-model/records/objects/object-members.js";
import type { TargetTypeRef } from "../../../target-model/types/model.js";
import type { CsharpParameter } from "../../target-ast/syntax/index.js";
import { csharpTypeFromTargetTypeRef } from "../types/render.js";
import { failCsharpPlannerInvariant } from "../diagnostics.js";

export function renderCsharpObjectMethodParameters(signature: CsharpObjectMethodSignature, names: ReadonlyMap<string, string> | undefined, subject: Node | undefined): readonly CsharpParameter[] {
  const parameters = signature.parameters.map((parameter, index) => {
    const type = renderCarrier(parameter.type, names, subject);
    return { name: `arg${index}`, type, ...(parameter.rest ? { isParams: true } : {}),
      ...(parameter.passingMode === "by-value" ? {} : { passing: parameter.passingMode === "byref-readonly" ? "in" as const
        : parameter.passingMode === "byref-readwrite" ? "ref" as const : "out" as const }),
      ...(parameter.optional ? { defaultValue: { kind: "DefaultExpression" as const, type } } : {}) };
  });
  const receiver = signature.receiver;
  return receiver === undefined ? parameters : [{
    name: "__receiver",
    type: renderCarrier(receiver.type, names, subject),
    ...(receiver.passingMode === "by-value" ? {} : {
      passing: receiver.passingMode === "byref-readonly" ? "in" as const
        : receiver.passingMode === "byref-readwrite" ? "ref" as const : "out" as const,
    }),
  }, ...parameters];
}

function renderCarrier(carrier: TargetTypeRef, names: ReadonlyMap<string, string> | undefined, subject: Node | undefined) {
  const type = csharpTypeFromTargetTypeRef(carrier, names);
  if (type === undefined) failCsharpPlannerInvariant("An admitted Native method parameter requires its exact physical carrier.", subject);
  return type;
}
