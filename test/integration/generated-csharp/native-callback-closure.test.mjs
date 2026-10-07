import test from "node:test";
import { nativeArrayCallbackClosureSource, nativeCallbackClosureSource, nativeNamedMemberSource, nativeObjectConstructionConversionSource, nativeRecordConstructionConversionSource, nativeSuspendedCallbackClosureSource } from "../../../../tsonic/test/fixtures/native-callback-closure.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) {
  test(`exact named member evaluation preserves native locations on ${surface ?? "native"}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: nativeNamedMemberSource });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `native-named-members-${surface ?? "native"}`);
    });
  test(`native object construction retains its exact carrier on ${surface ?? "native"}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: nativeObjectConstructionConversionSource });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `native-object-construction-${surface ?? "native"}`);
    });
  test(`native callback closure retains exact storage and implementation ABI on ${surface ?? "native"}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: nativeCallbackClosureSource });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `native-callback-closure-${surface ?? "native"}`);
    });
}

test("JS-profile record construction retains the exact selected dictionary and union arm",
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: nativeRecordConstructionConversionSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "native-record-construction");
  });

test("native array callback parameter elision retains typed and hygienic parameters",
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: nativeArrayCallbackClosureSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "native-array-callback-closure");
  });

test("native suspended callback closure retains owned promise storage and void completion",
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: nativeSuspendedCallbackClosureSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "native-suspended-callback-closure", true);
  });
