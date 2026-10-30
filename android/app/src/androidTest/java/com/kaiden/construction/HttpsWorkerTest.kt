package com.kaiden.construction
import android.content.Context
import android.graphics.Bitmap
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.testing.TestListenableWorkerBuilder
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.URL
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.util.UUID
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLException
import javax.net.ssl.TrustManagerFactory

@RunWith(AndroidJUnit4::class)
class HttpsWorkerTest {
    @Test fun realTlsRoomWorkerReceiptRecoveryAndRevision()=runBlocking {
        val root=InstrumentationRegistry.getArguments().getString("crsApiBase")?:""
        assumeTrue("Requires disposable CI HTTPS server",root.isNotBlank())
        val context:Context=ApplicationProvider.getApplicationContext()
        val db=AppDatabase.get(context);db.clearAllTables();val session=SecureSession(context);session.clear()
        val api=ApiClient(root)
        // Release code uses platform trust. An untrusted self-signed server MUST fail.
        try {api.login("foreman","SyntheticPassword123");fail("Self-signed certificate was accepted by default")}
        catch(_:SSLException){}
        val cert=InstrumentationRegistry.getInstrumentation().context.assets.open("ci-ca.pem").use {CertificateFactory.getInstance("X.509").generateCertificate(it)}
        val keys=KeyStore.getInstance(KeyStore.getDefaultType()).apply{load(null);setCertificateEntry("ci",cert)}
        val managers=TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).apply{init(keys)}
        val tls=SSLContext.getInstance("TLS").apply{init(null,managers.trustManagers,null)}
        val old=HttpsURLConnection.getDefaultSSLSocketFactory();HttpsURLConnection.setDefaultSSLSocketFactory(tls.socketFactory)
        val photo=File(context.filesDir,"https-test-${UUID.randomUUID()}.png")
        fun call(path:String,token:String,body:JSONObject?=null):String {
            val c=URL(root+path).openConnection() as HttpsURLConnection
            try {
                c.instanceFollowRedirects=false;c.connectTimeout=15_000;c.readTimeout=30_000;c.setRequestProperty("Authorization","Bearer $token")
                if(body!=null){c.requestMethod="POST";c.doOutput=true;c.setRequestProperty("Content-Type","application/json");c.outputStream.use{it.write(body.toString().toByteArray())}}
                assertEquals(200,c.responseCode);return c.inputStream.bufferedReader().use{it.readText()}
            }finally{c.disconnect()}
        }
        try {
            try {api.login("redirect","SyntheticPassword123");fail("Redirect followed")}catch(e:ApiException){assertEquals(302,e.status)}
            val token=api.login("foreman","SyntheticPassword123");val owner=api.me(token);val site=api.sites(token).single()
            session.save(token,owner,root)
            val pid=UUID.randomUUID().toString();val id=UUID.randomUUID().toString()
            val bitmap=Bitmap.createBitmap(2,2,Bitmap.Config.ARGB_8888)
            photo.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
            val draft=Draft(id=id,ownerId=owner,siteId=site.first,siteName=site.second,workDate="2026-10-26",kind="work",workEntriesJson="""[{"type":"Synthetic","quantity":"2.25","unit":"m"}]""",noWorkReason="",comment="",photosJson=JSONArray().put(JSONObject().put("id",pid).put("path",photo.absolutePath).put("mime","image/png")).toString(),extrasJson="""{"crew":"Synthetic crew","materials":[{"name":"Synthetic material","quantity":"1.5","unit":"m","direction":"consumed"}],"incidents":[{"description":"Synthetic incident"}],"financial_entries":[{"id":"${UUID.randomUUID()}","kind":"expense","operation_date":"2026-10-20","amount_kopecks":12550,"category":"Synthetic fuel","receipt_photo_id":"$pid"}],"equipment":[{"type":"Synthetic crane","hours":"7.5","hired":true}],"next_shift_plans":["Check access"]}""")
            db.drafts().save(draft)
            suspend fun worker(){TestListenableWorkerBuilder<SyncWorker>(context).build().doWork()}
            worker()
            var local=db.drafts().observeAll(owner).first().single()
            assertEquals("queued",local.status);assertNotNull(local.serverId)
            assertEquals("submitted",api.existingByClient(token,id).getString("status"))
            worker()
            local=db.drafts().observeAll(owner).first().single()
            assertEquals("delivered",local.status);val firstReceipt=local.receiptId;assertNotNull(firstReceipt)
            assertEquals(pid,api.existingByClient(token,id).getJSONObject("data").getJSONArray("financial_entries").getJSONObject(0).getString("receipt_photo_id"))
            var counters=JSONObject(call("/test/stats",token));assertEquals(1,counters.getInt("photo_put_count"));assertEquals(1,counters.getInt("submit_count"))
            val manager=api.login("manager","SyntheticPassword123")
            call("/reports/${local.serverId}/review",manager,JSONObject().put("expected_revision",1).put("decision","needs_revision").put("reason","Clarify synthetic comment"))
            db.drafts().save(local.copy(status="queued",comment="Corrected synthetic comment",editRequested=true,editReason="Clarify",serverRevision=1))
            worker();local=db.drafts().observeAll(owner).first().single()
            assertEquals("delivered",local.status);assertEquals(2,local.serverRevision);assertNotEquals(firstReceipt,local.receiptId)
            val summary=JSONObject(call("/analytics/summary",manager));assertEquals(1,summary.getInt("report_count"));assertEquals(local.serverId,summary.getJSONArray("source_report_ids").getString(0));assertEquals("2.25",summary.getJSONArray("volumes").getJSONObject(0).getString("quantity"))
            assertEquals(12550,summary.getJSONObject("financial_totals_kopecks").getInt("expense"))
            assertEquals("7.5",summary.getJSONArray("equipment_hours").getJSONObject(0).getString("hours"))
            assertEquals("consumed",summary.getJSONArray("material_movements").getJSONObject(0).getString("direction"))
            val history=JSONArray(call("/reports/${local.serverId}/history",manager))
            val receipts=(0 until history.length()).map{history.getJSONObject(it)}.filter{it.getString("event")=="submitted"}.map{it.getString("receipt_id")}
            assertEquals(listOf(firstReceipt,local.receiptId),receipts)
        }finally{HttpsURLConnection.setDefaultSSLSocketFactory(old);session.clear();db.clearAllTables();photo.delete()}
    }
}
