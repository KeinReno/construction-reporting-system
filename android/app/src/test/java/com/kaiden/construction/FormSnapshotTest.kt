package com.kaiden.construction
import org.junit.Assert.*
import org.junit.Test
class FormSnapshotTest {
    @Test fun rawPartialInputAndEditIdentityRoundTrip() {
        val editing=Draft(id="report",ownerId="owner-A",siteId="site",siteName="Synthetic",workDate="2026-10-26",kind="no_work",workEntriesJson="[]",noWorkReason="No access",comment="",photosJson="[]",status="failed",serverId="server",serverRevision=7,editRequested=true,editReason="Clarify",businessStatus="needs_revision")
        val form=FormSnapshot(siteId="site",workDate="2026-1",quantity="1,",description="Unadded work",comment="Draft",photosJson="""[{"id":"photo","path":"/private/local-photo","mime":"image/png"}]""",editing=editing,editReason="Correction",materialDirection="received")
        val restored=FormSnapshot.decode(form.encode(),"owner-A")
        assertEquals(form.copy(photosJson=restored.photosJson),restored)
        assertEquals("/private/local-photo",org.json.JSONArray(restored.photosJson).getJSONObject(0).getString("path"))
    }
    @Test fun anotherOwnerCannotRestoreEditSnapshot() {
        val d=Draft(id="r",ownerId="A",siteId="s",siteName="Synthetic",workDate="2026-10-26",kind="work",workEntriesJson="[]",noWorkReason="",comment="",photosJson="[]")
        try {FormSnapshot.decode(FormSnapshot(editing=d).encode(),"B");fail("Expected owner rejection")}
        catch(_:IllegalArgumentException){}
    }
    @Test fun unfinishedFinanceEquipmentAndPlansSurviveProcessRestart() {
        val form=FormSnapshot(financeKind="advance_issued",financeAmount="1250,50",financeCategory="Crew",financeDate="2026-10-20",financeDescription="Synthetic",
            financialJson="""[{"id":"entry","kind":"expense","operation_date":"2026-10-19","amount_kopecks":2500,"category":"Fuel"}]""",
            equipmentType="Crane",equipmentHours="7,5",equipmentHired=true,equipmentJson="""[{"type":"Truck","hours":"2","hired":false}]""",
            planText="Next step",plansJson="""["Check access"]""")
        val restored=FormSnapshot.decode(form.encode(),"owner-A")
        assertEquals(form.copy(financialJson=restored.financialJson,equipmentJson=restored.equipmentJson),restored)
        assertEquals(2500,org.json.JSONArray(restored.financialJson).getJSONObject(0).getInt("amount_kopecks"))
        assertEquals("Fuel",org.json.JSONArray(restored.financialJson).getJSONObject(0).getString("category"))
        assertEquals("Truck",org.json.JSONArray(restored.equipmentJson).getJSONObject(0).getString("type"))
    }
    @Test fun unknownVersionIsNotSilentlyOverwritten() {
        try {FormSnapshot.decode("""{"version":2,"comment":"future"}""","A");fail("Expected version rejection")}
        catch(_:IllegalArgumentException){}
    }
}
