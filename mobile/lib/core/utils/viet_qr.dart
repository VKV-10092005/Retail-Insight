class VietQr {
  static String _tlv(String id, String value) =>
      '$id${value.length.toString().padLeft(2, '0')}$value';

  static String build({
    required String bankBin,
    required String accountNumber,
    required double amount,
    required String reference,
  }) {
    final beneficiary =
        _tlv('00', bankBin.replaceAll(RegExp(r'\D'), '')) +
        _tlv('01', accountNumber.trim());
    final merchant = _tlv('00', 'A000000727') + _tlv('01', beneficiary);
    final sanitizedReference = reference.toUpperCase().replaceAll(
      RegExp(r'[^A-Z0-9 ]'),
      '',
    );
    final cleanReference = sanitizedReference.substring(
      0,
      sanitizedReference.length > 25 ? 25 : sanitizedReference.length,
    );
    final payload =
        '000201010212${_tlv('38', merchant)}5303704${_tlv('54', amount.toStringAsFixed(0))}5802VN${_tlv('62', _tlv('08', cleanReference))}6304';
    return '$payload${_crc16(payload)}';
  }

  static String _crc16(String value) {
    var crc = 0xFFFF;
    for (final byte in value.codeUnits) {
      crc ^= byte << 8;
      for (var bit = 0; bit < 8; bit++) {
        crc = (crc & 0x8000) != 0
            ? ((crc << 1) ^ 0x1021) & 0xFFFF
            : (crc << 1) & 0xFFFF;
      }
    }
    return crc.toRadixString(16).padLeft(4, '0').toUpperCase();
  }
}
