using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Data;



namespace ERPWEB.Dbcontext
{
    public class DbCon
    {
        private readonly string _connectionString;
        private SqlConnection _connection;
        private readonly string _schema;
        // The DI container finds the "DefaultConnection" from whichever JSON file is active
        public DbCon(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("DefaultConnection") ?? string.Empty;
            _connection = new SqlConnection(_connectionString);
            _schema = configuration["DbSchema"] ?? string.Empty;
        }





        // Add this to DbCon.cs
        public async Task<IEnumerable<T>> QueryAsync<T>(string spName, object? parameters = null)
        {
            using (IDbConnection db = new SqlConnection(_connectionString))
            {
                return await db.QueryAsync<T>(spName, parameters, commandType: CommandType.StoredProcedure);
            }
        }

        //public async Task<string> ExecuteScalarAsync(string spName, object parameters = null)
        //{
        //    using (IDbConnection db = new SqlConnection(_connectionString))
        //    {
        //        var result = await db.ExecuteScalarAsync(spName, parameters, commandType: CommandType.StoredProcedure);
        //        return result?.ToString() ?? "";
        //    }
        //}

        public async Task<T> QueryFirstAsync<T>(string spName, object? parameters = null)
        {
            using (IDbConnection db = new SqlConnection(_connectionString))
            {
                return await db.QueryFirstAsync<T>(spName, parameters, commandType: CommandType.StoredProcedure);
            }
        }

        public async Task<T?> QueryFirstOrDefaultAsync<T>(string spName, object? parameters = null)
        {
            using (IDbConnection db = new SqlConnection(_connectionString))
            {
                return await db.QueryFirstOrDefaultAsync<T>(spName, parameters, commandType: CommandType.StoredProcedure);
            }
        }

        /// <summary>
        /// Executes a stored procedure that returns multiple result sets.
        /// Returns a SqlMapper.GridReader whose connection is closed and returned to
        /// the pool when the reader is disposed — so callers MUST use `using`.
        /// </summary>
        /// <remarks>
        /// The connection is deliberately NOT opened here.
        ///
        /// Dapper only closes a connection it opened itself: it records whether the
        /// connection was closed when handed to it (`wasClosed`) and, on
        /// GridReader.Dispose(), calls Close() only in that case. This method used to
        /// call OpenAsync() first, so Dapper saw an already-open connection, treated it
        /// as caller-owned, and never closed it. Nothing else disposed it either — so
        /// every call through this overload leaked one pooled connection, even though
        /// all 22 call sites correctly use `using var`.
        ///
        /// That leak exhausted the 100-connection pool on SYNERPINDIA on 2026-09-09.
        /// Reads from SSMS still worked, so the database looked healthy, but every
        /// request — including the error logger — timed out waiting for a free
        /// connection, producing "Server error" with nothing written to TBL_APP_LOG.
        ///
        /// Leaving the connection closed lets Dapper open it, and disposing the
        /// GridReader now genuinely returns it to the pool. Do not add OpenAsync back.
        /// The typed overloads below are unaffected: they buffer their result sets
        /// inside a `using var db`, so they own and release the connection themselves.
        /// </remarks>
        public async Task<SqlMapper.GridReader> QueryMultipleAsync(string spName, object? parameters = null)
        {
            var db = new SqlConnection(_connectionString);
            return await db.QueryMultipleAsync(spName, parameters, commandType: CommandType.StoredProcedure);
        }

        /// <summary>
        /// Executes a stored procedure that returns exactly two result sets.
        /// Both sets are fully buffered before the connection is closed,
        /// so neither the connection nor the GridReader leaks.
        /// Preferred over the raw overload when the two result-set types are known up front.
        /// </summary>
        public async Task<(List<T1> First, List<T2> Second)> QueryMultipleAsync<T1, T2>(
            string spName, object? parameters = null)
        {
            using var db = new SqlConnection(_connectionString);
            await db.OpenAsync();
            using var multi = await db.QueryMultipleAsync(
                spName, parameters, commandType: CommandType.StoredProcedure);
            var first  = (await multi.ReadAsync<T1>()).ToList();
            var second = (await multi.ReadAsync<T2>()).ToList();
            return (first, second);
        }

        /// <summary>
        /// Executes a stored procedure that returns exactly four result sets.
        /// All sets are fully buffered before the connection is closed.
        /// </summary>
        public async Task<(List<T1>, List<T2>, List<T3>, List<T4>)> QueryMultipleAsync4<T1, T2, T3, T4>(
            string spName, object? parameters = null)
        {
            using var db = new SqlConnection(_connectionString);
            await db.OpenAsync();
            using var multi = await db.QueryMultipleAsync(
                spName, parameters, commandType: CommandType.StoredProcedure);
            var r1 = (await multi.ReadAsync<T1>()).ToList();
            var r2 = (await multi.ReadAsync<T2>()).ToList();
            var r3 = (await multi.ReadAsync<T3>()).ToList();
            var r4 = (await multi.ReadAsync<T4>()).ToList();
            return (r1, r2, r3, r4);
        }

