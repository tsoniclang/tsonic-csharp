import test from "node:test";
import { jsonNativeProjectionSource } from "../../../../tsonic/test/fixtures/json-native-projection.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";

test("native JSON projections preserve exact integers, property keys and callback error identity", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", sourceText: jsonNativeProjectionSource }),
    "json-native-projection", false, false, [], "Tsonic.Generated.Index.run();");
});
