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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SyncWorker(context:Context,params:WorkerParameters): CoroutineWorker(context,params) {
    override suspend fun doWork():Result = withContext(Dispatchers.IO) {
        val token=SecureSession(applicationContext).get() ?: return@withContext Result.retry()
        val dao=AppDatabase.get(applicationContext).drafts()
        var retry=false
        for(draft in dao.pending()) {
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
                val serverId=draft.serverId ?: try { ApiClient.draft(token,payload) }
                    catch (e:Exception) {
                        // Lost response after accepted POST: fetch by stable client id.
                        try { ApiClient.existingByClient(token,draft.id).getString("id") } catch(_:Exception) { throw e }
                    }
                dao.save(draft.copy(status="uploading",serverId=serverId))
                val photos=JSONArray(draft.photosJson)
                for(i in 0 until photos.length()) ApiClient.upload(token,serverId,photos.getJSONObject(i))
                val receipt=ApiClient.submit(token,serverId).getString("receipt_id")
                dao.save(draft.copy(status="delivered",serverId=serverId,receiptId=receipt,lastError=null))
            } catch (e:Exception) {
                dao.save(draft.copy(status="queued",lastError=e.message?.take(200)))
                retry=true
            }
        }
        if(retry) Result.retry() else Result.success()
    }
    companion object {
        fun schedule(context:Context) {
            val constraints=Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
            val req=OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync-construction-reports",ExistingWorkPolicy.KEEP,req)
        }
    }
}
