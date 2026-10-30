package com.kaiden.construction
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReportSyncTest {
    private fun draft()=Draft(id="client",ownerId="owner",siteId="site",siteName="Test",workDate="2026-10-25",kind="work",
        workEntriesJson="""[{"type":"Test","quantity":"2","unit":"m"}]""",noWorkReason="",comment="",photosJson="""[{"id":"photo"}]""")
    private class Fake:ReportTransport {
        var server:JSONObject?=null
        var failUpload=true
        var losePatch=false
        var uploads=0
        override fun existing(clientId:String):JSONObject=server?:throw ApiException(404,"Not found")
        override fun create(payload:JSONObject):String {
            server=JSONObject().put("id","server").put("data",payload).put("revision",1).put("status","draft")
            return "server"
        }
        override fun edit(id:String,payload:JSONObject,revision:Int,reason:String):JSONObject {
            val s=server!!;check(revision==s.getInt("revision"))
            s.put("data",payload).put("revision",revision+1).put("status","draft")
            if(losePatch){losePatch=false;throw ApiException(503,"Lost PATCH response")}
            return s
        }
        override fun upload(id:String,photo:JSONObject) {uploads++;if(failUpload)throw ApiException(422,"Invalid photo")}
        override fun submit(id:String,revision:Int):JSONObject {
            val s=server!!;check(revision==s.getInt("revision"))
            return s.put("status","submitted").put("receipt_id","receipt-$revision")
        }
    }
    @Test fun preservesProgressAcrossRepeatedCorrections()=runBlocking {
        val api=Fake();var saved=draft();val sync=ReportSync(api){saved=it}
        assertFalse(sync.sync(saved))
        assertEquals("failed",saved.status);assertEquals("server",saved.serverId)
        saved=saved.copy(comment="First correction",editRequested=true,editReason="Fix",status="queued")
        assertFalse(sync.sync(saved))
        assertEquals(2,saved.serverRevision);assertEquals("failed",saved.status)
        saved=saved.copy(comment="Second correction",editRequested=true,editReason="Fix again",status="queued")
        api.failUpload=false
        assertFalse(sync.sync(saved))
        assertEquals(3,saved.serverRevision);assertEquals("delivered",saved.status);assertEquals("receipt-3",saved.receiptId)
    }
    @Test fun lostPatchResponseDoesNotApplyRevisionTwice()=runBlocking {
        val api=Fake();var saved=draft();val sync=ReportSync(api){saved=it}
        sync.sync(saved)
        saved=saved.copy(comment="Correction",editRequested=true,editReason="Fix",status="queued")
        api.losePatch=true;api.failUpload=false
        assertTrue(sync.sync(saved));assertEquals("queued",saved.status)
        assertFalse(sync.sync(saved));assertEquals(2,saved.serverRevision);assertEquals("delivered",saved.status)
    }
    @Test fun lostSubmitResponseRecoversWithoutUploadingAgain()=runBlocking {
        val api=Fake();var saved=draft();val sync=ReportSync(api){saved=it}
        sync.sync(saved)
        api.server!!.put("status","submitted").put("receipt_id","stored-receipt")
        val attempts=api.uploads
        assertFalse(sync.sync(saved));assertEquals(attempts,api.uploads);assertEquals("stored-receipt",saved.receiptId)
    }
    @Test fun changedServerDocumentNeverAutoSubmits()=runBlocking {
        val api=Fake();var saved=draft();val sync=ReportSync(api){saved=it}
        sync.sync(saved);api.server!!.getJSONObject("data").put("comment","Someone changed this")
        assertFalse(sync.sync(saved));assertEquals("failed",saved.status)
        assertEquals("draft",api.server!!.getString("status"));assertNull(saved.receiptId)
    }
}
