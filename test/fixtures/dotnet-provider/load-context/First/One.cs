namespace Acme.First;

public sealed class One
{
}

public record RecordValue(int Value);

public class Family
{
}

public class Family<TValue>
{
    public TValue Echo(TValue value) => value;
}

public class Family<TFirst, TSecond>
{
    public TFirst First(TFirst value) => value;

    public TSecond Second(TSecond value) => value;
}