        public async Task<string> ExecuteScalarAsync(string spName, object? parameters = null)
        {
            using (IDbConnection db = new SqlConnection(_connectionString))
            {
                // EXPLICITLY call the Dapper extension by casting 'db'
                // or by calling SqlMapper directly as the error suggested:
                var result = await SqlMapper.ExecuteScalarAsync<object>(
                    db,
                    spName,
                    parameters,
                    commandType: CommandType.StoredProcedure
                );
                var a = result;
                return result?.ToString() ?? "";
            }
        }

        public void Connect()
        {
            if (_connection.State != ConnectionState.Open)
                _connection.Open();
        }

        public void Disconnect()
        {
            if (_connection.State != ConnectionState.Closed)
                _connection.Close();
        }

        public void Dispose()
        {
            _connection?.Dispose();
        }
        public DataSet ExecuteProcedure(string procedureName)
        {
            DataSet ds = new DataSet();
            using (SqlConnection conn = new SqlConnection(_connectionString))
            using (SqlCommand cmd = new SqlCommand($"{_schema}.{procedureName}", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                SqlDataAdapter da = new SqlDataAdapter(cmd);
                da.Fill(ds);
            }
            return ds;
        }

        public DataSet ExecuteProcedure(string procedureName, Dictionary<string, object>? parameters = null)
        {
            DataSet ds = new DataSet();
            using (SqlConnection conn = new SqlConnection(_connectionString))
            using (SqlCommand cmd = new SqlCommand($"{_schema}.{procedureName}", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                if (parameters != null)
                    foreach (var param in parameters)
                        cmd.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value);
                SqlDataAdapter da = new SqlDataAdapter(cmd);
                da.Fill(ds);
            }
            return ds;
        }

        public object? GetSingleValue(string procedureName)
        {
            object? objValue = null;
            try
            {
                // 1. Must open the connection before calling ExecuteScalar
                this.Connect();

                using (SqlCommand cmd = new SqlCommand($"{_schema}.{procedureName}", _connection))
                {
                    cmd.CommandType = CommandType.StoredProcedure;

                    // 2. Execute
                    objValue = cmd.ExecuteScalar();
                }
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                // 3. Always close the connection, even if the query fails
                this.Disconnect();
            }

            return objValue;
        }


        public DataSet ExecuteProcedure(Dictionary<string, object> parameters, string procedureName)
        {
            DataSet dsData = new DataSet();
            using (SqlConnection conn = new SqlConnection(_connectionString))
            using (SqlCommand cmd = new SqlCommand($"{_schema}.{procedureName}", conn))
            {
                cmd.CommandType = CommandType.StoredProcedure;
                if (parameters != null)
                    foreach (var param in parameters)
                        cmd.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value);
                using (SqlDataAdapter da = new SqlDataAdapter(cmd))
                    da.Fill(dsData);
            }
            return dsData;
        }



        //public bool ExecuteSetProcedure(Dictionary<string, object> parameters, string storeProcedureName)
        //{
        //    try
        //    {
        //        // 1. Manually open the connection
        //        this.Connect();

        //        using (SqlCommand command = new SqlCommand(storeProcedureName, _connection))
        //        {
        //            command.CommandType = CommandType.StoredProcedure;
        //            command.Parameters.Clear();

        //            if (parameters != null)
        //            {
        //                foreach (var param in parameters)
        //                {
        //                    command.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value);
        //                }
        //            }

        //            // 2. Execute the Insert/Update/Delete
        //            command.ExecuteNonQuery();
        //        }

        //        // 3. Manually disconnect
        //        this.Disconnect();

        //        return true;
        //    }
        //    catch (Exception)
        //    {
        //        // Connection management in catch is important if not using 'using' for connection
        //        this.Disconnect();
        //        throw;
        //    }
        //}


        public string ExecuteSetProcedure(Dictionary<string, object> parameters, string procedureName)
        {
            object? result = null;
            try
            {
                // 1. Open the connection
                this.Connect();

                using (SqlCommand command = new SqlCommand($"{_schema}.{procedureName}", _connection))
                {
                    command.CommandType = CommandType.StoredProcedure;
                    command.Parameters.Clear();

                    if (parameters != null)
                    {
                        foreach (var param in parameters)
                        {
                            command.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value);
                        }
                    }

                    // 2. Use ExecuteScalar to capture the result of the SELECT in your SP
                    result = command.ExecuteScalar();
                }

                return result?.ToString() ?? "0";
            }
            catch (Exception)
            {
                throw;
            }
            finally
            {
                // 3. Ensuring Disconnect happens regardless of success or failure
                this.Disconnect();
            }
        }
        public Dictionary<string, object> ExecuteProcedure(
    Dictionary<string, object> inParameters,
    Dictionary<string, object> outParameters,
    string procedureName)
        {
            Dictionary<string, object> htOutput = new Dictionary<string, object>();

            try
            {

                this.Connect();

                using (SqlCommand command = new SqlCommand($"{_schema}.{procedureName}", _connection))
                {
                    command.CommandType = CommandType.StoredProcedure;
                    command.Parameters.Clear();

                    // 2. Load Input Parameters
                    if (inParameters != null)
                    {
                        foreach (var param in inParameters)
                        {
                            command.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value);
                        }
                    }

                    // 3. Load Output Parameters
                    if (outParameters != null)
                    {
                        foreach (var param in outParameters)
                        {
                            SqlParameter outSqlParam = command.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value);
                            outSqlParam.Direction = ParameterDirection.Output;

                            // Note: For strings/varchars, you may need to explicitly set 
                            // outSqlParam.Size if you encounter truncation errors.
                        }
                    }

                    // 4. Execute
                    command.ExecuteNonQuery();

                    // 5. Retrieve Output Values
                    if (outParameters != null)
                    {
                        foreach (var param in outParameters)
                        {
                            htOutput.Add(param.Key, command.Parameters[param.Key].Value);
                        }
                    }
                }

