import test from "node:test";
import { lexicalFunctionValuesSource } from "../../../../tsonic/test/fixtures/lexical-function-values.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of ["native", "js"]) {
  test(`lexical function values retain activation identity and hoisting in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: lexicalFunctionValuesSource });
    executeCsharpConstruction(compiled, "lexical-function-values");
  });
}

test("retained lexical counter matches handwritten delegate allocation and has allocation-free calls", { timeout: 300_000 }, () => {
  const compiled = compileCsharpSource({ surface: "native", sourceText: lexicalFunctionValuesSource });
  executeCsharpConstruction(compiled, "lexical-function-value-cost", false, false, [], `
static System.Func<int> NativeCounter() {
    var value = 0;
    int Next() { return ++value; }
    return new System.Func<int>(Next);
}
static System.Func<int>? NativeBranchCounter(bool flag) {
    var value = 0;
    int Next() { return ++value; }
    return flag ? new System.Func<int>(Next) : null;
}
for (var index = 0; index < 100; index++) {
    Tsonic.Generated.Index.counter(); NativeCounter(); Tsonic.Generated.Index.optionalCounter(false);
    Tsonic.Generated.Index.branchCounter(false); NativeBranchCounter(false);
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
var actual = Tsonic.Generated.Index.counter();
var actualBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var expected = NativeCounter();
var nativeBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (actualBytes != nativeBytes) throw new System.Exception("lexical environment differs from handwritten allocation");
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var index = 1; index <= 10000; index++) {
    if (actual() != index) throw new System.Exception("retained invocation result");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("retained invocation allocation");
before = System.GC.GetAllocatedBytesForCurrentThread();
if (Tsonic.Generated.Index.optionalCounter(false) is not null) throw new System.Exception("early-exit result");
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("early-exit allocation");
before = System.GC.GetAllocatedBytesForCurrentThread();
var absent = Tsonic.Generated.Index.branchCounter(false);
var actualBranchBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var nativeAbsent = NativeBranchCounter(false);
var nativeBranchBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (absent is not null || nativeAbsent is not null || actualBranchBytes != nativeBranchBytes) {
    throw new System.Exception("conditional value differs from handwritten allocation");
}
System.GC.KeepAlive(expected);
`);
});
