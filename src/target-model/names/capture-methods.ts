import type { CsharpFrameClosure } from "../records/callables/capture-storage.js";

export function csharpFrameClosureMethodName(method: CsharpFrameClosure): string {
  return method.identity.kind === "activation" ? `invoke${method.identity.index}` : method.identity.name;
}
