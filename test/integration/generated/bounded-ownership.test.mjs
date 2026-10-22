import test from "node:test";
import { capturedStringOwnershipSource } from "../../../../tsonic/test/fixtures/captured-string-ownership.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("terminal captures and mutable string callbacks preserve repeated calls and operand snapshots",
  { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: capturedStringOwnershipSource }),
      "captured-string-ownership", false, false, [], `
Tsonic.Generated.Index.main();
for (var warmup = 0; warmup < 10000; warmup++) {
    System.GC.KeepAlive(Tsonic.Generated.Index.retained("kept"));
    System.GC.KeepAlive(NativeRetained("kept"));
}
var before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(Tsonic.Generated.Index.retained("kept"));
var generatedCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) System.GC.KeepAlive(NativeRetained("kept"));
var nativeCost = System.GC.GetAllocatedBytesForCurrentThread() - before;
if (generatedCost != nativeCost) throw new System.Exception($"captured frame allocation {generatedCost} != {nativeCost}");
var read = Tsonic.Generated.Index.retained("kept");
before = System.GC.GetAllocatedBytesForCurrentThread();
for (var iteration = 0; iteration < 10000; iteration++) {
    if (!object.ReferenceEquals(read(), "kept")) throw new System.Exception("retained native string identity");
}
if (System.GC.GetAllocatedBytesForCurrentThread() != before) throw new System.Exception("captured string read allocation");
static System.Func<string> NativeRetained(string value) => () => value;
`);
  });
