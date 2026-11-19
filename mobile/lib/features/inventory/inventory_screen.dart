import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state.dart';

class InventoryScreen extends StatefulWidget {
  const InventoryScreen({super.key});

  @override
  State<InventoryScreen> createState() => _InventoryScreenState();
}

class _InventoryScreenState extends State<InventoryScreen> {
  bool lowOnly = false;

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    if (!state.canInventory) {
      return const Center(
        child: Text('Vai trò hiện tại không có quyền truy cập kho.'),
      );
    }
    final rows = lowOnly
        ? state.inventory
              .where(
                (item) =>
                    _number(item['quantity']) <=
                    _number(item['alert_threshold']),
              )
              .toList()
        : state.inventory;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: state.loadInventory,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 90),
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Chỉ hiển thị hàng sắp hết'),
              value: lowOnly,
              onChanged: (value) => setState(() => lowOnly = value),
            ),
            ...rows.map((item) {
              final low =
                  _number(item['quantity']) <= _number(item['alert_threshold']);
              final sku = item['sku']?.toString() ?? '';
              return Card(
                child: ListTile(
                  leading: CircleAvatar(
                    child: Text(sku.isEmpty ? '?' : sku[0].toUpperCase()),
                  ),
                  title: Text(item['name'].toString()),
                  subtitle: Text('$sku · ${item['branch_name']}'),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${item['quantity']}',
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                          color: low ? Colors.red : Colors.green,
                        ),
                      ),
                      Text(
                        low ? 'Sắp hết' : 'Còn hàng',
                        style: const TextStyle(fontSize: 10),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _receipt(context),
        icon: const Icon(Icons.add),
        label: const Text('Nhập hàng nhanh'),
      ),
    );
  }

  Future<void> _receipt(BuildContext context) async {
    final state = context.read<AppState>();
    int? productId;
    final quantity = TextEditingController(text: '1');
    final cost = TextEditingController();
    final sale = TextEditingController();

    await showDialog<void>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setLocal) => AlertDialog(
          title: const Text('Nhập hàng nhanh'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<int>(
                  initialValue: productId,
                  decoration: const InputDecoration(labelText: 'Sản phẩm'),
                  isExpanded: true,
                  items: state.products
                      .map(
                        (item) => DropdownMenuItem(
                          value: int.tryParse(item['id'].toString()),
                          child: Text(
                            '${item['sku']} · ${item['name']}',
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: (value) {
                    setLocal(() => productId = value);
                    final product = state.productById(value ?? 0);
                    sale.text = product['sale_price']?.toString() ?? '';
                    cost.text = product['cost_price']?.toString() ?? '';
                  },
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: quantity,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Số lượng'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: cost,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Giá nhập'),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: sale,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Giá bán'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Hủy'),
            ),
            FilledButton(
              onPressed: () async {
                try {
                  if (productId == null) {
                    throw Exception('Vui lòng chọn sản phẩm.');
                  }
                  await state.createReceipt(
                    productId: productId!,
                    quantity: int.parse(quantity.text),
                    unitCost: double.parse(cost.text),
                    salePrice: double.parse(sale.text),
                  );
                  if (dialogContext.mounted) Navigator.pop(dialogContext);
                } catch (error) {
                  if (dialogContext.mounted) {
                    ScaffoldMessenger.of(
                      dialogContext,
                    ).showSnackBar(SnackBar(content: Text(error.toString())));
                  }
                }
              },
              child: const Text('Xác nhận nhập'),
            ),
          ],
        ),
      ),
    );

    quantity.dispose();
    cost.dispose();
    sale.dispose();
  }

  static double _number(dynamic value) =>
      double.tryParse(value?.toString() ?? '') ?? 0;
}
