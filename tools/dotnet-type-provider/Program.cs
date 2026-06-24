using System.Collections.Concurrent;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

var request = Request.Parse(args);
if ((!request.AllModules && (request.NamespaceName.Length == 0 || request.ModuleSpecifier.Length == 0)) ||
    (request.AllModules && request.ModuleSpecifierPrefix.Length == 0))
{
    Console.Error.WriteLine("Usage: dotnet-type-provider --namespace <namespace> --module-specifier <specifier> [--export <name>...] [--reference-dir <dir>] [--reference <assembly>]");
    Console.Error.WriteLine("   or: dotnet-type-provider --all-modules --module-specifier-prefix <prefix> [--reference-dir <dir>] [--reference <assembly>]");
    return 2;
}

try
{
    var provider = new ReflectionProvider(request);
    var output = request.AllModules ? provider.GetModules() : provider.GetModule();
    var options = new JsonSerializerOptions
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };
    Console.WriteLine(JsonSerializer.Serialize(output, options));
    return 0;
}
catch (Exception exception)
{
    Console.Error.WriteLine(exception.Message);
    return 1;
}
