package com.kaiden.construction

import android.content.Context
import android.util.AtomicFile
import androidx.room.withTransaction
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/** Local-only simulation compiled behind DEMO_MODE; never a network trust exception. */
class DemoBackend(private val context:Context) {
    private val file=AtomicFile(File(context.filesDir,"demo-server.json"))
    companion object {
        const val ENDPOINT="https://demo.invalid/api/v1"
        const val OWNER="00000000-0000-4000-8000-000000000001"
        const val TOKEN="demo-local-token"
        private val lock=Any()
        suspend fun prepare(context:Context) {
            check(BuildConfig.DEMO_MODE)
            val backend=DemoBackend(context);val state=backend.state()
            val prefs=context.getSharedPreferences("demo-seed",Context.MODE_PRIVATE)
            if(!prefs.getBoolean("seeded",false)) {
                val db=AppDatabase.get(context)
                db.withTransaction {
                    // The transaction may have committed before the preference marker was saved.
                    // Never replay fixture inserts over existing drafts or queued user reports.
                    if(db.drafts().countAll()!=0)return@withTransaction
                    val rows=state.getJSONArray("reports")
                    for(i in 0 until rows.length()) {
                        val r=rows.getJSONObject(i);val d=r.getJSONObject("data")
                        val photoId=d.getJSONArray("required_photo_ids").getString(0)
                        val local=File(context.filesDir,"demo-photo-$photoId.png")
                        context.assets.open("demo/report-${i+1}.png").use{input->local.outputStream().use{input.copyTo(it)}}
                        val extras=JSONObject();for(key in listOf("crew","materials","incidents","financial_entries","equipment","next_shift_plans"))if(d.has(key))extras.put(key,d.get(key))
                        db.drafts().save(Draft(id=d.getString("client_report_id"),ownerId=OWNER,siteId=d.getString("site_id"),siteName=state.getJSONArray("sites").getJSONObject(if(i==5)1 else 0).getString("name"),workDate=d.getString("work_date"),kind=d.getString("kind"),workEntriesJson=d.getJSONArray("work_entries").toString(),noWorkReason=d.optString("no_work_reason",""),comment=d.getString("comment"),photosJson=JSONArray().put(JSONObject().put("id",photoId).put("path",local.absolutePath).put("mime","image/png")).toString(),status="delivered",serverId=r.getString("id"),receiptId=r.getString("receipt_id"),businessStatus=r.getString("status"),createdAt=1000L+i,extrasJson=extras.toString()))
                    }
                }
                prefs.edit().putBoolean("seeded",true).commit()
            }
            SecureSession(context).save(TOKEN,OWNER,ENDPOINT)
        }
    }
    private fun write(state:JSONObject) {
        val stream=file.startWrite()
        try {stream.write(state.toString().toByteArray());file.finishWrite(stream)}catch(e:Exception){file.failWrite(stream);throw e}
    }
    fun state():JSONObject=synchronized(lock) {
        check(BuildConfig.DEMO_MODE)
        if(file.baseFile.exists())return@synchronized JSONObject(file.openRead().bufferedReader().use{it.readText()})
        val fixture=JSONObject(context.assets.open("demo/reports.json").bufferedReader().use{it.readText()})
        val sites=JSONArray();for(i in 0 until fixture.getJSONArray("sites").length())sites.put(JSONObject().put("id","00000000-0000-4000-8000-00000000001${i}").put("name",fixture.getJSONArray("sites").getString(i)))
        val rows=JSONArray();val src=fixture.getJSONArray("reports")
        for(i in 0 until src.length()) {
            val sample=src.getJSONObject(i)
            val data=JSONObject().put("client_report_id",UUID.randomUUID().toString()).put("site_id",sites.getJSONObject(sample.getInt("site")).getString("id")).put("work_date",sample.getString("date")).put("kind",sample.getString("kind")).put("work_entries",sample.getJSONArray("entries")).put("comment",sample.getString("comment")).put("required_photo_ids",JSONArray().put(UUID.randomUUID().toString()))
            if(sample.has("reason"))data.put("no_work_reason",sample.getString("reason"))
            for(key in listOf("crew","materials","incidents","financial_entries","equipment","next_shift_plans"))if(sample.has(key))data.put(key,sample.get(key))
            rows.put(JSONObject().put("id",UUID.randomUUID().toString()).put("data",data).put("status",sample.getString("status")).put("revision",1).put("receipt_id",UUID.randomUUID().toString()))
        }
        JSONObject().put("sites",sites).put("reports",rows).also{write(it)}
    }
    fun sites():List<Pair<String,String>> {val a=state().getJSONArray("sites");return (0 until a.length()).map{a.getJSONObject(it).getString("id") to a.getJSONObject(it).getString("name")}}
    fun request(path:String,method:String,token:String?,body:ByteArray?):JSONObject=synchronized(lock) {
        if(path=="/auth/login")return@synchronized JSONObject().put("access_token",TOKEN)
        if(token!=TOKEN)throw ApiException(401,"Демо: войдите заново")
        if(path=="/me")return@synchronized JSONObject().put("id",OWNER)
        if(path=="/auth/logout")return@synchronized JSONObject().put("ok",true)
        val state=state();val rows=state.getJSONArray("reports")
        val payload=if(body!=null && method!="PUT")JSONObject(String(body)) else null
        if(path=="/reports" && method=="POST") {
            val data=payload!!;val existing=(0 until rows.length()).map{rows.getJSONObject(it)}.find{it.getJSONObject("data").getString("client_report_id")==data.getString("client_report_id")}
            if(existing!=null)return@synchronized existing
            val row=JSONObject().put("id",UUID.randomUUID().toString()).put("data",data).put("revision",1).put("status","draft").put("receipt_id",JSONObject.NULL)
            rows.put(row);write(state);return@synchronized row
        }
        val row=if(path.startsWith("/reports/by-client/")) (0 until rows.length()).map{rows.getJSONObject(it)}.find{it.getJSONObject("data").getString("client_report_id")==path.substringAfterLast('/')} else (0 until rows.length()).map{rows.getJSONObject(it)}.find{it.getString("id")==path.split('/').getOrNull(2)}
        row?:throw ApiException(404,"Демо: отчёт не найден")
        if(method=="GET")return@synchronized row
        if(method=="PUT" && path.contains("/attachments/"))return@synchronized JSONObject().put("ok",true)
        if(payload?.getInt("expected_revision")!=row.getInt("revision"))throw ApiException(409,"Демо: ревизия изменилась")
        if(method=="PATCH") {
            if(row.getString("status") !in listOf("draft","needs_revision"))throw ApiException(409,"Демо: отчёт нельзя изменять")
            row.put("data",payload!!.getJSONObject("data")).put("revision",row.getInt("revision")+1).put("status","draft").put("receipt_id",JSONObject.NULL)
        }else if(path.endsWith("/submit")) {
            if(row.getString("status")=="draft")row.put("status","submitted").put("receipt_id",UUID.randomUUID().toString())
            if(row.getString("status") !in listOf("submitted","reviewed"))throw ApiException(409,"Демо: нужно исправление")
        }else throw ApiException(404,"Демо: операция не поддерживается")
        write(state);row
    }
}
