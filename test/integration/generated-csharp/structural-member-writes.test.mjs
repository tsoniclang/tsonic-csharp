import test from "node:test";
import { structuralMemberWritesSource } from "../../../../tsonic/test/fixtures/structural-member-writes.mjs";
import { compileCsharpSource } from "../../helpers/direct-csharp-session.mjs";
import { executeCsharpConstruction } from "../../helpers/native-construction.mjs";

for (const surface of [undefined, "js"]) test(`structural member writes preserve native aliases and callback identity in ${surface ?? "native"}`,
  { timeout: 300_000 }, () => {
    executeCsharpConstruction(compileCsharpSource({ surface, sourceText: structuralMemberWritesSource }),
      `structural-member-writes-${surface ?? "native"}`);
  });
