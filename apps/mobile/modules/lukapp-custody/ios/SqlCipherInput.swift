import Foundation
import ExpoSQLite

struct InputRecord: Codable {
  let id: String
  let content: String?
  let createdAt: Double
  let expiresAt: Double
}

private struct InputDatabaseFailure: Error, LocalizedError {
  var errorDescription: String? { "encrypted_input_database_unavailable" }
}

final class SqlCipherInput {
  private var database: OpaquePointer?
  private let transient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

  init(path: URL, binding: String, key: inout Data) throws {
    guard key.count == 32, exsqlite3_open_v2(path.path, &database, SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX, nil) == SQLITE_OK else {
      if database != nil { exsqlite3_close(database); database = nil }
      throw InputDatabaseFailure()
    }
    do {
      var password = Data("x'".utf8)
      let digits = Array("0123456789abcdef".utf8)
      password.append(contentsOf: key.flatMap { [digits[Int($0 >> 4)], digits[Int($0 & 15)]] })
      password.append(39)
      defer { password.resetBytes(in: 0..<password.count); key.resetBytes(in: 0..<key.count) }
      let status = password.withUnsafeBytes { exsqlite3_key(database, $0.baseAddress, Int32(password.count)) }
      guard status == SQLITE_OK else { throw InputDatabaseFailure() }
      let version = try prepare("PRAGMA cipher_version")
      defer { exsqlite3_finalize(version) }
      guard exsqlite3_step(version) == SQLITE_ROW, exsqlite3_column_bytes(version, 0) > 0 else { throw InputDatabaseFailure() }
      try execute("PRAGMA cipher_memory_security = ON; PRAGMA temp_store = MEMORY; PRAGMA secure_delete = ON; PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL; CREATE TABLE IF NOT EXISTS custody_scope (id INTEGER PRIMARY KEY CHECK(id = 1), scope TEXT NOT NULL); CREATE TABLE IF NOT EXISTS input_records (id TEXT PRIMARY KEY NOT NULL, content TEXT, created_at REAL NOT NULL, expires_at REAL NOT NULL CHECK(expires_at >= created_at AND expires_at <= created_at + 1296000));")
      let insert = try prepare("INSERT OR IGNORE INTO custody_scope (id, scope) VALUES (1, ?)")
      defer { exsqlite3_finalize(insert) }
      guard binding.withCString({ exsqlite3_bind_text(insert, 1, $0, -1, transient) }) == SQLITE_OK,
        exsqlite3_step(insert) == SQLITE_DONE else { throw InputDatabaseFailure() }
      let scope = try prepare("SELECT scope FROM custody_scope WHERE id = 1")
      defer { exsqlite3_finalize(scope) }
      guard exsqlite3_step(scope) == SQLITE_ROW, let value = exsqlite3_column_text(scope, 0),
        String(cString: value) == binding else { throw InputDatabaseFailure() }
    } catch {
      exsqlite3_close(database); database = nil; throw InputDatabaseFailure()
    }
  }

  deinit { if database != nil { exsqlite3_close(database) } }

  func read() throws -> [InputRecord] {
    let statement = try prepare("SELECT id, content, created_at, expires_at FROM input_records ORDER BY rowid")
    defer { exsqlite3_finalize(statement) }
    var records: [InputRecord] = []
    var status = exsqlite3_step(statement)
    while status == SQLITE_ROW {
      guard let id = exsqlite3_column_text(statement, 0) else { throw InputDatabaseFailure() }
      let content = exsqlite3_column_text(statement, 1).map { String(cString: $0) }
      records.append(InputRecord(id: String(cString: id), content: content,
        createdAt: exsqlite3_column_double(statement, 2), expiresAt: exsqlite3_column_double(statement, 3)))
      status = exsqlite3_step(statement)
    }
    guard status == SQLITE_DONE else { throw InputDatabaseFailure() }
    return records
  }

  func save(_ records: [InputRecord], importing: Bool = false) throws {
    try execute("BEGIN IMMEDIATE")
    do {
      if !importing { try execute("DELETE FROM input_records") }
      let statement = try prepare(importing
        ? "INSERT OR IGNORE INTO input_records (id, content, created_at, expires_at) VALUES (?, ?, ?, ?)"
        : "INSERT INTO input_records (id, content, created_at, expires_at) VALUES (?, ?, ?, ?)")
      defer { exsqlite3_finalize(statement) }
      for record in records {
        guard record.createdAt.isFinite, record.expiresAt.isFinite else { throw InputDatabaseFailure() }
        guard record.id.withCString({ exsqlite3_bind_text(statement, 1, $0, -1, transient) }) == SQLITE_OK else { throw InputDatabaseFailure() }
        let contentStatus = record.content.map { content in content.withCString { exsqlite3_bind_text(statement, 2, $0, -1, transient) } } ?? exsqlite3_bind_null(statement, 2)
        guard contentStatus == SQLITE_OK,
          exsqlite3_bind_double(statement, 3, record.createdAt) == SQLITE_OK,
          exsqlite3_bind_double(statement, 4, record.expiresAt) == SQLITE_OK,
          exsqlite3_step(statement) == SQLITE_DONE else { throw InputDatabaseFailure() }
        exsqlite3_reset(statement); exsqlite3_clear_bindings(statement)
      }
      try execute("COMMIT")
    } catch { try? execute("ROLLBACK"); throw InputDatabaseFailure() }
  }

  private func prepare(_ sql: String) throws -> OpaquePointer {
    var statement: OpaquePointer?
    guard exsqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK, let statement else { throw InputDatabaseFailure() }
    return statement
  }
  private func execute(_ sql: String) throws {
    guard exsqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else { throw InputDatabaseFailure() }
  }
}
