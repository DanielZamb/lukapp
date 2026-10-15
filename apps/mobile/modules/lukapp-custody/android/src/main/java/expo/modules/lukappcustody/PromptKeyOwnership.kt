package expo.modules.lukappcustody

internal class PromptKeyOwnership {
  class Token internal constructor(val alias: String)
  private val owners = mutableMapOf<String, Token>()
  fun claim(alias: String): Token = Token(alias).also { owners[alias] = it }
  fun release(token: Token): Boolean {
    if (owners[token.alias] !== token) return false
    owners.remove(token.alias)
    return true
  }
}
