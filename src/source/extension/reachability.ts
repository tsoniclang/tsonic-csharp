import type { ExtensionFactSubject, Node, ReadonlySourceFactResolver } from "@tsonic/tsts";

import { tsonicKeepAliveFactKey } from "@tsonic/source-core/facts";

export function readCsharpSourceKeepAlive(
  sourceFacts: ReadonlySourceFactResolver | undefined,
  subject: ExtensionFactSubject | undefined,
): { readonly call: Node; readonly valueExpression: Node } | undefined {
  const fact = sourceFacts?.getFact(subject, tsonicKeepAliveFactKey);
  return fact === undefined ? undefined : Object.freeze({
    call: fact.call,
    valueExpression: fact.valueExpression,
  });
}
