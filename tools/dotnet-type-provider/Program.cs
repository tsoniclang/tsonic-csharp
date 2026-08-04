using System.Collections.Concurrent;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.Loader;
using System.Text.Json;
using System.Text.Json.Serialization;

if (args.Length > 0 && args[0] == "--server")
{
    return RunServer(args.Skip(1).ToArray());
}

return RunProvider(args, Console.Out, Console.Error);

static int RunProvider(string[] args, TextWriter stdout, TextWriter stderr)
{
    try
    {
        var request = Request.Parse(args);
        if ((!request.AllModules && (request.NamespaceName.Length == 0 || request.ModuleSpecifier.Length == 0)) ||
            (request.AllModules && request.ModuleSpecifierPrefix.Length == 0))
        {
            WriteUsage(stderr);
            return 2;
        }
        using var provider = new ReflectionProvider(request);
        var output = request.AllModules ? provider.GetModules() : provider.GetModule();
        stdout.WriteLine(JsonSerializer.Serialize(output, ProviderJsonOptions()));
        return 0;
    }
    catch (Exception exception)
    {
        stderr.WriteLine(exception.Message);
        return 1;
    }
}

static int RunServer(string[] args)
{
    var options = WorkerOptions.Parse(args);
    if (options.RequestsDir.Length == 0 || options.ResponsesDir.Length == 0 || options.ReadyFile.Length == 0)
    {
        Console.Error.WriteLine("Usage: dotnet-type-provider --server --requests-dir <dir> --responses-dir <dir> --ready-file <file> --owner-pid <pid>");
        return 2;
    }

    Directory.CreateDirectory(options.RequestsDir);
    Directory.CreateDirectory(options.ResponsesDir);
    WriteJsonAtomic(options.ReadyFile, new
    {
        processId = Environment.ProcessId,
    });

    while (IsOwnerAlive(options.OwnerPid))
    {
        foreach (var requestPath in Directory.EnumerateFiles(options.RequestsDir, "*.json").OrderBy(path => path, StringComparer.Ordinal))
        {
            var requestId = Path.GetFileNameWithoutExtension(requestPath);
            var responsePath = Path.Combine(options.ResponsesDir, $"{requestId}.json");
            if (File.Exists(responsePath))
            {
                continue;
            }
            WriteJsonAtomic(responsePath, HandleWorkerRequest(requestPath, requestId));
        }
        Thread.Sleep(10);
    }

    return 0;
}

static object HandleWorkerRequest(string requestPath, string requestId)
{
    try
    {
        var requestJson = File.ReadAllText(requestPath);
        var request = JsonSerializer.Deserialize<WorkerRequest>(requestJson, WorkerJsonOptions());
        if (request is null)
        {
            return WorkerResponse(requestId, 1, "", "Worker request JSON was empty.");
        }
        if (!StringComparer.Ordinal.Equals(request.Id, requestId))
        {
            return WorkerResponse(requestId, 1, "", $"Worker request id '{request.Id}' did not match file id '{requestId}'.");
        }

        using var stdout = new StringWriter();
        using var stderr = new StringWriter();
        var status = RunProvider(request.Args, stdout, stderr);
        return WorkerResponse(request.Id, status, stdout.ToString(), stderr.ToString());
    }
    catch (Exception exception)
    {
        return WorkerResponse(requestId, 1, "", exception.Message);
    }
}

static object WorkerResponse(string id, int status, string stdout, string stderr)
{
    return new
    {
        id,
        status,
        stdout,
        stderr,
    };
}

static void WriteUsage(TextWriter stderr)
{
    stderr.WriteLine("Usage: dotnet-type-provider --namespace <namespace> --module-specifier <specifier> [--export <name>...] [--target-id <id>...] [--metadata-name <name>...] [--complete-all-exports | --complete-export <name>... | --complete-export-id <id>...] [--reference-dir <dir>] [--reference <assembly>] [--assembly-name <name>]");
    stderr.WriteLine("   or: dotnet-type-provider --all-modules --module-specifier-prefix <prefix> [--reference-dir <dir>] [--reference <assembly>]");
}

static JsonSerializerOptions ProviderJsonOptions()
{
    return new JsonSerializerOptions
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = false,
    };
}

static JsonSerializerOptions WorkerJsonOptions()
{
    return new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false,
    };
}

static void WriteJsonAtomic(string path, object value)
{
    var directory = Path.GetDirectoryName(path);
    if (directory is not null)
    {
        Directory.CreateDirectory(directory);
    }
    var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";
    File.WriteAllText(temporaryPath, JsonSerializer.Serialize(value, WorkerJsonOptions()));
    File.Move(temporaryPath, path, true);
}

static bool IsOwnerAlive(int? ownerPid)
{
    if (ownerPid is null)
    {
        return true;
    }
    try
    {
        return !Process.GetProcessById(ownerPid.Value).HasExited;
    }
    catch
    {
        return false;
    }
}

sealed record WorkerRequest(string Id, string[] Args);

sealed record WorkerOptions(string RequestsDir, string ResponsesDir, string ReadyFile, int? OwnerPid)
{
    public static WorkerOptions Parse(string[] args)
    {
        var requestsDir = "";
        var responsesDir = "";
        var readyFile = "";
        int? ownerPid = null;
        for (var index = 0; index < args.Length; index++)
        {
            var arg = args[index];
            switch (arg)
            {
                case "--requests-dir":
                    requestsDir = RequiredValue(args, ref index, arg);
                    break;
                case "--responses-dir":
                    responsesDir = RequiredValue(args, ref index, arg);
                    break;
                case "--ready-file":
                    readyFile = RequiredValue(args, ref index, arg);
                    break;
                case "--owner-pid":
                    ownerPid = int.Parse(RequiredValue(args, ref index, arg));
                    break;
                default:
                    throw new InvalidOperationException($"Unknown server argument '{arg}'.");
            }
        }
        return new WorkerOptions(requestsDir, responsesDir, readyFile, ownerPid);
    }

    static string RequiredValue(string[] args, ref int index, string name)
    {
        if (index + 1 >= args.Length)
        {
            throw new InvalidOperationException($"Argument '{name}' requires a value.");
        }
        index++;
        return args[index];
    }
}
