import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/theme/app_theme.dart';
import '../../core/utils/viet_qr.dart';
import '../../providers/app_state.dart';

class PosScreen extends StatefulWidget {
  const PosScreen({super.key});
  @override
  State<PosScreen> createState() => _PosScreenState();
}

class _PosScreenState extends State<PosScreen> {
  final search = TextEditingController();
  int? categoryId;

  @override
  void dispose() {
    search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        money = NumberFormat.currency(
          locale: 'vi_VN',
          symbol: '₫',
          decimalDigits: 0,
        );
    if (!state.canSell) {
      return const _NoPermission(
        message: 'Vai trò hiện tại không có quyền bán hàng POS.',
      );
    }
    if (state.selectedBranchId == null) {
      return const _NoPermission(
        message: 'Vui lòng chọn chi nhánh để bán hàng.',
      );
    }
    return Stack(
      children: [
        Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
              child: Row(
                children: [
                  Expanded(
                    child: SearchBar(
                      controller: search,
                      hintText: 'Tìm tên hoặc mã SKU',
                      leading: const Icon(Icons.search),
                      onSubmitted: (value) => state.loadProducts(
                        query: value,
                        categoryId: categoryId,
                      ),
                      trailing: [
                        IconButton(
                          onPressed: () {
                            search.clear();
                            state.loadProducts(categoryId: categoryId);
                          },
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  PopupMenuButton<int?>(
                    icon: const Icon(Icons.filter_list),
                    tooltip: 'Danh mục',
                    onSelected: (value) {
                      setState(() => categoryId = value);
                      state.loadProducts(query: search.text, categoryId: value);
                    },
                    itemBuilder: (_) => [
                      const PopupMenuItem(
                        value: null,
                        child: Text('Tất cả danh mục'),
                      ),
                      ...state.categories.map(
                        (item) => PopupMenuItem(
                          value: int.tryParse(item['id'].toString()),
                          child: Text(item['name'].toString()),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => state.loadProducts(
                  query: search.text,
                  categoryId: categoryId,
                ),
                child: GridView.builder(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 112),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: MediaQuery.sizeOf(context).width > 700
                        ? 4
                        : 2,
                    childAspectRatio: .78,
                    crossAxisSpacing: 10,
                    mainAxisSpacing: 10,
                  ),
                  itemCount: state.products.length,
                  itemBuilder: (_, index) {
                    final product = state.products[index];
                    return _ProductCard(
                      product: product,
                      stock: state.stockOf(product),
                      money: money,
                      onAdd: () => state.addToCart(product),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 12,
          child: _CartSummary(
            count: state.cartCount,
            total: money.format(state.cartTotal),
            onCheckout: state.cart.isEmpty ? null : () => _showCart(context),
          ),
        ),
      ],
    );
  }

  void _showCart(BuildContext context) => showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => ChangeNotifierProvider.value(
      value: context.read<AppState>(),
      child: const _CartSheet(),
    ),
  );
}

class _ProductCard extends StatelessWidget {
  const _ProductCard({
    required this.product,
    required this.stock,
    required this.money,
    required this.onAdd,
  });

  final Map<String, dynamic> product;
  final int stock;
  final NumberFormat money;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final disabled = stock <= 0;
    final stockColor = disabled
        ? const Color(0xFFDC2626)
        : stock <= 5
        ? const Color(0xFFEA580C)
        : const Color(0xFF059669);
    final stockBackground = disabled
        ? const Color(0xFFFEF2F2)
        : stock <= 5
        ? const Color(0xFFFFF7ED)
        : const Color(0xFFECFDF5);
    final price = double.tryParse(product['sale_price']?.toString() ?? '') ?? 0;

    return Card(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: disabled ? null : onAdd,
        child: Padding(
          padding: const EdgeInsets.all(11),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                height: 76,
                width: double.infinity,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppTheme.primary.withValues(alpha: .08),
                      AppTheme.purple.withValues(alpha: .13),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Stack(
                  children: [
                    const Center(
                      child: Icon(
                        Icons.inventory_2_outlined,
                        size: 38,
                        color: AppTheme.primary,
                      ),
                    ),
                    Positioned(
                      top: 7,
                      right: 7,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: stockBackground,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          disabled ? 'Hết hàng' : 'Tồn $stock',
                          style: TextStyle(
                            color: stockColor,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 9),
              Text(
                product['name'].toString(),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 2),
              Text(
                product['sku'].toString(),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelSmall
                    ?.copyWith(color: const Color(0xFF94A3B8)),
              ),
              const Spacer(),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      money.format(price),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.primary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 5),
                  Material(
                    color: disabled
                        ? const Color(0xFFE2E8F0)
                        : AppTheme.primary,
                    borderRadius: BorderRadius.circular(10),
                    child: InkWell(
                      onTap: disabled ? null : onAdd,
                      borderRadius: BorderRadius.circular(10),
                      child: const SizedBox(
                        width: 34,
                        height: 34,
                        child: Icon(
                          Icons.add_rounded,
                          color: Colors.white,
                          size: 21,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CartSummary extends StatelessWidget {
  const _CartSummary({
    required this.count,
    required this.total,
    required this.onCheckout,
  });
  final int count;
  final String total;
  final VoidCallback? onCheckout;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(14, 10, 10, 10),
    decoration: BoxDecoration(
      color: Theme.of(context).brightness == Brightness.light
          ? Colors.white
          : const Color(0xFF172033),
      borderRadius: BorderRadius.circular(18),
      border: Border.all(
        color: Theme.of(context).brightness == Brightness.light
            ? AppTheme.border
            : Theme.of(context).colorScheme.outlineVariant,
      ),
      boxShadow: const [
        BoxShadow(
          color: Color(0x240F172A),
          blurRadius: 22,
          offset: Offset(0, 8),
        ),
      ],
    ),
    child: Row(
      children: [
        Stack(
          clipBehavior: Clip.none,
          children: [
            const Icon(
              Icons.shopping_bag_outlined,
              color: AppTheme.primary,
              size: 25,
            ),
            if (count > 0)
              Positioned(
                top: -8,
                right: -9,
                child: Container(
                  constraints: const BoxConstraints(minWidth: 17),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 4,
                    vertical: 2,
                  ),
                  decoration: const BoxDecoration(
                    color: Color(0xFFEF4444),
                    shape: BoxShape.circle,
                  ),
                  child: Text(
                    '$count',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '$count sản phẩm',
                style: Theme.of(context).textTheme.labelSmall,
              ),
              Text(
                total,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        FilledButton(
          onPressed: onCheckout,
          style: FilledButton.styleFrom(
            minimumSize: const Size(126, 46),
            padding: const EdgeInsets.symmetric(horizontal: 13),
          ),
          child: const Text('Thanh toán →'),
        ),
      ],
    ),
  );
}

class _CartSheet extends StatefulWidget {
  const _CartSheet();
  @override
  State<_CartSheet> createState() => _CartSheetState();
}

class _CartSheetState extends State<_CartSheet> {
  String payment = 'CASH';
  bool paying = false;
  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>(),
        money = NumberFormat.currency(
          locale: 'vi_VN',
          symbol: '₫',
          decimalDigits: 0,
        );
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          18,
          0,
          18,
          MediaQuery.viewInsetsOf(context).bottom + 18,
        ),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * .7,
          child: Column(
            children: [
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Giỏ hàng',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView(
                  children: state.cart.entries.map((entry) {
                    final product = state.productById(entry.key);
                    return ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(product['name']?.toString() ?? ''),
                      subtitle: Text(
                        money.format(
                          (double.tryParse(
                                    product['sale_price']?.toString() ?? '',
                                  ) ??
                                  0) *
                              entry.value,
                        ),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            onPressed: () => state.changeCart(entry.key, -1),
                            icon: const Icon(Icons.remove_circle_outline),
                          ),
                          Text(
                            '${entry.value}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          IconButton(
                            onPressed: () => state.changeCart(entry.key, 1),
                            icon: const Icon(Icons.add_circle_outline),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                ),
              ),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(
                    value: 'CASH',
                    icon: Icon(Icons.payments_outlined),
                    label: Text('Tiền mặt'),
                  ),
                  ButtonSegment(
                    value: 'BANK_TRANSFER',
                    icon: Icon(Icons.qr_code),
                    label: Text('Chuyển khoản'),
                  ),
                ],
                selected: {payment},
                onSelectionChanged: (value) =>
                    setState(() => payment = value.first),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: paying || state.cart.isEmpty
                      ? null
                      : () => _pay(context, state),
                  child: Text(
                    paying
                        ? 'Đang xử lý…'
                        : 'Thanh toán ${money.format(state.cartTotal)}',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pay(BuildContext context, AppState state) async {
    setState(() => paying = true);
    try {
      final result = await state.checkout(payment);
      if (!context.mounted) return;
      Navigator.pop(context);
      if (payment == 'BANK_TRANSFER') {
        await _showBankQr(context, state, result);
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Thanh toán thành công. Tồn kho đã được cập nhật.'),
          ),
        );
      }
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.toString())));
      }
    } finally {
      if (mounted) setState(() => paying = false);
    }
  }

  Future<void> _showBankQr(
    BuildContext context,
    AppState state,
    Map<String, dynamic> result,
  ) async {
    final settings = state.paymentSettings,
        document = Map<String, dynamic>.from(
          (result['document'] as Map?) ?? result,
        );
    final id = int.tryParse((document['id'] ?? result['id']).toString()) ?? 0;
    final total =
        double.tryParse(
          (document['total'] ?? result['total'] ?? 0).toString(),
        ) ??
        0;
    final reference = result['payment_reference']?.toString() ?? 'RI-$id';
    final bin = settings['bank_bin']?.toString() ?? '',
        account = settings['bank_account_number']?.toString() ?? '';
    final payload = bin.isNotEmpty && account.isNotEmpty
        ? VietQr.build(
            bankBin: bin,
            accountNumber: account,
            amount: total,
            reference: reference,
          )
        : null;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Quét mã VietQR'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (payload != null)
              QrImageView(
                data: payload,
                size: 220,
                backgroundColor: Colors.white,
              )
            else if ((settings['static_qr_url']?.toString() ?? '').isNotEmpty)
              Image.network(
                settings['static_qr_url'].toString(),
                width: 220,
                height: 220,
                errorBuilder: (_, _, _) =>
                    const Text('Không tải được ảnh QR. Vui lòng thu tiền mặt.'),
              )
            else
              const Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  'Chi nhánh chưa cấu hình tài khoản ngân hàng. Vui lòng thu tiền mặt.',
                ),
              ),
            const SizedBox(height: 12),
            Text(
              NumberFormat.currency(
                locale: 'vi_VN',
                symbol: '₫',
                decimalDigits: 0,
              ).format(total),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            SelectableText('Nội dung: $reference'),
            if ((settings['bank_account_name']?.toString() ?? '').isNotEmpty)
              Text(settings['bank_account_name'].toString()),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: const Text('Để sau'),
          ),
          FilledButton(
            onPressed: payload == null
                ? null
                : () async {
                    try {
                      await state.confirmBankPayment(id);
                      if (dialogContext.mounted) Navigator.pop(dialogContext);
                    } catch (error) {
                      if (dialogContext.mounted) {
                        ScaffoldMessenger.of(dialogContext).showSnackBar(
                          SnackBar(content: Text(error.toString())),
                        );
                      }
                    }
                  },
            child: const Text('Đã nhận tiền'),
          ),
        ],
      ),
    );
  }
}

class _NoPermission extends StatelessWidget {
  const _NoPermission({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Text(message, textAlign: TextAlign.center),
    ),
  );
}
