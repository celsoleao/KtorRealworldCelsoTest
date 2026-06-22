package io.realworld.app.domain

data class StatsDTO(val stats: Stats)

data class Stats(
    val articlesCount: Long = 0,
    val commentsCount: Long = 0,
    val favoritesCount: Long = 0
)
