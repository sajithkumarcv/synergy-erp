namespace ERPWEB.Models.Customer
{
    /// <summary>
    /// Result of sp_CheckCustomerCreditStatus — used to enforce credit hold
    /// (and, in future, credit-limit / overdue) before transacting with a customer.
    /// </summary>
    public class CustomerCreditStatus
    {
        public int      CustomerId        { get; set; }
        public string?  CustomerName      { get; set; }
        public bool     CreditHold        { get; set; }
        public bool     IsAutoHold        { get; set; }
        public string?  CreditHoldNote    { get; set; }
        public decimal  CreditLimit       { get; set; }
        public int      CreditDays        { get; set; }
        public string?  CreditFlag        { get; set; }
        public decimal  OutstandingBalance { get; set; }
        public int      MaxOverdueDays    { get; set; }
        public bool     LimitBreached     { get; set; }
        public bool     DaysBreached      { get; set; }
        public int      CanTransact       { get; set; }   // 1 = ok, 0 = blocked
        public string?  StatusMessage     { get; set; }
    }
}
