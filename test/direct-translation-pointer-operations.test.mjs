import assert from "node:assert/strict";
import test from "node:test";
import {
  compileCsharpSource,
} from "./helpers/direct-csharp-session.mjs";

test("typed locations preserve aliases, parameters, returns, and fresh allocation", () => {
  const compiled = cleanCompile(`
    import { addressOf, allocatePointer, loadPointer, storePointer } from "@tsonic/core/lang.js";
    import type { int32, Pointer } from "@tsonic/core/types.js";

    function increment(pointer: Pointer<int32>): void {
      storePointer(pointer, loadPointer(pointer) + 1);
    }

    function create(): Pointer<int32> {
      return allocatePointer<int32>(40);
    }

    export function run(): int32 {
      let local: int32 = 1;
      const alias = addressOf(local);
      increment(alias);
      const allocated = create();
      increment(allocated);
      return local + loadPointer(allocated);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static void increment(Tsonic.CSharp.Runtime.Location<int> pointer)
        {
            pointer.Store(pointer.Load() + 1);
        }
        public static Tsonic.CSharp.Runtime.Location<int> create()
        {
            return Tsonic.CSharp.Runtime.Location<int>.Allocate(40);
        }
        public static int run()
        {
            int local = 1;
            Tsonic.CSharp.Runtime.Location<int> alias = Tsonic.CSharp.Runtime.Location<int>.Create(() => local, __tsonic_param0 => local = __tsonic_param0);
            increment(alias);
            Tsonic.CSharp.Runtime.Location<int> allocated = create();
            increment(allocated);
            return local + allocated.Load();
        }
    }
}
`);
});

test("typed locations retain generic pointees and conditional identity", () => {
  const compiled = cleanCompile(`
    import { addressOf, loadPointer, storePointer } from "@tsonic/core/lang.js";
    import type { bool, int32, Pointer } from "@tsonic/core/types.js";

    export function replace<T>(pointer: Pointer<T>, value: T): T {
      storePointer(pointer, value);
      return loadPointer(pointer);
    }

    export function choose(flag: bool): int32 {
      let left: int32 = 1;
      let right: int32 = 2;
      const pointer = flag ? addressOf(left) : addressOf(right);
      storePointer(pointer, 3);
      return left + right;
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static T replace<T>(Tsonic.CSharp.Runtime.Location<T> pointer, T value)
        {
            pointer.Store(value);
            return pointer.Load();
        }
        public static int choose(bool flag)
        {
            int left = 1;
            int right = 2;
            Tsonic.CSharp.Runtime.Location<int> pointer = flag ? Tsonic.CSharp.Runtime.Location<int>.Create(() => left, __tsonic_param0 => left = __tsonic_param0) : Tsonic.CSharp.Runtime.Location<int>.Create(() => right, __tsonic_param1 => right = __tsonic_param1);
            pointer.Store(3);
            return left + right;
        }
    }
}
`);
});

test("address acquisition evaluates reference receivers and indexes exactly once", () => {
  const compiled = cleanCompile(`
    import { addressOf, storePointer } from "@tsonic/core/lang.js";
    import type { int32 } from "@tsonic/core/types.js";

    export class Box { value: int32 = 1; }
    let receiverCalls: int32 = 0;
    let indexCalls: int32 = 0;

    function select(box: Box): Box {
      receiverCalls++;
      return box;
    }

    function index(): int32 {
      indexCalls++;
      return 0;
    }

    export function run(box: Box, values: int32[]): int32 {
      const field = addressOf(select(box).value);
      const element = addressOf(values[index()]);
      storePointer(field, 3);
      storePointer(element, 4);
      return receiverCalls + indexCalls + box.value + values[0];
    }
  `);
  const source = compiled.artifacts.get("src/Index.cs");

  assert.equal(occurrences(source, "Location<int>.Create(select(box),"), 1);
  assert.equal(occurrences(source, "Location<int>.Create(values, index(),"), 1);
  assert.equal(occurrences(source, "select(box)"), 1);
  assert.equal(occurrences(source, "index()"), 2);
  assert.match(
    source,
    /__tsonic_param0 => __tsonic_param0\.value, \(__tsonic_param0, __tsonic_param1\) => __tsonic_param0\.value = __tsonic_param1/u,
  );
  assert.match(
    source,
    /\(__tsonic_param2, __tsonic_param3\) => __tsonic_param2\[__tsonic_param3\], \(__tsonic_param2, __tsonic_param3, __tsonic_param4\) => __tsonic_param2\[__tsonic_param3\] = __tsonic_param4/u,
  );
});

test("address-of rejects each readonly or non-storage occurrence independently", () => {
  const compiled = compileCsharpSource({
    sourceText: `
      import { addressOf } from "@tsonic/core/lang.js";
      import type { int32 } from "@tsonic/core/types.js";

      export function reject(): void {
        const value: int32 = 1;
        addressOf(value);
        addressOf(value + 1);
      }
    `,
  });

  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(
    compiled.extensionDiagnostics.map((diagnostic) => ({
      code: diagnostic.publicCode,
      message: diagnostic.message,
    })),
    [
      {
        code: "TSTS_SOURCE_SEMANTICS_0002",
        message: "addressOf(...) requires writable storage.",
      },
      {
        code: "TSTS_SOURCE_SEMANTICS_0002",
        message: "addressOf(...) requires writable storage.",
      },
    ],
  );
  assert.notEqual(
    compiled.extensionDiagnostics[0].identity,
    compiled.extensionDiagnostics[1].identity,
  );
});

test("same-spelled local pointer functions remain ordinary source calls", () => {
  const compiled = cleanCompile(`
    import type { int32 } from "@tsonic/core/types.js";

    function loadPointer(value: int32): int32 {
      return value;
    }

    export function run(value: int32): int32 {
      return loadPointer(value);
    }
  `);

  assert.equal(compiled.artifacts.get("src/Index.cs"), `using System;

namespace Tsonic.Generated
{
    public static class Index
    {
        public static int loadPointer(int value)
        {
            return value;
        }
        public static int run(int value)
        {
            return loadPointer(value);
        }
    }
}
`);
});

function cleanCompile(sourceText) {
  const compiled = compileCsharpSource({ sourceText });
  assert.equal(compiled.sourceDiagnosticsText, "");
  assert.deepEqual(compiled.extensionDiagnostics, []);
  assert.deepEqual(compiled.targetDiagnostics, []);
  return compiled;
}

function occurrences(text, fragment) {
  assert.equal(typeof text, "string");
  return text.split(fragment).length - 1;
}
