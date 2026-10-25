package com.kaiden.construction

/** Transport failures may retry; rejected documents need explicit user action. */
object SyncPolicy {
    fun retryable(status:Int):Boolean = status == 408 || status == 429 || status >= 500
}
