plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.kapt")
}
android {
    namespace = "com.kaiden.construction"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.kaiden.construction"
        minSdk = 26
        targetSdk = 35
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        testInstrumentationRunnerArguments["crsApiBase"]=providers.gradleProperty("crsTestApiBase").orElse("").get()
        versionCode = 5
        versionName = "0.4.0"
        val baseUrl = providers.gradleProperty("apiBaseUrl").orElse("https://example.invalid/api/v1").get()
        buildConfigField("String", "API_BASE_URL", "\"$baseUrl\"")
        buildConfigField("boolean", "DEMO_MODE", "false")
        manifestPlaceholders["appLabel"]="СтройКонтроль"
    }
    testBuildType=providers.gradleProperty("crsTestBuildType").orElse("debug").get()
    buildTypes {
        create("demo") {
            initWith(getByName("debug"))
            applicationIdSuffix=".demo"
            versionNameSuffix="-demo"
            matchingFallbacks+=listOf("debug")
            buildConfigField("boolean","DEMO_MODE","true")
            manifestPlaceholders["appLabel"]="СтройКонтроль Демо"
        }
    }
    if(providers.gradleProperty("crsTestBuildType").orElse("debug").get()=="demo") {
        sourceSets.getByName("androidTest").java.srcDir("src/demoTest/java")
        defaultConfig.testInstrumentationRunnerArguments["class"]="com.kaiden.construction.DemoModeTest"
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    androidTestImplementation("androidx.work:work-testing:2.10.0")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:core-ktx:1.6.1")
    androidTestImplementation(platform("androidx.compose:compose-bom:2025.04.01"))
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
    add("demoImplementation","androidx.compose.ui:ui-test-manifest")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250107")
    implementation(platform("androidx.compose:compose-bom:2025.04.01"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.runtime:runtime-livedata")
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.room:room-runtime:2.7.1")
    implementation("androidx.room:room-ktx:2.7.1")
    kapt("androidx.room:room-compiler:2.7.1")
    implementation("androidx.work:work-runtime-ktx:2.10.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
}
