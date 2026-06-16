namespace ERPWEB.Models.User
{
    public class User
    {
        public int UserId { get; set; }

        public required string UserName { get; set; }
        public string? UserCode { get; set; }

        public required string PasswordHash { get; set; }

        // Plain-text password only used on create — never stored directly
        public string? Password { get; set; }

        public string? FullName { get; set; }

        public string? Email { get; set; }

        public string? Mobile { get; set; }

        public bool IsActive { get; set; }

        public bool IsLocked { get; set; }

        public DateTime CreatedDate { get; set; }

        public required string CreatedBy { get; set; }
        public string? ModifiedBy { get; set; }
        public DateTime ModifiedDate { get; set; }

        public int? CompanyId { get; set; }

        public int? BranchId { get; set; }
    }

    
}
