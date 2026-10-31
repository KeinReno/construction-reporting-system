package com.kaiden.construction

/** Transport failures may retry; rejected documents need explicit user action. */
object SyncPolicy {
    fun retryable(status:Int):Boolean = status == 408 || status == 429 || status >= 500

    /** 401 means session expired - should re-queue, not mark as permanent failure */
    fun isSessionExpired(status:Int):Boolean = status == 401
}
