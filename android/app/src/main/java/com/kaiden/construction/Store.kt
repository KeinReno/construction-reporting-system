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
    @Query("SELECT * FROM drafts WHERE ownerId = :ownerId ORDER BY createdAt DESC")
    fun observeAll(ownerId: String): Flow<List<Draft>>
    @Query("SELECT * FROM drafts WHERE ownerId = :ownerId AND status IN ('queued','uploading') ORDER BY createdAt ASC")
    suspend fun pending(ownerId: String): List<Draft>
    @Query("UPDATE drafts SET status = 'queued', lastError = NULL WHERE ownerId = :ownerId AND status = 'failed'")
    suspend fun retryFailed(ownerId: String)
    @Insert(onConflict=OnConflictStrategy.REPLACE)
    suspend fun save(draft: Draft)
}

@Database(entities=[Draft::class], version=3, exportSchema=false)
abstract class AppDatabase: RoomDatabase() {
    abstract fun drafts(): DraftDao
    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null
        fun get(context: Context): AppDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(context.applicationContext,AppDatabase::class.java,"construction-local.db").addMigrations(object: Migration(1,2) {
                override fun migrate(db: SupportSQLiteDatabase) {
                    // Legacy drafts remain unowned; never claim them for whoever signs in next.
                    db.execSQL("ALTER TABLE drafts ADD COLUMN ownerId TEXT NOT NULL DEFAULT ''")
                }
            },object: Migration(2,3) {
                override fun migrate(db: SupportSQLiteDatabase) {
                    db.execSQL("ALTER TABLE drafts ADD COLUMN serverRevision INTEGER NOT NULL DEFAULT 1")
                    db.execSQL("ALTER TABLE drafts ADD COLUMN editRequested INTEGER NOT NULL DEFAULT 0")
                    db.execSQL("ALTER TABLE drafts ADD COLUMN editReason TEXT NOT NULL DEFAULT ''")
                    db.execSQL("ALTER TABLE drafts ADD COLUMN businessStatus TEXT")
                }
            }).build().also { INSTANCE=it }
        }
    }
}
