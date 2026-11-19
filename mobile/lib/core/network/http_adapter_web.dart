import 'package:dio/dio.dart';
import 'package:dio/browser.dart';

void configurePlatformAdapter(Dio dio) {
  dio.httpClientAdapter = BrowserHttpClientAdapter()..withCredentials = true;
}
