package com.kaiden.construction

import android.content.Context
import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PhotoPreviewTest {
    @get:Rule val compose=createComposeRule()
    @Test fun thumbnailRendersAndRemoveDoesNotDeleteFile() {
        val context:Context=ApplicationProvider.getApplicationContext()
        val file=File(context.cacheDir,"synthetic-preview.png")
        val bitmap=Bitmap.createBitmap(1200,800,Bitmap.Config.ARGB_8888)
        file.outputStream().use{bitmap.compress(Bitmap.CompressFormat.PNG,100,it)};bitmap.recycle()
        var removed=false
        try {
            compose.setContent { PhotoPreview(file.absolutePath,1,true){removed=true} }
            compose.waitUntil(10_000){compose.onAllNodesWithContentDescription("Выбранное фото 1").fetchSemanticsNodes().isNotEmpty()}
            compose.onNodeWithText("Удалить фото 1").performClick()
            compose.waitForIdle();assertTrue(removed);assertTrue(file.exists())
        }finally{file.delete()}
    }
}
