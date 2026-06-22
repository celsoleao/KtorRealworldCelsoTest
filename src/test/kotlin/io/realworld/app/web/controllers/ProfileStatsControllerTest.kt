package io.realworld.app.web.controllers

import io.realworld.app.domain.StatsDTO
import io.realworld.app.web.rules.AppRule
import io.realworld.app.web.util.HttpUtil
import org.apache.http.HttpStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Rule
import org.junit.Test

class ProfileStatsControllerTest {
    @Rule
    @JvmField
    val appRule = AppRule()

    @Test
    fun `get stats for existing user returns zero counts when no content created`() {
        val username = "stats_happy_path"
        appRule.http.registerUser("stats_happy@valid_email.com", "password", username)
        appRule.http.loginAndSetTokenHeader("stats_happy@valid_email.com", "password")

        val response = appRule.http.get<StatsDTO>("/profiles/$username/stats")

        assertEquals(HttpStatus.SC_OK, response.status)
        assertNotNull(response.body.stats)
        assertEquals(0L, response.body.stats.articlesCount)
        assertEquals(0L, response.body.stats.commentsCount)
        assertEquals(0L, response.body.stats.favoritesCount)
    }

    @Test
    fun `get stats without authentication returns 401`() {
        val username = "stats_unauth_user"
        appRule.http.registerUser("stats_unauth@valid_email.com", "password", username)

        val unauthHttp = HttpUtil(appRule.port)
        val response = unauthHttp.get<String>("/profiles/$username/stats")

        assertEquals(HttpStatus.SC_UNAUTHORIZED, response.status)
    }

    @Test
    fun `get stats for non-existent user returns 404`() {
        appRule.http.registerUser("stats_404@valid_email.com", "password", "stats_user_for_404")
        appRule.http.loginAndSetTokenHeader("stats_404@valid_email.com", "password")

        val response = appRule.http.get<String>("/profiles/nonexistent_user_xyz_abc/stats")

        assertEquals(HttpStatus.SC_NOT_FOUND, response.status)
    }

    @Test
    fun `authenticated user can get stats for a different user`() {
        appRule.http.registerUser("stats_target@valid_email.com", "password", "stats_target_user")
        appRule.http.registerUser("stats_viewer@valid_email.com", "password", "stats_viewer_user")
        appRule.http.loginAndSetTokenHeader("stats_viewer@valid_email.com", "password")

        val response = appRule.http.get<StatsDTO>("/profiles/stats_target_user/stats")

        assertEquals(HttpStatus.SC_OK, response.status)
        assertNotNull(response.body.stats)
        assertEquals(0L, response.body.stats.articlesCount)
        assertEquals(0L, response.body.stats.commentsCount)
        assertEquals(0L, response.body.stats.favoritesCount)
    }

    @Test
    fun `stats are independent between two users`() {
        appRule.http.registerUser("stats_user_a@valid_email.com", "password", "stats_user_a")
        appRule.http.registerUser("stats_user_b@valid_email.com", "password", "stats_user_b")
        appRule.http.loginAndSetTokenHeader("stats_user_a@valid_email.com", "password")

        val responseA = appRule.http.get<StatsDTO>("/profiles/stats_user_a/stats")
        val responseB = appRule.http.get<StatsDTO>("/profiles/stats_user_b/stats")

        assertEquals(HttpStatus.SC_OK, responseA.status)
        assertEquals(HttpStatus.SC_OK, responseB.status)
        assertEquals(0L, responseA.body.stats.articlesCount)
        assertEquals(0L, responseB.body.stats.articlesCount)
    }

    @Test
    fun `stats endpoint returns consistent results on repeated calls`() {
        val username = "stats_idempotent_user"
        appRule.http.registerUser("stats_idempotent@valid_email.com", "password", username)
        appRule.http.loginAndSetTokenHeader("stats_idempotent@valid_email.com", "password")

        val first = appRule.http.get<StatsDTO>("/profiles/$username/stats")
        val second = appRule.http.get<StatsDTO>("/profiles/$username/stats")

        assertEquals(HttpStatus.SC_OK, first.status)
        assertEquals(HttpStatus.SC_OK, second.status)
        assertEquals(first.body.stats.articlesCount, second.body.stats.articlesCount)
        assertEquals(first.body.stats.commentsCount, second.body.stats.commentsCount)
        assertEquals(first.body.stats.favoritesCount, second.body.stats.favoritesCount)
    }
}
