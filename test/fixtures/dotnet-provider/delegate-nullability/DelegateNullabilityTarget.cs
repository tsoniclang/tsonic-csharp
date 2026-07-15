namespace ProviderDelegateNullabilityFixtures;

public sealed class Payload
{
}

public delegate string HeaderSelector<TContext>(string headerName, TContext context);

public sealed class CallbackHost
{
    public Func<Payload, object?, string> Callback { get; } = (_, _) => "value";

    public void Register(Func<Payload, object?, string> callback)
    {
    }

    public void RegisterNullable(Func<Payload?, object, string> callback)
    {
    }

    public Func<Payload, object?, string> Create()
    {
        return (_, _) => "value";
    }
}
