import assert from "node:assert/strict";
import test from "node:test";
import { assertPublishedRefusal, compileEffectiveSource } from "../../helpers/source-effective-types.mjs";
import { nativeArrayCallbackClosureSource, nativeCallbackClosureSource, nativeNamedMemberSource, nativeObjectConstructionConversionSource, nativeRecordConstructionConversionSource, nativeSuspendedCallbackClosureSource } from "../../../../tsonic/test/fixtures/native-callback-closure.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("native array callback parameter elision retains typed and hygienic parameters",
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: nativeArrayCallbackClosureSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "native-array-callback-closure");
  });

test("native suspended callback closure retains owned promise storage and void completion",
  { timeout: 300_000 }, () => {
    assertPublishedRefusal(compileEffectiveSource("js", nativeSuspendedCallbackClosureSource),
      "TSONIC_LOCAL_TYPE_SELF_REFERENCE", "total");
  });

test("an annotated suspended callback keeps owned promise storage and every original void-completion predicate",
  { timeout: 300_000 }, () => {
    const sourceText = nativeSuspendedCallbackClosureSource.replace("let total = 0;", "let total: number = 0;");
    assert.equal(sourceText !== nativeSuspendedCallbackClosureSource, true,
      "only the captured total receives an authored type; schedule, both calls, await and the real then callback are retained");
    const compiled = compileCsharpSource({ surface: "js", sourceText });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "typed-native-suspended-callback-closure", true);
  });
