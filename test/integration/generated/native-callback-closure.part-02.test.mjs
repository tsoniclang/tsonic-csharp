import { assertNumericLiteralRefusal, numericCompoundRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import test from "node:test";
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
    const original = compileCsharpSource({ surface: "js", sourceText: nativeSuspendedCallbackClosureSource });
    assertNumericLiteralRefusal(original, [numericCompoundRefusal("+=", "total += value")]);
    const compiled = compileCsharpSource({ surface: "js", sourceText: nativeSuspendedCallbackClosureSource.replace("let total = 0", "let total: number = 0") });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "native-suspended-callback-closure", true);
  });
