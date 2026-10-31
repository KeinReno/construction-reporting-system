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
        var existingFailure:Exception?=null
        var uploadFailure:Exception?=null
        override fun existing(clientId:String):JSONObject {
            existingFailure?.let {throw it}
            return server?:throw ApiException(404,"Not found")
        }
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
        override fun upload(id:String,photo:JSONObject) {uploads++;uploadFailure?.let{throw it};if(failUpload)throw ApiException(422,"Invalid photo")}
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
    @Test fun expiredSessionPausesWithoutLosingPayloadAndResumesSameUuid()=runBlocking {
        val api=Fake();var saved=draft();val original=saved;var expired=0
        api.existingFailure=ApiException(401,"Сессия завершилась. Войдите снова")
        val sync=ReportSync(api,onSessionExpired={expired++}){saved=it}
        assertFalse(sync.sync(saved));assertEquals(1,expired);assertEquals("queued",saved.status)
        assertEquals(original.id,saved.id);assertEquals(original.ownerId,saved.ownerId)
        assertEquals(original.photosJson,saved.photosJson);assertEquals(original.workEntriesJson,saved.workEntriesJson)
        api.existingFailure=null;api.failUpload=false
        assertFalse(sync.sync(saved));assertEquals("delivered",saved.status);assertEquals(original.id,saved.id)
        assertEquals(1,expired)
    }
    @Test fun networkExceptionRequestsRetryInsteadOfStrandingQueue()=runBlocking {
        val api=Fake();var saved=draft();val sync=ReportSync(api){saved=it}
        api.uploadFailure=java.io.IOException("network interrupted")
        assertTrue(sync.sync(saved));assertEquals("queued",saved.status)
        api.uploadFailure=null;api.failUpload=false
        assertFalse(sync.sync(saved));assertEquals("delivered",saved.status)
    }
    @Test fun returnedReportWithReasonStillAppliesCorrectionAndGetsNewReceipt()=runBlocking {
        val api=Fake();var saved=draft();val sync=ReportSync(api){saved=it}
        api.failUpload=false;sync.sync(saved)
        api.server!!.put("status","needs_revision")
        saved=saved.copy(comment="Corrected",status="queued",editRequested=true,editReason="Correction",businessStatus="needs_revision",reviewReason="Clarify")
        assertFalse(sync.sync(saved));assertEquals("delivered",saved.status);assertEquals(2,saved.serverRevision)
        assertEquals("Corrected",api.server!!.getJSONObject("data").getString("comment"))
        assertEquals("receipt-2",saved.receiptId);assertNull(saved.reviewReason);assertFalse(saved.editRequested)
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
