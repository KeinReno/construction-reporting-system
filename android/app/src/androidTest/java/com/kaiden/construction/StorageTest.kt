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
class StorageTest {
    private val context:Context=ApplicationProvider.getApplicationContext()
    private fun draft(owner:String="A",id:String="report")=Draft(id=id,ownerId=owner,siteId="site",siteName="Synthetic",workDate="2026-10-26",kind="work",workEntriesJson="""[{"type":"Synthetic","quantity":"2","unit":"m"}]""",noWorkReason="",comment="",photosJson="[]")
    private fun name()="test-${UUID.randomUUID()}.db"

    @Test fun partialFormSurvivesReopenAndNeverQueues()=runBlocking {
        val name=name();var db=AppDatabase.build(context,name)
        try {
            var repo=FormRepository(db);val first=repo.open("A")
            val snapshot=FormSnapshot(workDate="2026-1",quantity="1,",description="Unadded",photosJson="""[{"id":"photo","path":"/private/photo"}]""")
            assertTrue(repo.save(first.copy(payload=snapshot.encode())))
            assertTrue(db.drafts().pending("A").isEmpty())
            db.close();db=AppDatabase.build(context,name);repo=FormRepository(db)
            val restored=repo.open("A")
            assertEquals(first.sessionId,restored.sessionId)
            val input=FormSnapshot.decode(restored.payload,"A")
            assertEquals("2026-1",input.workDate);assertEquals("1,",input.quantity)
            assertEquals("/private/photo",org.json.JSONArray(input.photosJson).getJSONObject(0).getString("path"))
            assertTrue(db.drafts().pending("A").isEmpty())
        }finally{db.close();context.deleteDatabase(name)}
    }
    @Test fun enqueueConsumesFormAndLateAutosaveCannotResurrectIt()=runBlocking {
        val name=name();val db=AppDatabase.build(context,name)
        try {
            val repo=FormRepository(db);val first=repo.open("A")
            repo.enqueue(first,draft())
            assertNull(db.forms().get("A"));assertEquals(1,db.drafts().pending("A").size)
            assertFalse(repo.save(first.copy(payload="old content")))
            val next=repo.open("A");assertNotEquals(first.sessionId,next.sessionId)
            assertFalse(repo.save(first.copy(payload="late old content")))
            assertEquals("{}",db.forms().get("A")!!.payload)
            try {repo.enqueue(first,draft(id="duplicate"));fail("Stale form enqueued twice")}
            catch(_:IllegalStateException){}
            assertEquals(1,db.drafts().pending("A").size)
        }finally{db.close();context.deleteDatabase(name)}
    }
    @Test fun enqueueFailureRollsBackFormConsumption()=runBlocking {
        val name=name();val db=AppDatabase.build(context,name)
        try {
            val repo=FormRepository(db);val first=repo.open("A")
            repo.save(first.copy(payload=FormSnapshot(comment="Keep me").encode()))
            db.openHelper.writableDatabase.execSQL("CREATE TRIGGER reject_test BEFORE INSERT ON drafts BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END")
            try {repo.enqueue(first,draft());fail("Expected storage failure")}
            catch(_:android.database.sqlite.SQLiteException){}
            assertEquals("Keep me",FormSnapshot.decode(db.forms().get("A")!!.payload,"A").comment)
            assertTrue(db.drafts().pending("A").isEmpty())
        }finally{db.close();context.deleteDatabase(name)}
    }
    @Test fun ownersHaveIndependentFormsQueuesAndRetry()=runBlocking {
        val name=name();val db=AppDatabase.build(context,name)
        try {
            val repo=FormRepository(db);val a=repo.open("A");val b=repo.open("B")
            repo.save(a.copy(payload=FormSnapshot(comment="A only").encode()))
            repo.save(b.copy(payload=FormSnapshot(comment="B only").encode()))
            try {repo.enqueue(a,draft(owner="B"));fail("Owner mismatch accepted")}
            catch(_:IllegalArgumentException){}
            assertEquals("A only",FormSnapshot.decode(repo.open("A").payload,"A").comment)
            assertEquals("B only",FormSnapshot.decode(repo.open("B").payload,"B").comment)
            db.drafts().save(draft("A","a").copy(status="failed"));db.drafts().save(draft("B","b").copy(status="failed"))
            db.drafts().retryFailed("A")
            assertEquals(listOf("a"),db.drafts().pending("A").map{it.id})
            assertTrue(db.drafts().pending("B").isEmpty())
            assertNotNull(db.forms().get("A"));assertNotNull(db.forms().get("B"))
        }finally{db.close();context.deleteDatabase(name)}
    }
}
