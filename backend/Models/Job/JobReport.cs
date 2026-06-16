namespace ERPWEB.Models.Job
{
    public class JobReportPo
    {
        public int       PoId          { get; set; }
        public string    PoNumber      { get; set; } = string.Empty;
        public DateTime  PoDate        { get; set; }
        public string    Status        { get; set; } = string.Empty;
        public string?   SupplierName  { get; set; }
        public decimal?  TotalAmount   { get; set; }
        public string?   CurrencyShort { get; set; }
    }

    public class JobReportInvoice
    {
        public int       InvoiceId     { get; set; }
        public string    InvoiceNo     { get; set; } = string.Empty;
        public DateTime  InvoiceDate   { get; set; }
        public string    Status        { get; set; } = string.Empty;
        public decimal?  TotalAmount   { get; set; }
        public string?   CurrencyShort { get; set; }
    }

    public class JobReportResponse
    {
        public Job                  Header      { get; set; } = new();
        public JobBudgetHeader      BudgetMeta  { get; set; } = new();
        public List<JobBudgetLine>  BudgetLines { get; set; } = new();
        public List<JobReportPo>    Pos         { get; set; } = new();
        public List<JobReportInvoice> Invoices  { get; set; } = new();
    }
}
