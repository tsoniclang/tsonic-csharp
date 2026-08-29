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

    public void Replace(ref Func<Payload?, object, string> callback)
    {
    }
}

public static class GenericCallbackHost
{
    public static void Plain<T>(Func<T, string> callback)
    {
    }

    public static void Nullable<T>(Func<T?, string> callback)
    {
    }

    public static void NullableValueCallback(Action<int>? callback)
    {
    }
}

public static class ObjectInputHost
{
    public static void NonNullableObject(object value)
    {
    }

    public static void NullableObject(object? value)
    {
    }

    public static void NonNullableObjects(params object[] values)
    {
    }

    public static void NullableObjects(params object?[]? values)
    {
    }
}
