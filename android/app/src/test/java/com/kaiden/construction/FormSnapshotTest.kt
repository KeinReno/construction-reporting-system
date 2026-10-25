package com.kaiden.construction
import org.junit.Assert.*
import org.junit.Test
class FormSnapshotTest {
    @Test fun rawPartialInputAndEditIdentityRoundTrip() {
        val editing=Draft(id="report",ownerId="owner-A",siteId="site",siteName="Synthetic",workDate="2026-10-26",kind="no_work",workEntriesJson="[]",noWorkReason="No access",comment="",photosJson="[]",status="failed",serverId="server",serverRevision=7,editRequested=true,editReason="Clarify",businessStatus="needs_revision")
        val form=FormSnapshot(siteId="site",workDate="2026-1",quantity="1,",description="Unadded work",comment="Draft",photosJson="""[{"id":"photo","path":"/private/local-photo","mime":"image/png"}]""",editing=editing,editReason="Correction")
        val restored=FormSnapshot.decode(form.encode(),"owner-A")
        assertEquals(form.copy(photosJson=restored.photosJson),restored)
        assertEquals("/private/local-photo",org.json.JSONArray(restored.photosJson).getJSONObject(0).getString("path"))
    }
    @Test fun anotherOwnerCannotRestoreEditSnapshot() {
        val d=Draft(id="r",ownerId="A",siteId="s",siteName="Synthetic",workDate="2026-10-26",kind="work",workEntriesJson="[]",noWorkReason="",comment="",photosJson="[]")
        try {FormSnapshot.decode(FormSnapshot(editing=d).encode(),"B");fail("Expected owner rejection")}
        catch(_:IllegalArgumentException){}
    }
    @Test fun unknownVersionIsNotSilentlyOverwritten() {
        try {FormSnapshot.decode("""{"version":2,"comment":"future"}""","A");fail("Expected version rejection")}
        catch(_:IllegalArgumentException){}
    }
}
