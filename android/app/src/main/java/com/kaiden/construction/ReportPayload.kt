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
        for(key in listOf("crew","incidents")) {
            if(!data.isNull(key))put(key,data.get(key))
        }
        if(!data.isNull("materials")) {
            val materials=data.getJSONArray("materials")
            put("materials",JSONArray((0 until materials.length()).map { i ->
                val m=materials.getJSONObject(i)
                JSONObject().put("name",m.getString("name")).put("unit",nullable(m,"unit"))
                    .put("quantity",if(m.isNull("quantity"))JSONObject.NULL else m.getString("quantity").toBigDecimal().stripTrailingZeros().toPlainString())
            }))
        }
        if(!data.isNull("financial_entries")) {
            val entries=data.getJSONArray("financial_entries")
            put("financial_entries",JSONArray((0 until entries.length()).map { i ->
                val e=entries.getJSONObject(i)
                JSONObject().put("id",e.getString("id")).put("kind",e.getString("kind"))
                    .put("operation_date",e.getString("operation_date")).put("amount_kopecks",e.getLong("amount_kopecks"))
                    .put("category",e.getString("category")).put("description",nullable(e,"description"))
                    .put("receipt_photo_id",nullable(e,"receipt_photo_id"))
            }))
        }
        if(!data.isNull("equipment")) {
            val entries=data.getJSONArray("equipment")
            put("equipment",JSONArray((0 until entries.length()).map { i ->
                val e=entries.getJSONObject(i)
                JSONObject().put("type",e.getString("type")).put("hired",e.optBoolean("hired",false))
                    .put("hours",e.getString("hours").toBigDecimal().stripTrailingZeros().toPlainString())
            }))
        }
        if(!data.isNull("next_shift_plans"))put("next_shift_plans",data.getJSONArray("next_shift_plans"))
    }
    private fun same(a:Any?,b:Any?):Boolean = when {
        a is JSONObject && b is JSONObject -> {
            val keys=a.keys().asSequence().toSet()
            keys==b.keys().asSequence().toSet() && keys.all{same(a.get(it),b.get(it))}
        }
        a is JSONArray && b is JSONArray -> a.length()==b.length() && (0 until a.length()).all{same(a.get(it),b.get(it))}
        else -> a==b
    }
    fun equivalent(local:JSONObject,remote:JSONObject):Boolean = same(normalized(local),normalized(remote))
}
