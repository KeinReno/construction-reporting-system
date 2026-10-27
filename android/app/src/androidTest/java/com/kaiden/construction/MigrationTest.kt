package com.kaiden.construction
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class MigrationTest {
    private val context:Context=ApplicationProvider.getApplicationContext()
    // These are the historical v1/v2 schemas, not a call to today's Room create-schema.
    private fun historical(version:Int)=runBlocking {
        val name="migration-${UUID.randomUUID()}.db"
        context.openOrCreateDatabase(name,Context.MODE_PRIVATE,null).use { old ->
            old.execSQL("CREATE TABLE drafts (id TEXT NOT NULL PRIMARY KEY,siteId TEXT NOT NULL,siteName TEXT NOT NULL,workDate TEXT NOT NULL,kind TEXT NOT NULL,workEntriesJson TEXT NOT NULL,noWorkReason TEXT NOT NULL,comment TEXT NOT NULL,photosJson TEXT NOT NULL,status TEXT NOT NULL,serverId TEXT,receiptId TEXT,lastError TEXT,createdAt INTEGER NOT NULL"+(if(version>=2) ",ownerId TEXT NOT NULL" else "")+(if(version>=3) ",serverRevision INTEGER NOT NULL,editRequested INTEGER NOT NULL,editReason TEXT NOT NULL,businessStatus TEXT" else "")+")")
            val columns="id,siteId,siteName,workDate,kind,workEntriesJson,noWorkReason,comment,photosJson,status,serverId,receiptId,lastError,createdAt"+(if(version>=2) ",ownerId" else "")+(if(version>=3) ",serverRevision,editRequested,editReason,businessStatus" else "")
            val values=mutableListOf<Any?>("old","site","Synthetic","2026-10-25","work","[]","","preserved","[{\"id\":\"photo\",\"path\":\"/private/photo\"}]","failed","server","receipt","network interrupted",123L)
            if(version>=2)values.add("A")
            if(version>=3)values.addAll(listOf(7,1,"Correction","needs_revision"))
            old.execSQL("INSERT INTO drafts ($columns) VALUES ("+values.joinToString(","){"?"}+")",values.toTypedArray())
            if(version>=4)old.execSQL("CREATE TABLE report_forms (ownerId TEXT NOT NULL PRIMARY KEY, sessionId TEXT NOT NULL, payload TEXT NOT NULL)")
            old.version=version
        }
        val db=AppDatabase.build(context,name)
        try {
            // Actual Room opening validates all columns after running production migrations.
            db.openHelper.writableDatabase
            val owner=if(version==1)"" else "A"
            db.drafts().retryFailed(owner)
            val row=db.drafts().pending(owner).single()
            assertEquals("old",row.id);assertEquals("receipt",row.receiptId);assertEquals("server",row.serverId)
            assertEquals(123L,row.createdAt);assertEquals("preserved",row.comment);assertTrue(row.photosJson.contains("/private/photo"))
            assertEquals("{}",row.extrasJson)
            assertEquals(if(version>=3)7 else 1,row.serverRevision);assertEquals(version>=3,row.editRequested)
            if(version>=3){assertEquals("Correction",row.editReason);assertEquals("needs_revision",row.businessStatus)}
            assertTrue(db.drafts().pending("B").isEmpty())
            if(version==1)assertTrue(db.drafts().pending("A").isEmpty())
            assertEquals("{}",FormRepository(db).open("A").payload)
        }finally{db.close();context.deleteDatabase(name)}
    }
    @Test fun v1ThroughV4PreservesUnownedLegacyData(){historical(1)}
    @Test fun v2ThroughV4PreservesKnownOwner(){historical(2)}
    @Test fun v3ThroughV4PreservesEditIntent(){historical(3)}
    @Test fun v4ThroughV5PreservesExistingQueue(){historical(4)}
}
