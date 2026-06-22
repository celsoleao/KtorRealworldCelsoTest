package io.realworld.app.domain.service

import io.realworld.app.domain.Stats
import io.realworld.app.domain.exceptions.NotFoundException
import io.realworld.app.domain.repository.ArticleRepository
import io.realworld.app.domain.repository.UserRepository

class ProfileService(
    private val userRepository: UserRepository,
    private val articleRepository: ArticleRepository
) {
    fun getStats(username: String): Stats {
        userRepository.findByUsername(username)
            ?: throw NotFoundException("User '$username' not found")
        return Stats(
            articlesCount = articleRepository.countArticlesByUsername(username),
            commentsCount = articleRepository.countCommentsByUsername(username),
            favoritesCount = articleRepository.countFavoritesByUsername(username)
        )
    }
}
