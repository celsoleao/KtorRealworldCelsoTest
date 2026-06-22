package io.realworld.app.web.controllers

import io.ktor.application.ApplicationCall
import io.ktor.response.respond
import io.realworld.app.domain.StatsDTO
import io.realworld.app.domain.service.ProfileService

class ProfileController(private val profileService: ProfileService) {
    fun get(ctx: ApplicationCall) {
        ctx.parameters["username"]
    }

    fun follow(ctx: ApplicationCall) {
        ctx.parameters["username"]
    }

    fun unfollow(ctx: ApplicationCall) {
        ctx.parameters["username"]
    }

    suspend fun stats(ctx: ApplicationCall) {
        val username = ctx.parameters["username"]!!
        ctx.respond(StatsDTO(profileService.getStats(username)))
    }
}
