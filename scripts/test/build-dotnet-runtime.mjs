import { prepareNativeRuntime } from "../../test/helpers/dotnet-runtime.mjs";

const prepared = prepareNativeRuntime();
console.log(`Native C# runtime ready: ${prepared.proofProject}`);
