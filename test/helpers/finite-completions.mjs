export const finiteCompletionsSource = `
import type { int32 } from "@tsonic/core/types.js";
export type Completion = int32 | Promise<int32>;
export type IgnoredCompletion = int32 | Promise<int32> | Promise<void> | undefined;
export type OptionalCompletion = int32 | Promise<int32 | undefined> | undefined;
export async function completed(value: Completion): Promise<int32> {
  return await value;
}
export async function discard(value: IgnoredCompletion): Promise<void> {
  await value;
}
export async function optional(value: OptionalCompletion): Promise<int32 | undefined> {
  return await value;
}
export function retain(callback: () => Promise<int32>): () => Completion {
  return callback;
}
`;
