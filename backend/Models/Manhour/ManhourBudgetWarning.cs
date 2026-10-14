namespace ERPWEB.Models.Manhour
{
    // One row per job + scope in a batch whose approved manhour cost is above the budget (base currency).
    // Scope = "Job total" (the job's whole budget) or a manhour category code such as MH_MECH / MH_ELEC.
    public class ManhourBudgetWarning
    {
        public string  JobId       { get; set; } = string.Empty;
        public string  Scope       { get; set; } = string.Empty;
        public decimal Budget      { get; set; }
        public decimal ManhourCost { get; set; }
        public decimal OverBy      { get; set; }
    }
}
