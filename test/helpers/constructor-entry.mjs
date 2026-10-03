export const constructorEntrySource = `
  import type { int32 } from "@tsonic/core/types.js";
  let order = "";
  function mark(value: string): void { order += value; }
  class Base {
    left: int32; right: int32;
    constructor(left: int32, right: int32) { mark("B"); this.left = left; this.right = right; }
  }
  class Derived extends Base {
    after: int32;
    constructor({ value }: { value: int32 }, extra: int32 = (mark("D"), 4 as int32)) {
      super((mark("L"), value += extra), (mark("R"), value));
      this.after = value;
    }
  }
  class CapturedBase {
    left: int32;
    constructor(callback: () => int32) { this.left = callback(); }
  }
  class Captured extends CapturedBase {
    after: int32; read: () => int32;
    constructor(value: int32, adjust: () => int32 = () => ++value) {
      super(adjust);
      this.after = value;
      this.read = () => value + this.left;
    }
  }
  class EmptyBase { constructor() { mark("Z"); } }
  class Single extends EmptyBase {
    value: int32;
    constructor(value: int32 = (mark("E"), 8 as int32)) { super(); this.value = value; }
  }
  class Wide extends Base {
    total: int32;
    constructor({ a, b, c, d, e, f, g, h }: { a: int32; b: int32; c: int32; d: int32; e: int32; f: int32; g: int32; h: int32 }) {
      super(a, h);
      this.total = a + b + c + d + e + f + g + h;
    }
  }
  export function run(): boolean {
    order = "";
    const first = new Derived({ value: 3 as int32 });
    if (order !== "DLRB" || first.left !== 7 || first.right !== 7 || first.after !== 7) return false;
    order = "";
    const supplied = new Derived({ value: 3 as int32 }, 2 as int32);
    if (order !== "LRB" || supplied.left !== 5 || supplied.after !== 5) return false;
    const captured = new Captured(9 as int32);
    if (captured.left !== 10 || captured.after !== 10 || captured.read() !== 20) return false;
    order = "";
    const single = new Single();
    if (order !== "EZ" || single.value !== 8) return false;
    const wide = new Wide({ a: 1 as int32, b: 2 as int32, c: 3 as int32, d: 4 as int32,
      e: 5 as int32, f: 6 as int32, g: 7 as int32, h: 8 as int32 });
    return wide.left === 1 && wide.right === 8 && wide.total === 36;
  }
`;
