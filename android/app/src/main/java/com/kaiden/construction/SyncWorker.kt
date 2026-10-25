package com.kaiden.construction

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.BackoffPolicy
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SyncWorker(context:Context,params:WorkerParameters): CoroutineWorker(context,params) {
    override suspend fun doWork():Result = withContext(Dispatchers.IO) {
        val session=SecureSession(applicationContext)
        val identity=session.snapshot() ?: return@withContext Result.success()
        val token=identity.token
        val owner=identity.userId
        val dao=AppDatabase.get(applicationContext).drafts()
        var retry=false
        for(draft in dao.pending(owner)) {
            try {
                dao.save(draft.copy(status="uploading",lastError=null))
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
                var server=try { ApiClient.existingByClient(token,draft.id) }
                    catch(e:ApiException) {
                        if(e.status!=404) throw e
                        ApiClient.draft(token,payload)
                        ApiClient.existingByClient(token,draft.id)
                    }
                val serverId=server.getString("id")
                if(draft.editRequested && server.getString("status") in listOf("draft","needs_revision") && server.getInt("revision")==draft.serverRevision && (server.getString("status")=="needs_revision" || !ReportPayload.equivalent(payload,server.getJSONObject("data")))) {
                    server=ApiClient.edit(token,serverId,payload,draft.serverRevision,draft.editReason)
                }
                if(!ReportPayload.equivalent(payload,server.getJSONObject("data")))throw ApiException(409,"Содержимое сервера отличается. Нужна проверка отчёта")
                if(server.optString("receipt_id").let { it.isNotEmpty() && it!="null" } &&
                    server.getString("status") in listOf("submitted","reviewed")) {
                    dao.save(draft.copy(status="delivered",serverId=serverId,receiptId=server.getString("receipt_id"),lastError=null,serverRevision=server.getInt("revision"),businessStatus=server.getString("status"),editRequested=false))
                    continue
                }
                if(server.getString("status")!="draft") throw ApiException(409,"Отчёт возвращён на уточнение; нужна новая ревизия")
                dao.save(draft.copy(status="uploading",serverId=serverId))
                val photos=JSONArray(draft.photosJson)
                for(i in 0 until photos.length()) ApiClient.upload(token,serverId,photos.getJSONObject(i))
                val receipt=ApiClient.submit(token,serverId,server.getInt("revision")).getString("receipt_id")
                dao.save(draft.copy(status="delivered",serverId=serverId,receiptId=receipt,lastError=null,serverRevision=server.getInt("revision"),businessStatus="submitted",editRequested=false))
            } catch(e:CancellationException) { throw e
            } catch (e:Exception) {
                val permanent=e is ApiException && !SyncPolicy.retryable(e.status)
                dao.save(draft.copy(status=if(permanent) "failed" else "queued",lastError=e.message?.take(200)))
                if(!permanent) retry=true
            }
        }
        if(retry) Result.retry() else Result.success()
    }
    companion object {
        fun schedule(context:Context) {
            val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val req=OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync-construction-reports",ExistingWorkPolicy.APPEND_OR_REPLACE,req)
        }
    }
}
