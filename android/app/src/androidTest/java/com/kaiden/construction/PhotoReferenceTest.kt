package com.kaiden.construction

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.util.UUID

@RunWith(AndroidJUnit4::class)
class PhotoReferenceTest {
    @Test fun photoIsRetainedWhileFormOrQueuedDraftStillReferencesIt() = runBlocking {
        val context:Context=ApplicationProvider.getApplicationContext()
        val db=AppDatabase.build(context,"photo-reference-test-${UUID.randomUUID()}.db")
        try {
            val repository=FormRepository(db)
            val id=UUID.randomUUID().toString()
            val form=repository.open("synthetic-owner")
            val photo="""[{"id":"$id","path":"synthetic","mime":"image/png"}]"""
            assertTrue(repository.save(form.copy(payload=FormSnapshot(photosJson=photo).encode())))
            assertTrue(repository.photoReferenced(id))
            assertTrue(repository.save(form.copy(payload=FormSnapshot().encode())))
            assertFalse(repository.photoReferenced(id))
            db.drafts().save(Draft(id=UUID.randomUUID().toString(),ownerId="synthetic-owner",siteId="site",siteName="Synthetic",workDate="2026-10-28",kind="work",workEntriesJson="[]",noWorkReason="",comment="",photosJson=photo))
            assertTrue(repository.photoReferenced(id))
        } finally { db.close() }
    }
}
