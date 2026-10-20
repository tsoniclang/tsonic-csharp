import type { CsharpPositionalArgumentsInput } from "../model/call-arguments.js";

export function csharpPositionalArgumentsAreRepresentable(input: CsharpPositionalArgumentsInput): boolean {
  let previous = -1;
  for (const index of input.indexes) {
    if (index < previous || index > previous + 1 || index === previous && input.parameters[index]?.paramsArray !== true) return false;
    previous = index;
  }
  return true;
}
