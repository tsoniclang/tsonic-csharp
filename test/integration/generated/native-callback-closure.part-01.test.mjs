import test from "node:test";
import { nativeArrayCallbackClosureSource, nativeCallbackClosureSource, nativeNamedMemberSource, nativeObjectConstructionConversionSource, nativeRecordConstructionConversionSource, nativeSuspendedCallbackClosureSource } from "../../../../tsonic/test/fixtures/native-callback-closure.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNumericLiteralRefusal, numericCarrierRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

for (const surface of Array.from([undefined, "js"]).slice(0, 2)) {
for (const ownNumber of [false, true]) {
test(ownNumber ? `exact named member evaluation keeps own-number storage on ${surface ?? "native"}`
  : `exact named member evaluation preserves native locations on ${surface ?? "native"}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: ownNumber
        ? nativeNamedMemberSource.replace("value = 3;", "value: number = 3;") : nativeNamedMemberSource });
      if (!ownNumber) {
        assertNumericLiteralRefusal(compiled, ["value", "operand()", "operand()"].map(text =>
          numericCarrierRefusal(csharpSourcePrimitiveTargetType("float64"), csharpSourcePrimitiveTargetType("int64"), text)));
        return;
      }
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `native-named-members-${surface ?? "native"}`);
    });
}

test(`native object construction retains its exact carrier on ${surface ?? "native"}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: nativeObjectConstructionConversionSource });
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `native-object-construction-${surface ?? "native"}`);
    });

for (const ownNumber of [false, true]) {
test(ownNumber ? `native callback closure keeps own-number storage and implementation ABI on ${surface ?? "native"}`
  : `native callback closure retains exact storage and implementation ABI on ${surface ?? "native"}`,
    { timeout: 300_000 }, () => {
      const compiled = compileCsharpSource({ surface, sourceText: ownNumber
        ? nativeCallbackClosureSource.replace("#value = 7;", "#value: number = 7;") : nativeCallbackClosureSource });
      if (!ownNumber) {
        assertNumericLiteralRefusal(compiled, [numericCarrierRefusal(csharpSourcePrimitiveTargetType("float64"),
          csharpSourcePrimitiveTargetType("int64"), "value")]);
        return;
      }
      assertCsharpCompilationSucceeded(compiled);
      executeCsharpConstruction(compiled, `native-callback-closure-${surface ?? "native"}`);
    });
}
}

test("JS-profile record construction retains the exact selected dictionary and union arm",
  { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface: "js", sourceText: nativeRecordConstructionConversionSource });
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, "native-record-construction");
  });