                this.Disconnect();

            }
            catch (Exception)
            {
                this.Disconnect();
                throw;
            }

            return htOutput;
        }

        public object? GetSingleValue(Dictionary<string, object> parameters, string procedureName)
        {
            object? objValue = null;

            try
            {
                this.Connect();

                using (SqlCommand command = new SqlCommand($"{_schema}.{procedureName}", _connection))
                {
                    command.CommandType = CommandType.StoredProcedure;
                    command.Parameters.Clear();

                    if (parameters != null)
                    {
                        foreach (var param in parameters)
                        {
                            command.Parameters.AddWithValue(param.Key, param.Value ?? DBNull.Value);
                        }
                    }

                    objValue = command.ExecuteScalar();
                }
            }
            catch (Exception)
            {
                throw; // The finally block will handle the Disconnect
            }
            finally
            {
                // This ensures the connection is closed even if an error occurs
                this.Disconnect();
            }

            return objValue;
        }

        /// <summary>
        /// Writes an exception log entry to TBL_APP_LOG via sp_WriteLog.
        /// Safe to call from any catch block — never throws.
        /// </summary>
        public async Task WriteLog(
            Exception ex,
            string? controller = null,
            string? action = null,
            string? requestPath = null,
            string? userId = null,
            string? ipAddress = null,
            string logLevel = "Error")
        {
            try
            {
                var parameters = new Dictionary<string, object>
                {
                    { "@LogLevel",       logLevel },
                    { "@Controller",     (object?)controller ?? DBNull.Value },
                    { "@Action",         (object?)action ?? DBNull.Value },
                    { "@Message",        ex.Message },
                    { "@StackTrace",     (object?)ex.StackTrace ?? DBNull.Value },
                    { "@InnerException", (object?)ex.InnerException?.Message ?? DBNull.Value },
                    { "@RequestPath",    (object?)requestPath ?? DBNull.Value },
                    { "@UserId",         (object?)userId ?? DBNull.Value },
                    { "@IpAddress",      (object?)ipAddress ?? DBNull.Value }
                };

                using (SqlConnection conn = new SqlConnection(_connectionString))
                using (SqlCommand cmd = new SqlCommand($"{_schema}.sp_WriteLog", conn))
                {
                    cmd.CommandType = CommandType.StoredProcedure;
                    foreach (var param in parameters)
                        cmd.Parameters.AddWithValue(param.Key, param.Value);

                    await conn.OpenAsync();
                    await cmd.ExecuteNonQueryAsync();
                }
            }
            catch
            {
                // Logging must never crash the application — silently swallow
            }
        }

        /// <summary>
        /// Writes a log entry from raw string fields (used for client / front-end
        /// errors posted from the browser). Safe to call — never throws.
        /// </summary>
        public async Task WriteRawLog(
            string? message,
            string? stackTrace     = null,
            string? controller     = null,
            string? action         = null,
            string? requestPath    = null,
            string? userId         = null,
            string? ipAddress      = null,
            string? innerException = null,
            string  logLevel       = "Error")
        {
            try
            {
                var parameters = new Dictionary<string, object>
                {
                    { "@LogLevel",       logLevel },
                    { "@Controller",     (object?)controller ?? DBNull.Value },
                    { "@Action",         (object?)action ?? DBNull.Value },
                    { "@Message",        (object?)message ?? "(no message)" },
                    { "@StackTrace",     (object?)stackTrace ?? DBNull.Value },
                    { "@InnerException", (object?)innerException ?? DBNull.Value },
                    { "@RequestPath",    (object?)requestPath ?? DBNull.Value },
                    { "@UserId",         (object?)userId ?? DBNull.Value },
                    { "@IpAddress",      (object?)ipAddress ?? DBNull.Value }
                };

                using (SqlConnection conn = new SqlConnection(_connectionString))
                using (SqlCommand cmd = new SqlCommand($"{_schema}.sp_WriteLog", conn))
                {
                    cmd.CommandType = CommandType.StoredProcedure;
                    foreach (var param in parameters)
                        cmd.Parameters.AddWithValue(param.Key, param.Value);

                    await conn.OpenAsync();
                    await cmd.ExecuteNonQueryAsync();
                }
            }
            catch
            {
                // Logging must never crash the application — silently swallow
            }
        }

    }
}




       
