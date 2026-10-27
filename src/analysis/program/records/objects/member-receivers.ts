import type { Node } from "@tsonic/tsts";
import type { CsharpMemberReceiverRecords, CsharpMemberReceiverEmission, CsharpNativeMethodCallee } from "../../../../target-model/records/objects/member-receivers.js";

export function createCsharpMemberReceiverRecords(input: {
  readonly receivers: ReadonlyMap<Node, ReadonlyMap<Node | undefined, CsharpMemberReceiverEmission>>;
  readonly functions: ReadonlyMap<Node, "identifier" | "module">;
  readonly methods: ReadonlyMap<Node, CsharpNativeMethodCallee>;
}): CsharpMemberReceiverRecords {
  const receivers = new WeakMap<Node, ReadonlyMap<Node | undefined, CsharpMemberReceiverEmission>>();
  const functions = new WeakMap<Node, "identifier" | "module">();
  const methods = new WeakMap<Node, CsharpNativeMethodCallee>();
  for (const [node, entries] of input.receivers) receivers.set(node, new Map([...entries].map(([owner, value]) => [owner, Object.freeze(value)])));
  for (const [node, value] of input.functions) functions.set(node, value);
  for (const [node, value] of input.methods) methods.set(node, Object.freeze(value));
  return Object.freeze({ memberReceiver: Object.freeze({ get: (node: Node, declaration: Node | undefined) => receivers.get(node)?.get(declaration) }),
    nativeFunctionCallee: Object.freeze({ get: (node: Node) => functions.get(node) }),
    nativeMethodCallee: Object.freeze({ get: (node: Node) => methods.get(node) }) });
}
