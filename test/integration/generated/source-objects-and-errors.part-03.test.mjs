import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { assertCsharpCompilationSucceeded, compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { memoryAbiCapability } from "../../helpers/memory-abi.mjs";
import { explicitErrorStackSource, invalidErrorStackSources } from "../../../../tsonic/test/fixtures/explicit-error-stacks.mjs";
import { sourceClassAnnotationSource, invalidSourceClassAnnotations } from "../../../../tsonic/test/fixtures/source-class-annotations.mjs";
import { boundMemoryRecordProofFiles } from "../../../../tsonic/test/fixtures/bound-memory-records.mjs";
import { numberArrayUnionFiles } from "../../../../tsonic/test/fixtures/number-array-unions.mjs";
import { frozenObjectSources } from "../../../../tsonic/test/fixtures/frozen-objects.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const valueRepresentation of Array.from([false, true]).slice(1, 2)) {
for (const surface of Array.from([undefined, "js"]).slice(1, 2)) {
const label = `${valueRepresentation ? "value" : "reference"}-${surface ?? "native"}`;

test(`bound records retain live field locations, ownership and errors in ${label}`, { timeout: 300_000 }, () => {
      const files = boundMemoryRecordProofFiles(valueRepresentation);
      executeCsharpConstruction(compileCsharpSource({ surface, capabilities: [memoryAbiCapability("csharp")],
        sourceText: files["index.ts"],
        files: Object.fromEntries(Object.entries(files).filter(([path]) => path !== "index.ts")),
      }), `bound-records-${label}`);
    });
}
}

test("typed and ordinary numeric array unions preserve reads, width and copy independence", { timeout: 300_000 }, () => {
  executeCsharpConstruction(compileCsharpSource({ surface: "js", targetOptions: { outputType: "Exe" },
    sourceText: `${numberArrayUnionFiles["index.ts"]}\nif (!run()) throw new Error("number array union contract");`,
    files: { "arrays.ts": numberArrayUnionFiles["arrays.ts"] },
  }), "number-array-unions");
});
