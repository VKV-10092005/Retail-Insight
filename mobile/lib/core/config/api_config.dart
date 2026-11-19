import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ApiConfig {
  ApiConfig(this.preferences);
  static const _key = 'retail_api_base_url';
  final SharedPreferences preferences;

  static String get platformDefault {
    if (kIsWeb) {
      final browserHost = Uri.base.host;
      final backendHost = browserHost.isEmpty ? '127.0.0.1' : browserHost;
      return 'http://$backendHost:3000/api/v1';
    }
    return defaultTargetPlatform == TargetPlatform.android
        ? 'http://10.0.2.2:3000/api/v1'
        : 'http://127.0.0.1:3000/api/v1';
  }

  String get baseUrl {
    final saved = preferences.getString(_key);
    if (kIsWeb &&
        Uri.base.host == 'localhost' &&
        saved == 'http://127.0.0.1:3000/api/v1') {
      return platformDefault;
    }
    return saved ?? platformDefault;
  }

  Future<String> save(String value) async {
    var normalized = value.trim().replaceAll(RegExp(r'/+$'), '');
    if (!normalized.startsWith('http://') &&
        !normalized.startsWith('https://')) {
      normalized = 'http://$normalized';
    }
    if (!normalized.endsWith('/api/v1')) normalized = '$normalized/api/v1';
    final uri = Uri.tryParse(normalized);
    if (uri == null || !uri.hasAuthority) {
      throw const FormatException('Địa chỉ máy chủ không hợp lệ.');
    }
    await preferences.setString(_key, normalized);
    return normalized;
  }

  Future<void> reset() => preferences.remove(_key);
}
