package com.kaiden.construction
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.CancellationException

interface ReportTransport {
    fun existing(clientId:String):JSONObject
    fun create(payload:JSONObject):String
    fun edit(id:String,payload:JSONObject,revision:Int,reason:String):JSONObject
    fun upload(id:String,photo:JSONObject)
    fun submit(id:String,revision:Int):JSONObject
}
/** UI-independent delivery state machine. Return true only for a retryable failure. */
class ReportSync(private val transport:ReportTransport,private val save:suspend (Draft)->Unit) {
    suspend fun sync(draft:Draft):Boolean {
            var progress=draft.copy(status="uploading",lastError=null)
            try {
                save(progress)
                val payload=JSONObject().apply {
                    put("client_report_id",draft.id)
                    put("site_id",draft.siteId)
                    put("work_date",draft.workDate)
                    put("kind",draft.kind)
                    if(draft.kind=="no_work") put("no_work_reason",draft.noWorkReason)
                    put("work_entries",JSONArray(draft.workEntriesJson))
                    put("comment",draft.comment)
                    val photos=JSONArray(draft.photosJson)
                    put("required_photo_ids",JSONArray((0 until photos.length()).map{photos.getJSONObject(it).getString("id")}))
                }
                // Always reconcile with the stable client UUID before uploading photos.
                // A lost submit response can already have committed a valid receipt.
                var server=try { transport.existing(draft.id) }
                    catch(e:ApiException) {
                        if(e.status!=404) throw e
                        transport.create(payload)
                        transport.existing(draft.id)
                    }
                val serverId=server.getString("id")
                progress=progress.copy(serverId=serverId)
                save(progress)
                if(draft.editRequested && server.getString("status") in listOf("draft","needs_revision") && server.getInt("revision")==draft.serverRevision && (server.getString("status")=="needs_revision" || !ReportPayload.equivalent(payload,server.getJSONObject("data")))) {
                    server=transport.edit(serverId,payload,draft.serverRevision,draft.editReason)
                    progress=progress.copy(serverRevision=server.getInt("revision"),editRequested=false,businessStatus=server.getString("status"))
                    save(progress)
                }
                if(!ReportPayload.equivalent(payload,server.getJSONObject("data")))throw ApiException(409,"Содержимое сервера отличается. Нужна проверка отчёта")
                progress=progress.copy(serverRevision=server.getInt("revision"),businessStatus=server.getString("status"))
                save(progress)
                if(server.optString("receipt_id").let { it.isNotEmpty() && it!="null" } &&
                    server.getString("status") in listOf("submitted","reviewed")) {
                    save(progress.copy(status="delivered",serverId=serverId,receiptId=server.getString("receipt_id"),lastError=null,serverRevision=server.getInt("revision"),businessStatus=server.getString("status"),editRequested=false))
                    return false
                }
                if(server.getString("status")!="draft") throw ApiException(409,"Отчёт возвращён на уточнение; нужна новая ревизия")
                save(progress.copy(status="uploading",serverId=serverId))
                val photos=JSONArray(draft.photosJson)
                for(i in 0 until photos.length()) transport.upload(serverId,photos.getJSONObject(i))
                val receipt=transport.submit(serverId,server.getInt("revision")).getString("receipt_id")
                save(progress.copy(status="delivered",serverId=serverId,receiptId=receipt,lastError=null,serverRevision=server.getInt("revision"),businessStatus="submitted",editRequested=false))
            } catch(e:CancellationException) { throw e
            } catch (e:Exception) {
                val permanent=(e is ApiException && !SyncPolicy.retryable(e.status)) || e is IllegalArgumentException || e is java.io.FileNotFoundException
                save(progress.copy(status=if(permanent) "failed" else "queued",lastError=e.message?.take(200)))
                return !permanent
            }
        return false
    }
}
