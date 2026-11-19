import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'http_adapter_stub.dart' if (dart.library.html) 'http_adapter_web.dart';

class ApiException implements Exception {
  const ApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient._(this.dio, this.preferences);
  final Dio dio;
  final SharedPreferences preferences;

  static Future<ApiClient> create({
    required String baseUrl,
    required SharedPreferences preferences,
  }) async {
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 12),
        receiveTimeout: const Duration(seconds: 20),
        headers: const {
          'Accept': 'application/json',
          'X-Requested-With': 'retail-web',
        },
      ),
    );
    configurePlatformAdapter(dio);
    if (!kIsWeb) {
      final directory = await getApplicationSupportDirectory();
      final jar = PersistCookieJar(
        storage: FileStorage('${directory.path}/retail_insight_cookies'),
      );
      dio.interceptors.add(CookieManager(jar));
    }
    final client = ApiClient._(dio, preferences);
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = preferences.getString('access_token');
          final branchId = preferences.getInt('selected_branch_id');
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          if (branchId != null) {
            options.headers['X-Branch-Id'] = branchId.toString();
          }
          handler.next(options);
        },
        onError: (error, handler) {
          final data = error.response?.data;
          final message = data is Map && data['message'] != null
              ? data['message'].toString()
              : error.type == DioExceptionType.connectionError ||
                    error.type == DioExceptionType.connectionTimeout
              ? 'Không thể kết nối máy chủ. Hãy kiểm tra địa chỉ IP và Wi-Fi.'
              : 'Có lỗi xảy ra khi trao đổi với máy chủ.';
          handler.reject(
            DioException(
              requestOptions: error.requestOptions,
              response: error.response,
              type: error.type,
              error: ApiException(
                message,
                statusCode: error.response?.statusCode,
              ),
            ),
          );
        },
      ),
    );
    return client;
  }

  void updateBaseUrl(String value) => dio.options.baseUrl = value;

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    try {
      return (await dio.get(path, queryParameters: query)).data;
    } on DioException catch (error) {
      throw error.error is ApiException
          ? error.error!
          : ApiException(error.message ?? 'Lỗi kết nối.');
    }
  }

  Future<dynamic> post(String path, {Object? data}) async {
    try {
      final response = await dio.post(path, data: data);
      if (response.data is Map && response.data['access_token'] != null) {
        await preferences.setString(
          'access_token',
          response.data['access_token'].toString(),
        );
      }
      return response.data;
    } on DioException catch (error) {
      throw error.error is ApiException
          ? error.error!
          : ApiException(error.message ?? 'Lỗi kết nối.');
    }
  }
}
