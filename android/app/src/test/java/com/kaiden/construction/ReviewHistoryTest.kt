package com.kaiden.construction
import org.json.JSONArray
import org.junit.Assert.*
import org.junit.Test

class ReviewHistoryTest {
    @Test fun onlyCurrentRevisionReturnReasonIsUsed() {
        val history=JSONArray("""[{"event":"needs_revision","revision":1,"reason":"old"},{"event":"needs_revision","revision":2,"reason":"correct current reason"},{"event":"edited","revision":2,"reason":"author edit explanation"}]""")
        assertEquals("correct current reason",reviewReason(history,2))
        assertNull(reviewReason(history,3))
    }
    @Test fun missingReasonIsNotInvented() {
        assertNull(reviewReason(JSONArray(),1))
        assertNull(reviewReason(JSONArray("""[{"event":"needs_revision","revision":1,"reason":null}]"""),1))
    }
}
