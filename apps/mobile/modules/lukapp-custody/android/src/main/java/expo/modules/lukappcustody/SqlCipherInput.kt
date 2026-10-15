package expo.modules.lukappcustody

import net.zetetic.database.Logger
import net.zetetic.database.NoopTarget
import net.zetetic.database.sqlcipher.SQLiteDatabase
import org.json.JSONObject
import java.io.Closeable
import java.io.File

internal class SqlCipherInput(path: File, binding: String, key: ByteArray) : Closeable {
  private val password: ByteArray
  private val database: SQLiteDatabase

  init {
    require(key.size == 32) { "input_key_lost" }
    val digits = "0123456789abcdef".toByteArray(Charsets.US_ASCII)
    password = ByteArray(67)
    password[0] = 120; password[1] = 39; password[66] = 39
    key.forEachIndexed { index, byte ->
      password[2 + index * 2] = digits[(byte.toInt() and 255) shr 4]
      password[3 + index * 2] = digits[byte.toInt() and 15]
    }
    key.fill(0)
    System.loadLibrary("sqlcipher")
    Logger.setTarget(NoopTarget())
    try {
      database = SQLiteDatabase.openOrCreateDatabase(path, password, null,
        { _, _ -> error("encrypted_input_database_unavailable") }, null)
    } catch (_: Exception) { password.fill(0); error("encrypted_input_database_unavailable") }
    try {
      database.rawQuery("PRAGMA cipher_version", emptyArray<String>()).use {
        check(it.moveToFirst() && it.getString(0).isNotEmpty()) { "sqlcipher_required" }
      }
      database.execSQL("PRAGMA cipher_memory_security = ON")
      database.execSQL("PRAGMA temp_store = MEMORY")
      database.execSQL("PRAGMA secure_delete = ON")
      database.execSQL("PRAGMA journal_mode = DELETE")
      database.execSQL("PRAGMA synchronous = FULL")
      database.execSQL("CREATE TABLE IF NOT EXISTS custody_scope (id INTEGER PRIMARY KEY CHECK(id = 1), scope TEXT NOT NULL)")
      database.execSQL("CREATE TABLE IF NOT EXISTS input_records (id TEXT PRIMARY KEY NOT NULL, content TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL CHECK(expires_at >= created_at AND expires_at <= created_at + 1296000000))")
      database.execSQL("INSERT OR IGNORE INTO custody_scope (id, scope) VALUES (1, ?)", arrayOf(binding))
      database.rawQuery("SELECT scope FROM custody_scope WHERE id = 1", emptyArray<String>()).use {
        check(it.moveToFirst() && it.getString(0) == binding) { "input_scope_changed" }
      }
    } catch (_: Exception) { close(); error("encrypted_input_database_unavailable") }
  }

  fun read(): MutableList<JSONObject> {
    val records = mutableListOf<JSONObject>()
    database.rawQuery("SELECT id, content, created_at, expires_at FROM input_records ORDER BY rowid", emptyArray<String>()).use {
      while (it.moveToNext()) records.add(JSONObject().put("id", it.getString(0))
        .put("content", if (it.isNull(1)) JSONObject.NULL else it.getString(1))
        .put("createdAt", it.getLong(2)).put("expiresAt", it.getLong(3)))
    }
    return records
  }

  fun save(records: List<JSONObject>, importing: Boolean = false) {
    database.beginTransaction()
    try {
      if (!importing) database.execSQL("DELETE FROM input_records")
      val sql = if (importing) "INSERT OR IGNORE INTO input_records (id, content, created_at, expires_at) VALUES (?, ?, ?, ?)"
        else "INSERT INTO input_records (id, content, created_at, expires_at) VALUES (?, ?, ?, ?)"
      for (record in records) database.execSQL(sql, arrayOf(record.getString("id"),
        if (record.isNull("content")) null else record.getString("content"), record.getLong("createdAt"), record.getLong("expiresAt")))
      database.setTransactionSuccessful()
    } finally { database.endTransaction() }
  }

  override fun close() { try { database.close() } finally { password.fill(0) } }
}
