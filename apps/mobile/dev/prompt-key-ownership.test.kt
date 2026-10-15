package expo.modules.lukappcustody

fun main() {
  val owners = PromptKeyOwnership()
  val deleted = mutableListOf<String>()
  fun cleanup(token: PromptKeyOwnership.Token) {
    if (owners.release(token)) deleted.add(token.alias)
  }
  val oldLive = owners.claim("lukapp.enrollment.live")
  cleanup(oldLive)
  val fixture = owners.claim("lukapp.enrollment.fixture")
  cleanup(oldLive)
  check(deleted == listOf("lukapp.enrollment.live"))
  check(owners.release(fixture))
  cleanup(oldLive)
  check(deleted == listOf("lukapp.enrollment.live"))

  val cancelled = owners.claim("lukapp.enrollment.live")
  val newer = owners.claim("lukapp.enrollment.live")
  cleanup(cancelled)
  check(deleted == listOf("lukapp.enrollment.live"))
  cleanup(newer)
  cleanup(newer)
  check(deleted == listOf("lukapp.enrollment.live", "lukapp.enrollment.live"))

  val completed = owners.claim("lukapp.enrollment.fixture")
  check(owners.release(completed))
  cleanup(completed)
  check(deleted == listOf("lukapp.enrollment.live", "lukapp.enrollment.live"))
  println("PASS: late cleanup preserves other-mode, newer-attempt and completed sentinel keys")
}
