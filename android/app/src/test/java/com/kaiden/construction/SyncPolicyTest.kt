package com.kaiden.construction
import org.junit.Assert.*
import org.junit.Test
class SyncPolicyTest {
    @Test fun temporaryFailuresRetry() {
        for(status in listOf(408,429,500,502,503))assertTrue(SyncPolicy.retryable(status))
    }
    @Test fun rejectedDocumentsNeedUserAction() {
        for(status in listOf(400,401,403,404,409,413,422))assertFalse(SyncPolicy.retryable(status))
    }
}
