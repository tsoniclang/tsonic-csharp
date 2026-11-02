import test from "node:test";
import { receiverOwnerCaptures } from "../../../../tsonic/test/fixtures/receiver-owner-captures.mjs";
import { compileCsharpSource, assertCsharpCompilationSucceeded } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { assertNumericLiteralRefusal, numericCarrierRefusal } from "../../helpers/numeric-literal-rulings.mjs";
import { csharpSourcePrimitiveTargetType } from "../../../dist/target-model/types/carriers/scalar-types.js";

for (const example of Array.from(receiverOwnerCaptures).slice(0, 4)) {
for (const surface of Array.from(["native", "js"]).slice(0, 2)) {
for (const ownNumber of example.name === "accessor-and-live-replacement" ? [false, true] : [false]) {
test(ownNumber ? `retained own-number native receiver ${example.name} in ${surface}`
  : `retained native receiver ${example.name} in ${surface}`, { timeout: 300_000 }, () => {
    const compiled = compileCsharpSource({ surface, sourceText: ownNumber
      ? example.source.replace("count = 1;", "count: number = 1;") : example.source });
    if (example.name === "accessor-and-live-replacement" && !ownNumber) {
      assertNumericLiteralRefusal(compiled, [numericCarrierRefusal(csharpSourcePrimitiveTargetType("float64"),
        csharpSourcePrimitiveTargetType("int64"), "value")]);
      return;
    }
    assertCsharpCompilationSucceeded(compiled);
    executeCsharpConstruction(compiled, `receiver-owner-${example.name}-${surface}`, example.asynchronous);
  });
}
}
}
