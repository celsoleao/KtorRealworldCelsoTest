# Ktor RealWorld — Field Developer Engineer Exercise Progress

## Status: Build environment issues being resolved — resume from Step 6

---

## What Was Implemented

### Feature: User Activity Stats (Option B)
**Endpoint:** `GET /profiles/{username}/stats` (requires JWT auth)  
**Response:**
```json
{ "stats": { "articlesCount": 0, "commentsCount": 0, "favoritesCount": 0 } }
```

---

## Files Changed / Created

### New Files
| File | Purpose |
|------|---------|
| `src/main/kotlin/io/realworld/app/domain/Stats.kt` | `StatsDTO` + `Stats` response models |
| `src/main/kotlin/io/realworld/app/domain/repository/ArticleRepository.kt` | Minimal `Articles`, `Comments`, `ArticleFavorites` tables + 3 count methods |
| `src/main/kotlin/io/realworld/app/domain/service/ProfileService.kt` | Business logic: user existence check + delegate to counts |
| `src/test/kotlin/io/realworld/app/web/controllers/ProfileStatsControllerTest.kt` | 6 integration tests (NOT @Ignore'd) |

### Modified Files
| File | What Changed |
|------|-------------|
| `src/main/kotlin/io/realworld/app/domain/User.kt` | **Bug fix**: `validRegister()` / `validLogin()` had inverted `isNullOrBlank()` checks (missing `!`) — this caused ALL user registrations to fail. Fixed. |
| `src/main/kotlin/io/realworld/app/web/controllers/ProfileController.kt` | Added `stats()` suspend handler |
| `src/main/kotlin/io/realworld/app/web/Router.kt` | Added `GET /profiles/{username}/stats` inside `authenticate {}` block |
| `src/main/kotlin/io/realworld/app/config/ModulesConfig.kt` | Added `ArticleRepository` binding; wired `ProfileService(instance(), instance())` |
| `src/main/kotlin/io/realworld/app/config/AppConfig.kt` | Added `NotFoundException` → HTTP 404 handler in `StatusPages` |
| `src/main/kotlin/io/realworld/app/domain/repository/UserRepository.kt` | Fixed `LongIdTable` import + `Follows` primaryKey syntax for Exposed 0.41.1 |
| `build.gradle` | Kotlin 1.3.+ → 1.7.22; Exposed 0.14.1 → 0.41.1 (split modules); `testCompile` → `testImplementation` |
| `gradle/wrapper/gradle-wrapper.properties` | Gradle 4.10 → 7.6.4 (Java 17 compatibility) |
| `gradle.properties` | Created — points Gradle daemon at custom truststore |
| `.github/workflows/gradle.yml` | Multi-JDK matrix (17, 21); Gradle caching; `dorny/test-reporter` for JUnit XML |

---

## The 6 Tests in ProfileStatsControllerTest

| Test | What It Covers |
|------|---------------|
| `get stats for existing user returns zero counts when no content created` | Happy path — 200, all counts = 0 |
| `get stats without authentication returns 401` | Auth enforcement |
| `get stats for non-existent user returns 404` | NotFoundException → 404 mapping |
| `authenticated user can get stats for a different user` | Cross-user access allowed |
| `stats are independent between two users` | SQL WHERE scopes correctly per user |
| `stats endpoint returns consistent results on repeated calls` | Read-only, idempotent |

---

## Build Environment Issues & Fixes Applied

### Problem 1: Gradle 4.10 incompatible with Java 17
- **Fix:** Upgraded wrapper to Gradle 7.6.4 in `gradle-wrapper.properties`

### Problem 2: Avast SSL interception breaks all HTTPS (Maven Central, JCenter)
- **Fix:** Exported `CN=Avast Web/Mail Shield Root` from Windows cert store, imported into a copy of the JDK cacerts at `C:\Users\celso\.gradle\cacerts-with-avast`
- **Fix:** Added to `gradle.properties`:
  ```
  org.gradle.jvmargs=-Djavax.net.ssl.trustStore=C:/Users/celso/.gradle/cacerts-with-avast -Djavax.net.ssl.trustStorePassword=changeit
  ```
- **Also set as env var for wrapper process:**
  ```
  $env:JAVA_TOOL_OPTIONS = "-Djavax.net.ssl.trustStore=C:/Users/celso/.gradle/cacerts-with-avast -Djavax.net.ssl.trustStorePassword=changeit"
  ```

### Problem 3: `org.jetbrains.exposed:exposed:0.14.1` not on Maven Central or JCenter (JCenter shut down)
- **Fix:** Upgraded Exposed to 0.41.1 with split modules in `build.gradle`:
  ```groovy
  api "org.jetbrains.exposed:exposed-core:$exposed_version"
  api "org.jetbrains.exposed:exposed-dao:$exposed_version"
  api "org.jetbrains.exposed:exposed-jdbc:$exposed_version"
  ```
- **Fix:** `LongIdTable` import changed in both repositories:
  - Old: `import org.jetbrains.exposed.dao.LongIdTable`
  - New: `import org.jetbrains.exposed.dao.id.LongIdTable`
- **Fix:** `.primaryKey()` deprecated in newer Exposed:
  - Old: `val user: Column<Long> = long("user").primaryKey()`
  - New: `override val primaryKey = PrimaryKey(user, follower)`
- **Fix:** `ArticleRepository` count methods rewritten to two-step approach (get userId first, then count) to avoid `Column<Long>` vs `Column<EntityID<Long>>` join comparison issues
- **Fix:** `UserRepository.findIsFollowUser` join changed to use explicit `onColumn`/`otherColumn` parameters

---

## Where We Stopped

**Last attempted command (not yet run — user interrupted):**
```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:JAVA_TOOL_OPTIONS = "-Djavax.net.ssl.trustStore=C:/Users/celso/.gradle/cacerts-with-avast -Djavax.net.ssl.trustStorePassword=changeit"
cd "C:\Users\celso\Downloads\ktor-realworld"
.\gradlew.bat --stop
.\gradlew.bat clean build
```

All code changes are in place. The build just needs to be run to verify compilation and tests.

---

## To Resume — Step-by-Step

### Step 1: Open PowerShell in the project directory

### Step 2: Run the build
```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$env:JAVA_TOOL_OPTIONS = "-Djavax.net.ssl.trustStore=C:/Users/celso/.gradle/cacerts-with-avast -Djavax.net.ssl.trustStorePassword=changeit"
cd "C:\Users\celso\Downloads\ktor-realworld"
.\gradlew.bat --stop
.\gradlew.bat clean build
```

### Step 3: If build passes, run only the new tests
```powershell
.\gradlew.bat test --tests "io.realworld.app.web.controllers.ProfileStatsControllerTest"
```

### Step 4: Fork the repo on GitHub
- Go to https://github.com/Rudge/kotlin-ktor-realworld-example-app
- Click Fork
- Clone your fork locally and add as remote:
  ```
  git remote add origin https://github.com/<your-username>/kotlin-ktor-realworld-example-app.git
  git push -u origin feature/user-activity-stats
  ```

### Step 5: Part 3 — AI-assisted test generation
- The tests were generated/refined using Claude Code (not GitHub Copilot)
- Document this in the final PR description

### Step 6: Submit PR
- Open PR from `feature/user-activity-stats` → `main` in your fork
- PR description should cover: feature choice, architecture decisions, User.kt bug fix, AI agent experience

---

## Key Facts to Remember

- **Branch:** `feature/user-activity-stats` (local only, not pushed yet)
- **Java:** `C:\Program Files\Java\jdk-17` (installed)
- **Custom truststore:** `C:\Users\celso\.gradle\cacerts-with-avast` (has Avast cert)
- **Existing tests are all `@Ignore`d** — this was intentional in the original repo (they were written before the registration bug)
- **The registration bug** (`validRegister` using `isNullOrBlank` without `!`) was a pre-existing bug that we fixed as part of this work; without the fix, the new tests would all fail since they call `registerUser()`
