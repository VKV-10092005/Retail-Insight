import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/config/api_config.dart';
import '../core/network/api_client.dart';

class AppState extends ChangeNotifier {
  bool initializing = true;
  bool busy = false;
  String? error;
  Map<String, dynamic>? user;
  List<Map<String, dynamic>> branches = [];
  int? selectedBranchId;
  ThemeMode themeMode = ThemeMode.light;
  Map<String, dynamic> dashboard = {};
  Map<String, dynamic> aiSummary = {};
  List<Map<String, dynamic>> products = [];
  List<Map<String, dynamic>> categories = [];
  List<Map<String, dynamic>> inventory = [];
  Map<String, dynamic> paymentSettings = {};
  Map<String, dynamic>? supportThread;
  List<Map<String, dynamic>> supportMessages = [];
  final Map<int, int> cart = {};

  late SharedPreferences preferences;
  late ApiConfig apiConfig;
  late ApiClient api;

  bool get isAuthenticated => user != null;
  String get role => user?['role']?.toString() ?? '';
  String get baseUrl => apiConfig.baseUrl;
  bool get canSell => const ['OWNER', 'MANAGER', 'CASHIER'].contains(role);
  bool get canInventory =>
      const ['OWNER', 'MANAGER', 'INVENTORY'].contains(role);
  bool get canSeeFinancials => const ['OWNER', 'MANAGER'].contains(role);
  double get cartTotal => cart.entries.fold(
    0,
    (sum, item) => sum + _price(productById(item.key)) * item.value,
  );
  int get cartCount => cart.values.fold(0, (sum, quantity) => sum + quantity);

  Future<void> initialize() async {
    preferences = await SharedPreferences.getInstance();
    apiConfig = ApiConfig(preferences);
    api = await ApiClient.create(
      baseUrl: apiConfig.baseUrl,
      preferences: preferences,
    );
    themeMode = ThemeMode
        .values[preferences.getInt('theme_mode') ?? ThemeMode.light.index];
    selectedBranchId = preferences.getInt('selected_branch_id');
    try {
      await _loadMe();
      await refreshAll();
    } catch (_) {
      user = null;
    }
    initializing = false;
    notifyListeners();
  }

  Future<void> updateServerUrl(String value) async {
    final url = await apiConfig.save(value);
    api.updateBaseUrl(url);
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    await _guard(() async {
      await api.post(
        '/auth/login',
        data: {'email': email.trim(), 'password': password},
      );
      await _loadMe();
      await refreshAll();
    });
  }

