export const csharpSourceErrorNames = Object.freeze(["Error", "RangeError", "TypeError", "URIError"] as const);
export type CsharpSourceErrorName = typeof csharpSourceErrorNames[number];
