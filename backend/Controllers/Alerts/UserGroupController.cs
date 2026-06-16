using ERPWEB.Dbcontext;
using ERPWEB.Models.Alerts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Alerts
{
    [Authorize]
    [Route("api/[Controller]")]
    [ApiController]
    public class UserGroupController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public UserGroupController(DbCon dbcon) => _dbcon = dbcon;

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] int? groupId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<UserGroupRow>("sp_GetUserGroups",
                    new { GroupId = groupId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "UserGroup", "GetAll", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpGet("{groupId}/members")]
        public async Task<IActionResult> GetMembers(int groupId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<UserGroupMemberRow>("sp_GetUserGroupMembers",
                    new { GroupId = groupId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "UserGroup", "GetMembers", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveUserGroupRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.GroupName))
                return BadRequest(new { message = "Group name is required." });
            try
            {
                var parameters = new Dictionary<string, object>
                {
                    { "@GroupId",      model.GroupId },
                    { "@GroupName",    model.GroupName.Trim() },
                    { "@Description",  (object?)model.Description ?? DBNull.Value },
                    { "@IsActive",     model.IsActive },
                    { "@ActionBy",     model.ActionBy }
                };
                string result = _dbcon.ExecuteSetProcedure(parameters, "sp_SaveUserGroup");
                if (result == "-1")
                    return BadRequest(new { message = "A group with this name already exists." });
                string action = model.GroupId == 0 ? "added" : "updated";
                return Ok(new { id = result, message = $"Group {action} successfully." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "UserGroup", "Save", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpDelete("{groupId}")]
        public async Task<IActionResult> Delete(int groupId)
        {
            try
            {
                string result = _dbcon.ExecuteSetProcedure(
                    new Dictionary<string, object> { { "@GroupId", groupId } },
                    "sp_DeleteUserGroup");
                return result switch
                {
                    "Deleted"    => Ok(new { message = "Group deleted successfully." }),
                    "InUse"      => BadRequest(new { message = "Cannot delete a group that is assigned to active alerts." }),
                    "NotExists"  => NotFound(new { message = "Group not found." }),
                    _            => BadRequest(new { message = "Failed to delete group." })
                };
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "UserGroup", "Delete", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpPost("member/add")]
        public async Task<IActionResult> AddMember([FromBody] SaveUserGroupMemberRequest model)
        {
            try
            {
                var parameters = new Dictionary<string, object>
                {
                    { "@GroupId",  model.GroupId },
                    { "@UserId",   model.UserId },
                    { "@AddedBy",  model.AddedBy }
                };
                _dbcon.ExecuteSetProcedure(parameters, "sp_SaveUserGroupMember");
                return Ok(new { message = "Member added successfully." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "UserGroup", "AddMember", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpDelete("member/{detailId}")]
        public async Task<IActionResult> RemoveMember(int detailId)
        {
            try
            {
                _dbcon.ExecuteSetProcedure(
                    new Dictionary<string, object> { { "@DetailId", detailId } },
                    "sp_DeleteUserGroupMember");
                return Ok(new { message = "Member removed successfully." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "UserGroup", "RemoveMember", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }
    }
}