  Future<void> _loadMe() async {
    final data = Map<String, dynamic>.from(await api.get('/auth/me'));
    user = Map<String, dynamic>.from(data['user'] as Map);
    branches = ((user!['branches'] as List?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();
    final valid = branches.any(
      (branch) => _int(branch['id']) == selectedBranchId,
    );
    if (!valid) {
      selectedBranchId =
          _int(user!['branch_id']) ??
          (branches.isNotEmpty ? _int(branches.first['id']) : null);
    }
    if (selectedBranchId != null) {
      await preferences.setInt('selected_branch_id', selectedBranchId!);
    }
  }

  Future<void> selectBranch(int id) async {
    selectedBranchId = id;
    await preferences.setInt('selected_branch_id', id);
    cart.clear();
    await refreshAll();
  }

  Future<void> refreshAll() async {
    if (user == null) return;
    await Future.wait([
      loadDashboard(),
      loadProducts(),
      if (canInventory) loadInventory(),
      loadSupport(),
    ]);
  }

  Map<String, dynamic> get _branchQuery =>
      selectedBranchId == null ? {} : {'branch_id': selectedBranchId};

  Future<void> loadDashboard() async {
    try {
      if (canSeeFinancials) {
        dashboard = Map<String, dynamic>.from(
          await api.get('/bi/overview', query: {..._branchQuery, 'limit': 100}),
        );
        try {
          aiSummary = Map<String, dynamic>.from(
            await api.get('/ai/summary', query: _branchQuery),
          );
        } catch (_) {
          aiSummary = {};
        }
      } else if (role == 'CASHIER') {
        final data = Map<String, dynamic>.from(
          await api.get('/sales', query: {..._branchQuery, 'limit': 100}),
        );
        final rows = (data['items'] as List?) ?? [];
        final revenue = rows.fold<double>(
          0,
          (sum, row) => sum + _double((row as Map)['total']),
        );
        dashboard = {
          'kpi': {'net_revenue': revenue, 'orders': rows.length},
        };
      }
    } catch (_) {
      dashboard = {};
    }
    notifyListeners();
  }

  Future<void> loadProducts({String query = '', int? categoryId}) async {
    if (selectedBranchId == null) return;
    try {
      final productData = Map<String, dynamic>.from(
        await api.get(
          '/products',
          query: {
            ..._branchQuery,
            'limit': 100,
            if (query.trim().isNotEmpty) 'q': query.trim(),
            'category_id': ?categoryId,
          },
        ),
      );
      final categoryData = Map<String, dynamic>.from(
        await api.get('/categories', query: _branchQuery),
      );
      products = _list(productData['items']);
      categories = _list(categoryData['items']);
      paymentSettings = Map<String, dynamic>.from(
        await api.get('/branches/$selectedBranchId/payment-settings'),
      );
    } catch (exception) {
      error = exception.toString();
    }
    notifyListeners();
  }

  Future<void> loadInventory({bool lowOnly = false}) async {
    if (!canInventory || selectedBranchId == null) return;
    try {
      final data = Map<String, dynamic>.from(
        await api.get('/inventory', query: {..._branchQuery, 'limit': 100}),
      );
      final rows = _list(data['items']);
      inventory = lowOnly
          ? rows
                .where(
                  (row) =>
                      _double(row['quantity']) <=
                      _double(row['alert_threshold']),
                )
                .toList()
          : rows;
    } catch (exception) {
      error = exception.toString();
    }
    notifyListeners();
  }

  Map<String, dynamic> productById(int id) =>
      products.firstWhere((item) => _int(item['id']) == id, orElse: () => {});
  int stockOf(Map<String, dynamic> product) =>
      _double(product['stock']).floor();

  void addToCart(Map<String, dynamic> product) {
    final id = _int(product['id']);
    if (id == null) return;
    final next = (cart[id] ?? 0) + 1;
    if (next > stockOf(product)) return;
    cart[id] = next;
    notifyListeners();
  }

  void changeCart(int id, int delta) {
    final next = (cart[id] ?? 0) + delta;
    final stock = stockOf(productById(id));
    if (next <= 0) {
      cart.remove(id);
    } else if (next <= stock) {
      cart[id] = next;
    }
    notifyListeners();
  }

  Future<Map<String, dynamic>> checkout(String method) async {
    if (selectedBranchId == null || cart.isEmpty) {
      throw const ApiException('Giỏ hàng đang trống.');
    }
    final payload = {
      'branch_id': selectedBranchId,
      'request_key': _requestKey(),
      'order_status': method == 'CASH' ? 'COMPLETED' : 'OPEN',
      'client_created_at': DateTime.now().toUtc().toIso8601String(),
      'payment': {
        'method': method,
        if (method == 'CASH') 'cash_received': cartTotal,
      },
      'items': cart.entries
          .map((item) => {'product_id': item.key, 'quantity': item.value})
          .toList(),
    };
    final result = Map<String, dynamic>.from(
      await api.post('/sales', data: payload),
    );
    for (final item in cart.entries) {
      final product = productById(item.key);
      product['stock'] = (stockOf(product) - item.value).clamp(0, 1 << 31);
    }
    cart.clear();
    if (method == 'BANK_TRANSFER') {
      try {
        final detail = Map<String, dynamic>.from(
          await api.get('/sales/${result['id']}'),
        );
        result.addAll(detail);
      } catch (_) {}
    }
    notifyListeners();
    unawaited(loadProducts());
    return result;
  }

  Future<void> confirmBankPayment(int saleId) async {
    await api.post('/sales/$saleId/confirm-payment', data: const {});
    await loadDashboard();
  }

  Future<void> createReceipt({
    required int productId,
    required int quantity,
    required double unitCost,
    required double salePrice,
  }) async {
    if (selectedBranchId == null) {
      throw const ApiException('Vui lòng chọn chi nhánh.');
    }
    await api.post(
      '/receipts',
      data: {
        'branch_id': selectedBranchId,
        'request_key': _requestKey(),
        'client_created_at': DateTime.now().toUtc().toIso8601String(),
        'items': [
          {
            'product_id': productId,
            'quantity': quantity,
            'unit_price': unitCost,
            'sale_price': salePrice,
          },
        ],
      },
    );
    await Future.wait([loadProducts(), loadInventory()]);
  }

  Future<void> loadSupport() async {
    if (role == 'PLATFORM_ADMIN') return;
    try {
      final data = Map<String, dynamic>.from(await api.get('/support/threads'));
      final raw = data['thread'] ?? ((data['threads'] as List?)?.firstOrNull);
      if (raw is Map) {
        supportThread = Map<String, dynamic>.from(raw);
        supportMessages = _list(supportThread!['messages']);
        if (supportThread!['id'] != null) {
          await loadSupportMessages(notify: false);
        }
      }
    } catch (_) {}
    notifyListeners();
  }

  Future<void> loadSupportMessages({bool notify = true}) async {
    final id = supportThread?['id'];
    if (id == null) return;
    try {
      final data = Map<String, dynamic>.from(
        await api.get('/support/threads/$id/messages'),
      );
      supportThread = Map<String, dynamic>.from(data['thread'] as Map);
      supportMessages = _list(data['messages']);
    } catch (_) {}
    if (notify) notifyListeners();
  }

  Future<void> sendSupportMessage(String content) async {
    final id = supportThread?['id'];
    if (id == null || content.trim().isEmpty) return;
    final optimistic = <String, dynamic>{
      'id': 'temp-${DateTime.now().microsecondsSinceEpoch}',
      'content': content.trim(),
      'sender_user_id': user?['id'],
      'sender_role': 'USER',
      'created_at': DateTime.now().toIso8601String(),
    };
    supportMessages = [...supportMessages, optimistic];
    notifyListeners();
    await api.post(
      '/support/threads/$id/messages',
      data: {'content': content.trim()},
    );
    await loadSupportMessages();
  }

  Future<void> setTheme(ThemeMode mode) async {
    themeMode = mode;
    await preferences.setInt('theme_mode', mode.index);
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.post('/auth/logout', data: const {});
    } catch (_) {}
    await preferences.remove('access_token');
    user = null;
    cart.clear();
    notifyListeners();
  }

  Future<void> _guard(Future<void> Function() action) async {
    busy = true;
    error = null;
    notifyListeners();
    try {
      await action();
    } catch (exception) {
      error = exception.toString();
      rethrow;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  static List<Map<String, dynamic>> _list(dynamic value) => value is List
      ? value
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
      : [];
  static int? _int(dynamic value) =>
      value == null ? null : int.tryParse(value.toString());
  static double _double(dynamic value) =>
      double.tryParse(value?.toString() ?? '') ?? 0;
  static double _price(Map<String, dynamic> product) =>
      _double(product['sale_price']);
  static String _requestKey() =>
      'mobile-${DateTime.now().microsecondsSinceEpoch}';
}

extension FirstOrNull<T> on List<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
