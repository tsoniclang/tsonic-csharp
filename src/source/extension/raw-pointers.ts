import { rawPointerOperationFactKey } from "@tsonic/tsts";
import type { ExtensionFactSubject, ReadonlySourceFactResolver } from "@tsonic/tsts";

import type { CsharpSourceRawPointerIdentity } from "../../target-model/records/raw-pointers.js";
export function readCsharpSourceRawPointerIdentity(
  facts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): CsharpSourceRawPointerIdentity | undefined {
  const fact = facts?.getFact(subject, rawPointerOperationFactKey);
  if (fact === undefined || fact.operation === "bind-raw-pointer") return undefined;
  return Object.freeze({
    call: fact.call,
    operation: fact.operation,
    arguments: Object.freeze(fact.operation === "equal-raw-pointer"
      ? [{ expression: fact.leftExpression, type: fact.leftType }, { expression: fact.rightExpression, type: fact.rightType }]
      : [{ expression: fact.pointerExpression, type: fact.pointerType }]),
  });
}
