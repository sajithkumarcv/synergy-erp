namespace ERPWEB.Models.Customer
{
    /// <summary>
    /// Payload for POST api/Customer/credithold
    /// </summary>
    public class CreditHoldRequest
    {
        public int    CustomerId     { get; set; }
        public bool   CreditHold     { get; set; }       // true = place hold, false = release
        public string CreditHoldBy   { get; set; } = string.Empty;
        public string? CreditHoldNote { get; set; }
    }
}
