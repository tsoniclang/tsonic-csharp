export const defaultCsharpTargetFramework = "net10.0";

export function parseCsharpTargetFramework(value: string): {
  readonly major: number;
  readonly minor: number;
  readonly runtimeVersion: string;
} {
  const match = /^net([1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[a-z][a-z0-9]*(?:\.[0-9]+)*)?$/u.exec(value);
  const major = Number(match?.[1]);
  const minor = Number(match?.[2]);
  if (match === null || !Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || major < 10) {
    throw new Error(`C# target framework '${value}' must be a .NET 10-or-later framework, such as 'net10.0' or 'net11.0'.`);
  }
  return Object.freeze({ major, minor, runtimeVersion: `${major}.${minor}` });
}
