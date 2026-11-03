package expo.modules.notificationintake

import org.junit.Assert.*
import org.junit.Test

class GenericNotificationParserTest {
  @Test fun copAndUsdBothHaveTwoMinorDigits() {
    assertEquals(ParseResult.Accepted(ParsedAmount("out", 123456, "COP")), GenericNotificationParser.parse("Pagaste COP 1.234,56"))
    assertEquals(ParseResult.Accepted(ParsedAmount("in", 123456, "USD")), GenericNotificationParser.parse("Received USD 1,234.56"))
    assertEquals(ParseResult.Accepted(ParsedAmount("out", 10000, null)), GenericNotificationParser.parse("Purchase $100"))
    assertEquals(ParseResult.Accepted(ParsedAmount("in", 1230, "COP")), GenericNotificationParser.parse("Recibiste 12,30 COP"))
    assertEquals(ParseResult.Accepted(ParsedAmount(null, 1234567, "COP")), GenericNotificationParser.parse("COP 12 345,67"))
    assertEquals(ParseResult.Accepted(ParsedAmount(null, 123, "USD")), GenericNotificationParser.parse("USD 1.23"))
  }
  private fun unresolved(text: String): ParseResult.Accepted {
    val result = GenericNotificationParser.parse(text)
    assertTrue(result is ParseResult.Accepted)
    return result as ParseResult.Accepted
  }
  @Test fun securityDiscardsAndUncertainMoneyNeedsReview() {
    for (text in listOf("OTP 123456 purchase $20", "Tu código de seguridad es 5678 COP 10", "Login USD 2"))
      assertEquals(ParseResult.Discard("security"), GenericNotificationParser.parse(text))
    assertNull(unresolved("Paid $10 balance $20").amount.amountMinorUnits)
    assertNull(unresolved("$10 COP 20").amount.amountMinorUnits)
    assertNull(unresolved("abcUSD 20").amount.amountMinorUnits)
    for (text in listOf("-$10", "COP 12 34", "$1,000", "$1.234", "$1.2", "$0", "USD 90071992547409.92"))
      assertNull(text, unresolved(text).amount.amountMinorUnits)
    assertNull(unresolved("You have a message").amount.amountMinorUnits)
    assertEquals(ParsedAmount(null, 2000, null), unresolved("received paid $20").amount)
  }
  @Test fun englishCodePhrasesAreDiscardedByTheSharedSecurityBoundary() {
    for (text in listOf("Use code 123456 to confirm purchase $10", "Your one-time code is 123456. Amount USD 10.00", "Your one-time-code is 123456 for $10", "Your oneTimeCode is 123456 for $10")) {
      assertTrue(GenericNotificationParser.hasSecurityContent(text))
      assertEquals(ParseResult.Discard("security"), GenericNotificationParser.parse(text))
    }
    for (text in listOf("Paid $10 at Codehouse", "Paid USD 10 at Decode Cafe", "COP 10; Comercio: Securityware")) {
      assertFalse(GenericNotificationParser.hasSecurityContent(text))
      assertTrue(GenericNotificationParser.parse(text) is ParseResult.Accepted)
    }
  }
  @Test fun completeMoneyTokensRejectUnsupportedCurrenciesAndContinuations() {
    for (text in listOf("Paid $10MXN", "Paid $10 MXN", "Paid USD 10MXN", "$10 EUR", "EUR $10", "$10 mxn", "USD 10 COP", "$10USDx", "$10items", "$10_abc", "$10ñ", "$10 USD COP", "$10 USD/MXN", "MXN USD 10", "COP USD 10", "$10\u00a0MXN", "$10\u202fMXN", "USD 10\u2003MXN", "$10\n123", "$10\u200bMXN", "MXN\u200b$10", "$10%", "$10@")) {
      assertNull(unresolved(text).amount.amountMinorUnits)
    }
    for (text in listOf("$10", "$10; completed", "$10 USD.", "$10 | Merchant: Cafe", "USD 10.00", "10 COP", "COP 10; Comercio: Tienda", "$10 at Cafe", "$10 en Tienda")) {
      assertTrue(GenericNotificationParser.parse(text) is ParseResult.Accepted)
    }
    assertEquals(null, (GenericNotificationParser.parse("$10 at Cafe") as ParseResult.Accepted).amount.currency)
  }
  @Test fun genericMerchantLabelsAndClausesSelectOnlyTheirValues() {
    val cases = mapOf(
      "Paid USD 10.00; Merchant:  Cafe   Central " to "Cafe Central",
      "Pagaste COP 10\nComercio: Café Central" to "Café Central",
      "COP 10; Establecimiento: Tienda Uno" to "Tienda Uno",
      "Paid $10 at Cafe Central" to "Cafe Central",
      "Paid $10; at Cafe Central" to "Cafe Central",
      "$10 USD. en Tienda Uno" to "Tienda Uno",
      "Pagaste COP 10 en Tienda Uno" to "Tienda Uno",
      "Paid $10 at Cafe; Merchant: Cafe" to "Cafe",
      "Merchant: Cafe\nPaid USD 10" to "Cafe",
      "COP 12\u202f345,67; Comercio:\u00a0Cafe\u00a0Central" to "Cafe Central",
      "$10 at\u00a0Cafe\u2003Central" to "Cafe Central")
    for ((input, expected) in cases) {
      val parsed = GenericNotificationParser.parse(input)
      assertTrue(parsed is ParseResult.Accepted)
      assertEquals(expected, (parsed as ParseResult.Accepted).amount.description)
    }
  }
  @Test fun unclearAndPrivateMerchantValuesRemainEmpty() {
    val cases = listOf("Paid USD 10", "Paid USD 10 at Cafe en Tienda", "USD 10; Merchant: Cafe; Comercio: Tienda", "USD 10; Merchant:",
      "USD 10; Merchant: Card 1234", "USD 10 at Cafe 1234 5678", "USD 10 at Cafe ****12", "USD 10 at Cafe payment approved", "USD 10; Merchant: https://example.com", "USD 10; Merchant: " + "é".repeat(129))
    for (input in cases) {
      val parsed = GenericNotificationParser.parse(input)
      assertTrue(parsed is ParseResult.Accepted)
      assertEquals("", (parsed as ParseResult.Accepted).amount.description)
    }
    for (value in listOf("Cafe $10", "USD Cafe", "Use code 123456", "Cafe cuenta 123", "Cafe ****12", "Cafe X X12", "Cafe 12.34"))
      assertEquals("", GenericNotificationParser.descriptionForSource(value, "com.source.app", "Source App"))
  }
  @Test fun actualSourceBoundaryRemovesAppAndPackageIdentities() {
    for (value in listOf("Source App", "Source App Online", " source   app ", "com.source.app", "COM.SOURCE.APP"))
      assertEquals("", GenericNotificationParser.descriptionForSource(value, "com.source.app", "Source App"))
    assertEquals("", GenericNotificationParser.descriptionForSource("Cafe", "com.source.app", null))
    assertEquals("Café Central", GenericNotificationParser.descriptionForSource("  Café   Central ", "com.source.app", "Source App"))
    assertEquals("é".repeat(128), GenericNotificationParser.descriptionForSource("é".repeat(128), "com.source.app", "Source App"))
  }
  @Test fun reviewedSecurityAndAnnotationTableFailsClosed() {
    for (text in listOf("Use token ABCDEF to confirm purchase $10", "Use token 123456 to confirm purchase $10", "Your access token is 123456 for purchase $10")) {
      assertTrue(GenericNotificationParser.hasSecurityContent(text))
      assertEquals(ParseResult.Discard("security"), GenericNotificationParser.parse(text))
    }
    val rejected = listOf("$10 USDT", "$10 EURO", "$10 €", "$10 £", "$10 MX", "$10MXN", "$10 MXN", "USD 10MXN", "$10 rubles", "$10 USDt", "$10\u00a0USDT")
    rejected.forEachIndexed { index, input -> assertNull("annotation-" + index, unresolved(input).amount.amountMinorUnits) }
    for (input in listOf("COP $10", "USD 10", "$10 USD", "10 COP", "$10", "$10; completed", "$10\nMerchant: Cafe", "$10 at Cafe", "$10 en Tienda"))
      assertTrue(GenericNotificationParser.parse(input) is ParseResult.Accepted)
  }
  @Test fun merchantNumericAndUnitPrivacyUsesCanonicalUnicode() {
    val rejected = listOf("Cafe １２３４", "Cafe ١٢٣٤", "Cafe 10 euros", "Cafe 10 pesos", "Cafe 10 rubles", "Cafe ****١٢", "Cafe card １２", "Cafe 12-34")
    rejected.forEachIndexed { index, value ->
      val parsed = GenericNotificationParser.parse("Paid $10 at " + value)
      assertTrue("merchant-" + index, parsed is ParseResult.Accepted)
      assertEquals("merchant-" + index, "", (parsed as ParseResult.Accepted).amount.description)
    }
    for (value in listOf("Studio 54", "Cafe 7", "7-Eleven", "Cafe No. 7"))
      assertEquals(value, (GenericNotificationParser.parse("Paid $10; Merchant: " + value) as ParseResult.Accepted).amount.description)
  }
  @Test fun oneCanonicalIdentityRejectsSourceContainment() {
    val cases = listOf(Triple("AcmeBank Cafe", "com.acme.bank", "Acme Bank"), Triple("Cafe AcmeBank", "com.acme.bank", "Acme Bank"),
      Triple("Banco SA Cafe", "com.banco.app", "Banco S.A."), Triple("acme.bank Cafe", "com.acme.bank", "Other"), Triple("ＡｃｍｅＢａｎｋ Cafe", "com.acme.bank", "Acme Bank"))
    cases.forEachIndexed { index, item -> assertEquals("identity-" + index, "", GenericNotificationParser.descriptionForSource(item.first, item.second, item.third)) }
    assertEquals("", GenericNotificationParser.descriptionForSource("Cafe", "com.bank", null))
    assertEquals("Cafe Central", GenericNotificationParser.descriptionForSource("Cafe Central", "com.bank", "Other"))
  }
  @Test fun actualListenerFieldAssemblyPreservesLinesAndInspectsAlternatives() {
    val split = NotificationFields(title = "Merchant: Cafe", text = "Paid USD 10")
    assertEquals("Merchant: Cafe\nPaid USD 10", NotificationText.assemble(split))
    assertEquals("Cafe", (GenericNotificationParser.parseFields(split) as ParseResult.Accepted).amount.description)
    val lines = NotificationFields(title = "Alert", textLines = listOf("Merchant: Cafe", "Paid USD 10"))
    assertEquals("Cafe", (GenericNotificationParser.parseFields(lines) as ParseResult.Accepted).amount.description)
    val alternatives = listOf(NotificationFields(bigText = "Paid USD 10", text = "Use token ABCDEF"),
      NotificationFields(text = "Paid USD 10", subText = "Use token ABCDEF"), NotificationFields(text = "Paid USD 10", textLines = listOf("Use token ABCDEF")),
      NotificationFields(title = "Use token ABCDEF", text = "Paid USD 10"))
    alternatives.forEach { assertEquals(ParseResult.Discard("security"), GenericNotificationParser.parseFields(it)) }
  }
  @Test fun monetaryEnvelopesRetainCurrencyAcrossLabelPunctuation() {
    val rejected = listOf("Paid MXN: $10", "Paid $10 (MXN)", "Paid EUR: $10", "Paid $10 (EUR)", "Paid $10 [USDT]", "Paid $10 (USD COP)")
    rejected.forEachIndexed { index, input -> assertNull("envelope-" + index, unresolved(input).amount.amountMinorUnits) }
    val accepted = mapOf("Paid USD: $10" to "USD", "Paid $10 (USD)" to "USD", "Paid COP: $10" to "COP", "Paid $10 [COP]" to "COP", "Paid (USD) $10" to "USD")
    accepted.forEach { (input, currency) -> assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, currency)), GenericNotificationParser.parse(input)) }
    assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, null)), GenericNotificationParser.parse("Paid $10; completed"))
  }
  @Test fun amountWrappersDifferFromCurrencyOnlyWrappers() {
    for (input in listOf("Paid ($10)", "Paid (USD 10)", "Paid [$10]", "Paid $10 (USD", "Paid $10 (USD 1)", "Paid -$10"))
      assertNull(unresolved(input).amount.amountMinorUnits)
    assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, "USD")), GenericNotificationParser.parse("Paid $10 (USD)"))
  }
  @Test fun numberedMerchantNamesUseFinancialUnitsInsteadOfArbitraryWords() {
    for (merchant in listOf("Route 66 Cafe", "Studio 54 Records", "Cafe 7 Central", "Studio 54"))
      assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, null, merchant)), GenericNotificationParser.parse("Paid $10; Merchant: " + merchant))
    for (merchant in listOf("Cafe 10 pesos", "Cafe 10 euros", "Cafe 10 dollars", "Cafe 10 MXN", "Cafe １２３４", "Cafe ١٢٣٤"))
      assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, null, "")), GenericNotificationParser.parse("Paid $10; Merchant: " + merchant))
  }
  @Test fun composedLabelRolesPreserveCurrencyAndSigns() {
    val accepted = mapOf("Paid USD, $10" to "USD", "Paid $10, USD" to "USD", "Paid (USD): $10" to "USD", "Paid $10: (USD)" to "USD",
      "Paid [COP], $10" to "COP", "Paid $10, [COP]" to "COP", "Paid COP: $10" to "COP", "Paid $10 (COP)" to "COP")
    accepted.forEach { (input, code) -> assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, code)), GenericNotificationParser.parse(input)) }
    for (input in listOf("Paid MXN, $10", "Paid $10, MXN", "Paid (MXN): $10", "Paid $10: (MXN)", "Paid [EUR], $10", "Paid $10, [EUR]", "Paid $-10", "Paid USD -10", "Paid +$10", "Paid $10-"))
      assertNull(unresolved(input).amount.amountMinorUnits)
    assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, null)), GenericNotificationParser.parse("Paid $10; MXN"))
  }
  @Test fun merchantFinancialPhrasesDoNotUseCodeOrNameFragments() {
    for (value in listOf("Route 66 All Stars", "Route 66 Real Estate", "Route 66 Cafe", "Studio 54 Records"))
      assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, null, value)), GenericNotificationParser.parse("Paid $10; Merchant: " + value))
    for (value in listOf("Cafe 10 MXN", "Cafe 10 pesos", "Cafe 10 shillings", "Cafe 10 Brazilian Real", "Cafe 10 US Dollars"))
      assertEquals(ParseResult.Accepted(ParsedAmount("out", 1000, null, "")), GenericNotificationParser.parse("Paid $10; Merchant: " + value))
  }
  @Test fun retainedMonetaryMarkersClassifyBothAnnotationSidesSymmetrically() {
    for (input in listOf("Paid 10 MXN USD", "Paid 10: (MXN USD)", "Paid 10 MXN $", "Paid USD MXN 10", "Paid (USD MXN): 10", "Paid $ MXN 10"))
      assertNull(input, unresolved(input).amount.amountMinorUnits)
    assertNull(unresolved("Paid 10 MXN; USD").amount.amountMinorUnits)
    assertNull(unresolved("Paid 10 MXN at USD Cafe").amount.amountMinorUnits)
  }
  @Test fun wireEncodingUsesCanonicalUnpaddedBase64Url() {
    assertEquals("Zm9vYmFy", WireBase64.encode("foobar".toByteArray()))
    assertEquals("Zg", WireBase64.encode("f".toByteArray()))
    assertEquals("Zm8", WireBase64.encode("fo".toByteArray()))
    assertEquals("foobar", String(WireBase64.decode("Zm9vYmFy")))
    for (size in 0..100) {
      val bytes = ByteArray(size) { it.toByte() }
      assertArrayEquals(bytes, WireBase64.decode(WireBase64.encode(bytes)))
    }
  }
  @Test fun captureIdentityUsesLengthPrefixedOsIdentityOnly() {
    assertEquals(captureId("com.bank", "key", 5), captureId("com.bank", "key", 5))
    assertNotEquals(captureId("ab", "c", 5), captureId("a", "bc", 5))
    assertEquals(43, captureId("com.bank", "key", 5).length)
  }
}
