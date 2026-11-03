import test from "node:test";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`fixed-signature recursive pointer returns keep one backing in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: `
import type { Pointer, uint32, int32 } from "@tsonic/core/types.js";
import { allocateptr, loadptr, storeptr, equalptr } from "@tsonic/core/lang.js";
export function relay(pointer: Pointer<uint32>, depth: int32): Pointer<uint32> {
  if (depth === 0) return pointer;
  return relay(pointer, depth - 1);
}
export function run(): boolean {
  const original = allocateptr<uint32>(3);
  const other = allocateptr<uint32>(7);
  const alias = relay(original, 4);
  storeptr(alias, 13);
  return equalptr(original, alias) && !equalptr(other, alias) &&
    loadptr(original) === 13 && loadptr(other) === 7;
}
` });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `pointer-return-recursion-${surface}`);
  });
}
