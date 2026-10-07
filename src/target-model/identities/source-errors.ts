export const csharpSourceBaseErrorIdentity = Object.freeze({ name: "Error", baseException: true } as const);
export const csharpSourceErrorIdentities = Object.freeze([
  csharpSourceBaseErrorIdentity,
  Object.freeze({ name: "RangeError", baseException: false } as const),
  Object.freeze({ name: "TypeError", baseException: false } as const),
  Object.freeze({ name: "URIError", baseException: false } as const),
]);
export const csharpSourceErrorNames = Object.freeze(csharpSourceErrorIdentities.map(identity => identity.name));
export type CsharpSourceErrorName = typeof csharpSourceErrorNames[number];
