import test from "node:test";
import { stableWrappedBorrowObservationsSource } from "../../../../tsonic/test/fixtures/stable-wrapped-borrows.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

test("transparent reads and produced Strings preserve native snapshots across later mutation", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: stableWrappedBorrowObservationsSource }),
    "stable-wrapped-borrows");
});
