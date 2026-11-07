// Source call evidence for C# call records is the Host call selection (selections.call) plus the per-use
// instantiation (instantiations.at); no checker call resolution reaches target records (I1, I2).
export type CsharpSourceCallParameterReadDomain = "declared" | "callable";
