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
static System.Func<int>? NativeBranchIdentity(bool flag) {
    var value = 0;
    int Next() { return ++value; }
    if (flag) {
        var left = new System.Func<int>(Next);
        var right = left;
        return object.ReferenceEquals(left, right) ? left : null;
    }
    return null;
}
for (var index = 0; index < 100; index++) {
    Tsonic.Generated.Index.counter(); NativeCounter(); Tsonic.Generated.Index.optionalCounter(false);
    Tsonic.Generated.Index.branchCounter(false); NativeBranchCounter(false);
    Tsonic.Generated.Index.branchIdentity(false); NativeBranchIdentity(false);
    Tsonic.Generated.Index.branchIdentity(true); NativeBranchIdentity(true);
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
before = System.GC.GetAllocatedBytesForCurrentThread();
var skipped = Tsonic.Generated.Index.branchIdentity(false);
var skippedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var nativeSkipped = NativeBranchIdentity(false);
var nativeSkippedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (skipped is not null || nativeSkipped is not null || skippedBytes != nativeSkippedBytes) {
    throw new System.Exception("repeated conditional values allocate on an unused path");
}
before = System.GC.GetAllocatedBytesForCurrentThread();
var selected = Tsonic.Generated.Index.branchIdentity(true);
var selectedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
var nativeSelected = NativeBranchIdentity(true);
var nativeSelectedBytes = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (selected is null || nativeSelected is null || selected() != 1 || nativeSelected() != 1 || selectedBytes != nativeSelectedBytes) {
    throw new System.Exception($"repeated conditional native identity/cost: generated={selectedBytes}, native={nativeSelectedBytes}, present={selected is not null && nativeSelected is not null}");
}
System.GC.KeepAlive(expected);
`);
});
