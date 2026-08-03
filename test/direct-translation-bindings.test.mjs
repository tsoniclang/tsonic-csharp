import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("direct C# binding translation preserves tuple ordinals, defaults, rests, optional members, and assignment locations", () => {
  const compiled = cleanCompile(`
    import type { int } from "@tsonic/csharp/types.js";

    export interface User {
      name: string;
      age?: int;
      active: boolean;
    }

    export function unpack(
      values: int[],
      pair: [string, int],
      user: User,
    ): int {
      const [first, ...tail] = values;
      const [, count] = pair;
      const { age = 0, ...identity } = user;
      let left: int = 0;
      let right: int = 0;
      [left, right] = values;
      return first + tail.Length + count + age + left + right + (identity.active ? 1 : 0);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int unpack(int[] values, (string, int) pair, User user)
        {
            int[] __tsonic_destructure0 = values;
            int first = __tsonic_destructure0[0];
            int[] tail = Tsonic.CSharp.Runtime.ArrayHelpers.Slice(__tsonic_destructure0, 1);
            (string, int) __tsonic_destructure1 = pair;
            int count = __tsonic_destructure1.Item2;
            User __tsonic_destructure2 = user;
            int age = __tsonic_destructure2.age ?? 0;
            __TsonicShape_f6c289dcaa1c0c663f7aa8939a0e646825c958e9b9efdca5b2330efc5ac3ab11 identity = new __TsonicShape_f6c289dcaa1c0c663f7aa8939a0e646825c958e9b9efdca5b2330efc5ac3ab11
            {
                name = __tsonic_destructure2.name,
                active = __tsonic_destructure2.active,
            };
            int left = 0;
            int right = 0;
            int[] __tsonic_destructure3 = values;
            left = __tsonic_destructure3[0];
            right = __tsonic_destructure3[1];
            return first + tail.Length + count + age + left + right + (identity.active ? 1 : 0);
        }
    }
    public interface User
    {
        string name { get; set; }
        int? age { get; set; }
        bool active { get; set; }
    }
}
`);
  assert.equal(
    compiled.artifacts.get("generated/TsonicObjectShapes.cs"),
    `using System;

namespace Tsonic.Generated
{
    public class __TsonicShape_f6c289dcaa1c0c663f7aa8939a0e646825c958e9b9efdca5b2330efc5ac3ab11
    {
        public required bool active;
        public required string name;
    }
}
`,
  );
});

function cleanCompile(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled;
}
