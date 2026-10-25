package com.kaiden.construction
import org.json.JSONArray
import org.json.JSONObject

/** Normalize optional defaults and Decimal spelling, never accept another document silently. */
object ReportPayload {
    private fun nullable(o:JSONObject,key:String):Any = if(o.isNull(key)) JSONObject.NULL else o.get(key)
    private fun normalized(data:JSONObject):JSONObject = JSONObject().apply {
        for(key in listOf("client_report_id","site_id","work_date","kind"))put(key,data.get(key))
        for(key in listOf("no_work_reason","comment"))put(key,nullable(data,key))
        val work=data.getJSONArray("work_entries")
        put("work_entries",JSONArray((0 until work.length()).map { i ->
            val w=work.getJSONObject(i)
            JSONObject().apply {
                put("type",w.getString("type"));put("unit",nullable(w,"unit"));put("description",nullable(w,"description"))
                put("quantity",if(w.isNull("quantity"))JSONObject.NULL else w.getString("quantity").toBigDecimal().stripTrailingZeros().toPlainString())
            }
        }))
        val ids=data.optJSONArray("required_photo_ids")?:JSONArray()
        put("required_photo_ids",JSONArray((0 until ids.length()).map{ids.getString(it)}.sorted()))
    }
    fun equivalent(local:JSONObject,remote:JSONObject):Boolean = normalized(local).similar(normalized(remote))
}
