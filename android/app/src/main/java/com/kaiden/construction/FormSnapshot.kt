package com.kaiden.construction
import org.json.JSONArray
import org.json.JSONObject

/** Raw input, including invalid dates and an entry not yet added to the report. Never an API DTO. */
data class FormSnapshot(
    val siteId:String="",val workDate:String=java.time.LocalDate.now().toString(),val kind:String="work",
    val workType:String="Сварка металлоконструкций",val quantity:String="",val unit:String="шт",val description:String="",
    val workEntriesJson:String="[]",val noWorkReason:String="",val comment:String="",val photosJson:String="[]",
    val editing:Draft?=null,val editReason:String="",
    val crew:String="",val materialName:String="",val materialQuantity:String="",val materialUnit:String="",val materialDirection:String="mentioned",
    val materialsJson:String="[]",val incidentText:String="",val incidentsJson:String="[]",
    val financeKind:String="expense",val financeAmount:String="",val financeCategory:String="",val financeDate:String="",val financeDescription:String="",val financialJson:String="[]",
    val equipmentType:String="",val equipmentHours:String="",val equipmentHired:Boolean=false,val equipmentJson:String="[]",
    val planText:String="",val plansJson:String="[]"
) {
    fun encode():String=JSONObject().apply {
        put("version",1);put("siteId",siteId);put("workDate",workDate);put("kind",kind);put("workType",workType)
        put("quantity",quantity);put("unit",unit);put("description",description)
        put("workEntries",JSONArray(workEntriesJson));put("noWorkReason",noWorkReason);put("comment",comment);put("photos",JSONArray(photosJson));put("editReason",editReason)
        put("crew",crew);put("materialName",materialName);put("materialQuantity",materialQuantity);put("materialUnit",materialUnit);put("materialDirection",materialDirection);put("materials",JSONArray(materialsJson));put("incidentText",incidentText);put("incidents",JSONArray(incidentsJson))
        put("financeKind",financeKind);put("financeAmount",financeAmount);put("financeCategory",financeCategory);put("financeDate",financeDate);put("financeDescription",financeDescription);put("financialEntries",JSONArray(financialJson))
        put("equipmentType",equipmentType);put("equipmentHours",equipmentHours);put("equipmentHired",equipmentHired);put("equipment",JSONArray(equipmentJson))
        put("planText",planText);put("nextShiftPlans",JSONArray(plansJson))
        editing?.let { d -> put("editing",JSONObject().apply {
            put("id",d.id);put("ownerId",d.ownerId);put("siteId",d.siteId);put("siteName",d.siteName);put("workDate",d.workDate);put("kind",d.kind)
            put("workEntriesJson",d.workEntriesJson);put("noWorkReason",d.noWorkReason);put("comment",d.comment);put("photosJson",d.photosJson)
            put("status",d.status);put("serverId",d.serverId);put("receiptId",d.receiptId);put("lastError",d.lastError);put("createdAt",d.createdAt)
            put("serverRevision",d.serverRevision);put("editRequested",d.editRequested);put("editReason",d.editReason);put("businessStatus",d.businessStatus)
            put("extrasJson",d.extrasJson)
        }) }
    }.toString()
    companion object {
        fun decode(payload:String,ownerId:String):FormSnapshot {
            val o=JSONObject(payload)
            require(o.optInt("version",1)==1) {"Unsupported saved form version"}
            val d=o.optJSONObject("editing")
            val editing=d?.let {
                require(it.getString("ownerId")==ownerId) {"Saved form owner mismatch"}
                Draft(id=it.getString("id"),ownerId=ownerId,siteId=it.getString("siteId"),siteName=it.getString("siteName"),workDate=it.getString("workDate"),kind=it.getString("kind"),
                    workEntriesJson=it.getString("workEntriesJson"),noWorkReason=it.getString("noWorkReason"),comment=it.getString("comment"),photosJson=it.getString("photosJson"),
                    status=it.getString("status"),serverId=it.nullable("serverId"),receiptId=it.nullable("receiptId"),lastError=it.nullable("lastError"),createdAt=it.getLong("createdAt"),
                    serverRevision=it.getInt("serverRevision"),editRequested=it.getBoolean("editRequested"),editReason=it.getString("editReason"),businessStatus=it.nullable("businessStatus"),extrasJson=it.optString("extrasJson","{}"))
            }
            return FormSnapshot(siteId=o.optString("siteId",""),workDate=o.optString("workDate",java.time.LocalDate.now().toString()),kind=o.optString("kind","work"),
                workType=o.optString("workType","Сварка металлоконструкций"),quantity=o.optString("quantity",""),unit=o.optString("unit","шт"),description=o.optString("description",""),
                workEntriesJson=(o.optJSONArray("workEntries")?:JSONArray()).toString(),noWorkReason=o.optString("noWorkReason",""),comment=o.optString("comment",""),photosJson=(o.optJSONArray("photos")?:JSONArray()).toString(),editing=editing,editReason=o.optString("editReason",""),
                crew=o.optString("crew",""),materialName=o.optString("materialName",""),materialQuantity=o.optString("materialQuantity",""),materialUnit=o.optString("materialUnit",""),materialDirection=o.optString("materialDirection","mentioned"),materialsJson=(o.optJSONArray("materials")?:JSONArray()).toString(),incidentText=o.optString("incidentText",""),incidentsJson=(o.optJSONArray("incidents")?:JSONArray()).toString(),
                financeKind=o.optString("financeKind","expense"),financeAmount=o.optString("financeAmount",""),financeCategory=o.optString("financeCategory",""),financeDate=o.optString("financeDate",""),financeDescription=o.optString("financeDescription",""),financialJson=(o.optJSONArray("financialEntries")?:JSONArray()).toString(),
                equipmentType=o.optString("equipmentType",""),equipmentHours=o.optString("equipmentHours",""),equipmentHired=o.optBoolean("equipmentHired",false),equipmentJson=(o.optJSONArray("equipment")?:JSONArray()).toString(),planText=o.optString("planText",""),plansJson=(o.optJSONArray("nextShiftPlans")?:JSONArray()).toString())
        }
        private fun JSONObject.nullable(key:String):String?=if(isNull(key))null else getString(key)
    }
}
