package io.realworld.app.domain.repository

import org.jetbrains.exposed.dao.id.LongIdTable
import org.jetbrains.exposed.sql.Column
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction

internal object Articles : LongIdTable() {
    val authorId: Column<Long> = long("author_id")
}

internal object Comments : LongIdTable() {
    val authorId: Column<Long> = long("author_id")
}

internal object ArticleFavorites : Table() {
    val articleId: Column<Long> = long("article_id")
    val userId: Column<Long> = long("user_id")
    override val primaryKey = PrimaryKey(articleId, userId)
}

class ArticleRepository {
    init {
        transaction {
            SchemaUtils.create(Articles, Comments, ArticleFavorites)
        }
    }

    private fun userIdByUsername(username: String): Long? =
        Users.select { Users.username eq username }.singleOrNull()?.get(Users.id)?.value

    fun countArticlesByUsername(username: String): Long = transaction {
        val userId = userIdByUsername(username) ?: return@transaction 0L
        Articles.select { Articles.authorId eq userId }.count()
    }

    fun countCommentsByUsername(username: String): Long = transaction {
        val userId = userIdByUsername(username) ?: return@transaction 0L
        Comments.select { Comments.authorId eq userId }.count()
    }

    fun countFavoritesByUsername(username: String): Long = transaction {
        val userId = userIdByUsername(username) ?: return@transaction 0L
        ArticleFavorites.select { ArticleFavorites.userId eq userId }.count()
    }
}
