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
    @Test fun extendedDataIsComparedAndDecimalIsNormalized() {
        val local=payload().put("crew","Crew").put("materials",org.json.JSONArray("""[{"name":"Steel","quantity":"2.50","unit":"m"}]"""))
        val remote=payload().put("crew","Crew").put("materials",org.json.JSONArray("""[{"name":"Steel","quantity":"2.5","unit":"m"}]"""))
        assertTrue(ReportPayload.equivalent(local,remote))
        assertFalse(ReportPayload.equivalent(payload(),remote))
        assertFalse(ReportPayload.equivalent(local,remote.put("crew","Another")))
        val mentioned=payload().put("materials",org.json.JSONArray("""[{"name":"Steel","quantity":"2.5","unit":"m"}]"""))
        val received=payload().put("materials",org.json.JSONArray("""[{"name":"Steel","quantity":"2.5","unit":"m","direction":"received"}]"""))
        assertFalse(ReportPayload.equivalent(mentioned,received))
    }
    @Test fun financeEquipmentAndPlansMustMatchBeforeAutoSubmit() {
        val finance="""[{"id":"entry","kind":"expense","operation_date":"2026-10-20","amount_kopecks":12550,"category":"Fuel"}]"""
        val local=payload().put("financial_entries",org.json.JSONArray(finance))
            .put("equipment",org.json.JSONArray("""[{"type":"Crane","hours":"7.50","hired":true}]"""))
            .put("next_shift_plans",org.json.JSONArray("""["Check site"]"""))
        val remote=payload().put("financial_entries",org.json.JSONArray(finance))
            .put("equipment",org.json.JSONArray("""[{"type":"Crane","hours":"7.5","hired":true}]"""))
            .put("next_shift_plans",org.json.JSONArray("""["Check site"]"""))
        assertTrue(ReportPayload.equivalent(local,remote))
        assertFalse(ReportPayload.equivalent(local,remote.put("next_shift_plans",org.json.JSONArray("""["Different"]"""))))
        assertFalse(ReportPayload.equivalent(payload(),local))
    }
}
