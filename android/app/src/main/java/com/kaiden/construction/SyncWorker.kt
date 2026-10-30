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
        val api=ApiClient.forSession(applicationContext,identity.endpoint)
        val token=identity.token
        val owner=identity.userId
        val dao=AppDatabase.get(applicationContext).drafts()
        val transport=object: ReportTransport {
            override fun existing(clientId:String)=api.existingByClient(token,clientId)
            override fun create(payload:JSONObject)=api.draft(token,payload)
            override fun edit(id:String,payload:JSONObject,revision:Int,reason:String)=api.edit(token,id,payload,revision,reason)
            override fun upload(id:String,photo:JSONObject)=api.upload(token,id,photo)
            override fun submit(id:String,revision:Int)=api.submit(token,id,revision)
        }
        val sync=ReportSync(transport) { dao.save(it) }
        var retry=false
        for(draft in dao.pending(owner)) {
            if(sync.sync(draft))retry=true
        }
        if(retry) Result.retry() else Result.success()
    }
    companion object {
        fun schedule(context:Context) {
            val constraints=Constraints.Builder().setRequiredNetworkType(if(BuildConfig.DEMO_MODE)NetworkType.NOT_REQUIRED else NetworkType.CONNECTED).build()
            val req=OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork("sync-construction-reports",ExistingWorkPolicy.APPEND_OR_REPLACE,req)
        }
    }
}
