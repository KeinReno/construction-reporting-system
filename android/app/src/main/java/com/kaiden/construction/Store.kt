package com.kaiden.construction

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.withTransaction
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName="drafts")
data class Draft(
    @PrimaryKey val id: String,
    val siteId: String,
    val siteName: String,
    val workDate: String,
    val kind: String,
    val workEntriesJson: String,
    val noWorkReason: String,
    val comment: String,
    val photosJson: String,
    val status: String = "queued",
    val serverId: String? = null,
    val receiptId: String? = null,
    val lastError: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val ownerId: String = "",
    val serverRevision: Int = 1,
    val editRequested: Boolean = false,
    val editReason: String = "",
    val businessStatus: String? = null
)

@Dao
interface DraftDao {
    @Query("SELECT COUNT(*) FROM drafts")
    suspend fun countAll():Int
    @Query("SELECT * FROM drafts WHERE ownerId = :ownerId ORDER BY createdAt DESC")
    fun observeAll(ownerId: String): Flow<List<Draft>>
    @Query("SELECT * FROM drafts WHERE ownerId = :ownerId AND status IN ('queued','uploading') ORDER BY createdAt ASC")
    suspend fun pending(ownerId: String): List<Draft>
    @Query("UPDATE drafts SET status = 'queued', lastError = NULL WHERE ownerId = :ownerId AND status = 'failed'")
    suspend fun retryFailed(ownerId: String)
    @Insert(onConflict=OnConflictStrategy.REPLACE)
    suspend fun save(draft: Draft)
}

/** Partial input is intentionally separate from queued, API-valid reports. */
@Entity(tableName="report_forms")
data class FormRecord(@PrimaryKey val ownerId:String,val sessionId:String,val payload:String)

@Dao
interface FormDao {
    @Query("SELECT COUNT(*) FROM report_forms")
    suspend fun countAll():Int
    @Query("SELECT * FROM report_forms WHERE ownerId = :ownerId")
    suspend fun get(ownerId:String):FormRecord?
    @Insert(onConflict=OnConflictStrategy.ABORT)
    suspend fun insert(record:FormRecord)
    @Query("UPDATE report_forms SET payload = :payload WHERE ownerId = :ownerId AND sessionId = :sessionId")
    suspend fun persist(ownerId:String,sessionId:String,payload:String):Int
    @Query("DELETE FROM report_forms WHERE ownerId = :ownerId AND sessionId = :sessionId")
    suspend fun consume(ownerId:String,sessionId:String):Int
}

@Database(entities=[Draft::class,FormRecord::class], version=4, exportSchema=false)
abstract class AppDatabase: RoomDatabase() {
    abstract fun drafts(): DraftDao
    abstract fun forms(): FormDao
    companion object {
        val MIGRATION_1_2=object:Migration(1,2) {
            override fun migrate(db:SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE drafts ADD COLUMN ownerId TEXT NOT NULL DEFAULT ''")
            }
        }
        val MIGRATION_2_3=object:Migration(2,3) {
            override fun migrate(db:SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE drafts ADD COLUMN serverRevision INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE drafts ADD COLUMN editRequested INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE drafts ADD COLUMN editReason TEXT NOT NULL DEFAULT ''")
                db.execSQL("ALTER TABLE drafts ADD COLUMN businessStatus TEXT")
            }
        }
        val MIGRATION_3_4=object:Migration(3,4) {
            override fun migrate(db:SupportSQLiteDatabase) {
                db.execSQL("CREATE TABLE IF NOT EXISTS report_forms (ownerId TEXT NOT NULL PRIMARY KEY, sessionId TEXT NOT NULL, payload TEXT NOT NULL)")
            }
        }
        fun build(context:Context,name:String):AppDatabase =
            Room.databaseBuilder(context.applicationContext,AppDatabase::class.java,name)
                .addMigrations(MIGRATION_1_2,MIGRATION_2_3,MIGRATION_3_4).build()
        @Volatile private var INSTANCE:AppDatabase?=null
        fun get(context:Context):AppDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: build(context,"construction-local.db").also {INSTANCE=it}
        }
    }
}

/** Session IDs make late autosaves harmless after an atomic enqueue+consume. */
class FormRepository(private val database:AppDatabase) {
    suspend fun open(ownerId:String):FormRecord=database.withTransaction {
        require(ownerId.isNotBlank()) {"Owner required"}
        database.forms().get(ownerId) ?: FormRecord(ownerId,java.util.UUID.randomUUID().toString(),"{}").also {database.forms().insert(it)}
    }
    suspend fun save(record:FormRecord):Boolean = database.forms().persist(record.ownerId,record.sessionId,record.payload)==1
    suspend fun enqueue(record:FormRecord,draft:Draft)=database.withTransaction {
        require(record.ownerId==draft.ownerId && draft.ownerId.isNotBlank()) {"Owner mismatch"}
        check(database.forms().consume(record.ownerId,record.sessionId)==1) {"Form already submitted or replaced"}
        database.drafts().save(draft)
    }
}
