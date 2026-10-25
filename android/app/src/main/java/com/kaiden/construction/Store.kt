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
    val createdAt: Long = System.currentTimeMillis()
)

@Dao
interface DraftDao {
    @Query("SELECT * FROM drafts ORDER BY createdAt DESC")
    fun observeAll(): Flow<List<Draft>>
    @Query("SELECT * FROM drafts WHERE status != 'delivered' ORDER BY createdAt ASC")
    suspend fun pending(): List<Draft>
    @Insert(onConflict=OnConflictStrategy.REPLACE)
    suspend fun save(draft: Draft)
}

@Database(entities=[Draft::class], version=1, exportSchema=false)
abstract class AppDatabase: RoomDatabase() {
    abstract fun drafts(): DraftDao
    companion object {
        @Volatile private var INSTANCE: AppDatabase? = null
        fun get(context: Context): AppDatabase = INSTANCE ?: synchronized(this) {
            INSTANCE ?: Room.databaseBuilder(context.applicationContext,AppDatabase::class.java,"construction-local.db").build().also { INSTANCE=it }
        }
    }
}
