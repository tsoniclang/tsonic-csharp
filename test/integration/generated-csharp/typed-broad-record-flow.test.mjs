import test from "node:test";
import { typedBroadRecordFlowSource, incompatibleNativeArrayCastSource, freshTypedArrayRecordSource } from "../../../../tsonic/test/fixtures/broad-record-flow.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("typed broad record array views preserve the original backing", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: typedBroadRecordFlowSource }), "typed-broad-record-flow");
});

for (const guarded of [false, true]) test(`an erased broad-element array cannot be reinterpreted as a typed native backing (${guarded ? "guarded" : "unguarded"})`, { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: incompatibleNativeArrayCastSource(guarded) }), `incompatible-native-array-cast-${guarded ? "guarded" : "unguarded"}`);
});
test("fresh typed array producers retain inferred backing before record and return erasure", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: freshTypedArrayRecordSource }), "fresh-typed-array-record");
});
