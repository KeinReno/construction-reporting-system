package com.kaiden.construction
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class ReportPayloadTest {
    private fun payload(quantity:String="2") = JSONObject("""{"client_report_id":"c","site_id":"s","work_date":"2026-10-25","kind":"work","work_entries":[{"type":"Test","quantity":"$quantity","unit":"m"}],"required_photo_ids":[]}""")
    @Test fun decimalAndDefaultFieldsMatchServer() {
        val remote=payload("2.000").put("comment",JSONObject.NULL).put("no_work_reason",JSONObject.NULL)
        remote.getJSONArray("work_entries").getJSONObject(0).put("description",JSONObject.NULL)
        assertTrue(ReportPayload.equivalent(payload(),remote))
    }
    @Test fun changedDocumentMustNeverAutoSubmit() {
        assertFalse(ReportPayload.equivalent(payload(),payload("3")))
        assertFalse(ReportPayload.equivalent(payload(),payload().put("site_id","other")))
        assertFalse(ReportPayload.equivalent(payload(),payload().put("comment","edited")))
    }
}
