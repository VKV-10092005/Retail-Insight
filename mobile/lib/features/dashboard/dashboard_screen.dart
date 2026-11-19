import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/theme/app_theme.dart';
import '../../providers/app_state.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final kpi = Map<String, dynamic>.from(
      (state.dashboard['kpi'] as Map?) ?? {},
    );
    final money = NumberFormat.currency(
      locale: 'vi_VN',
      symbol: '₫',
      decimalDigits: 0,
    );
    final revenue = _number(kpi['net_revenue'] ?? kpi['revenue']);
    final profit = _number(kpi['gross_profit']);
    final cogs = _number(kpi['total_cogs']);
    final margin = revenue > 0 ? profit / revenue * 100 : 0.0;
    final low = state.inventory
        .where(
          (item) =>
              _number(item['quantity']) <= _number(item['alert_threshold']),
        )
        .take(6)
        .toList();

    return RefreshIndicator(
      onRefresh: state.refreshAll,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(
            'Xin chào, ${state.user?['full_name'] ?? state.user?['name'] ?? 'bạn'} 👋',
            style: Theme.of(context).textTheme.titleLarge
                ?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -.3),
          ),
          const SizedBox(height: 3),
          Text(
            'Đây là tình hình kinh doanh mới nhất của cửa hàng.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 18),
          _HeroKpiCard(
            revenue: money.format(revenue),
            profit: state.role == 'CASHIER' ? null : money.format(profit),
          ),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: MediaQuery.sizeOf(context).width > 700 ? 4 : 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 1.45,
            crossAxisSpacing: 10,
            mainAxisSpacing: 10,
            children: [
              _MetricCard(
                label: 'Đơn hàng',
                value: '${_number(kpi['orders']).round()}',
                icon: Icons.receipt_long_outlined,
                iconColor: const Color(0xFF2563EB),
                iconBackground: const Color(0xFFDBEAFE),
              ),
              if (state.role != 'CASHIER')
                _MetricCard(
                  label: 'Giá vốn',
                  value: money.format(cogs),
                  icon: Icons.inventory_2_outlined,
                  iconColor: const Color(0xFFEA580C),
                  iconBackground: const Color(0xFFFFEDD5),
                ),
              if (state.role != 'CASHIER')
                _MetricCard(
                  label: 'Tỷ suất lãi',
                  value: '${margin.toStringAsFixed(1)}%',
                  icon: Icons.trending_up_rounded,
                  iconColor: const Color(0xFF059669),
                  iconBackground: const Color(0xFFD1FAE5),
                ),
              _MetricCard(
                label: 'Cảnh báo kho',
                value: '${low.length}',
                icon: Icons.warning_amber_rounded,
                iconColor: const Color(0xFFDC2626),
                iconBackground: const Color(0xFFFEE2E2),
              ),
            ],
          ),
          const SizedBox(height: 18),
          _SectionCard(
            icon: Icons.auto_awesome_rounded,
            iconColor: AppTheme.purple,
            title: 'Dự báo thông minh',
            trailing: const _StatusPill(label: 'AI INSIGHT'),
            child: Text(
              state.aiSummary.isEmpty
                  ? 'Dữ liệu AI đang được tổng hợp. Hệ thống sẽ hiển thị khuyến nghị ngay khi sẵn sàng.'
                  : 'Trạng thái: ${state.aiSummary['status'] ?? 'Sẵn sàng'}\nCảnh báo: ${state.aiSummary['alert_count'] ?? 0} · SKU đề xuất nhập: ${state.aiSummary['recommended_sku_count'] ?? 0}',
              style: const TextStyle(height: 1.55),
            ),
          ),
          const SizedBox(height: 12),
          _SectionCard(
            icon: Icons.inventory_outlined,
            iconColor: const Color(0xFFEA580C),
            title: 'Sản phẩm sắp hết',
            trailing: Text(
              '${low.length} sản phẩm',
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: const Color(0xFFEA580C),
                fontWeight: FontWeight.w700,
              ),
            ),
            child: low.isEmpty
                ? const _EmptyInventory()
                : Column(
                    children: low
                        .map(
                          (item) => Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Row(
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFFF7ED),
                                    borderRadius: BorderRadius.circular(11),
                                  ),
                                  child: const Icon(
                                    Icons.inventory_2_outlined,
                                    size: 19,
                                    color: Color(0xFFEA580C),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        item['name'].toString(),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                      Text(
                                        item['sku'].toString(),
                                        style: Theme.of(context)
                                            .textTheme
                                            .labelSmall,
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 9,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFFEF2F2),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    'Còn ${item['quantity']}',
                                    style: const TextStyle(
                                      color: Color(0xFFDC2626),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                        .toList(),
                  ),
          ),
        ],
      ),
    );
  }

  static double _number(dynamic value) =>
      double.tryParse(value?.toString() ?? '') ?? 0;
}

class _HeroKpiCard extends StatelessWidget {
  const _HeroKpiCard({required this.revenue, required this.profit});
  final String revenue;
  final String? profit;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [AppTheme.primary, AppTheme.purple],
      ),
      borderRadius: BorderRadius.circular(22),
      boxShadow: const [
        BoxShadow(
          color: Color(0x354F46E5),
          blurRadius: 24,
          offset: Offset(0, 10),
        ),
      ],
    ),
    child: Stack(
      children: [
        Positioned(
          right: -20,
          top: -30,
          child: Icon(
            Icons.query_stats_rounded,
            size: 130,
            color: Colors.white.withValues(alpha: .08),
          ),
        ),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: .15),
                    borderRadius: BorderRadius.circular(11),
                  ),
                  child: const Icon(
                    Icons.payments_outlined,
                    color: Colors.white,
                    size: 19,
                  ),
                ),
                const SizedBox(width: 10),
                Text(
                  'DOANH THU THUẦN',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: .8),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: .8,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              revenue,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 29,
                fontWeight: FontWeight.w800,
                letterSpacing: -.7,
              ),
            ),
            if (profit != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: .14),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(
                  'Lãi gộp  $profit',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
      ],
    ),
  );
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.iconColor,
    required this.iconBackground,
  });
  final String label;
  final String value;
  final IconData icon;
  final Color iconColor;
  final Color iconBackground;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(13),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: iconBackground,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, color: iconColor, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.trailing,
    required this.child,
  });
  final IconData icon;
  final Color iconColor;
  final String title;
  final Widget trailing;
  final Widget child;

  @override
  Widget build(BuildContext context) => Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: iconColor, size: 21),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
              trailing,
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    ),
  );
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: const Color(0xFFF3E8FF),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      label,
      style: const TextStyle(
        color: AppTheme.purple,
        fontSize: 9,
        fontWeight: FontWeight.w800,
        letterSpacing: .6,
      ),
    ),
  );
}

class _EmptyInventory extends StatelessWidget {
  const _EmptyInventory();

  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(vertical: 14),
    child: const Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.check_circle_outline, color: Color(0xFF059669)),
        SizedBox(width: 8),
        Text('Tồn kho đang ở mức an toàn.'),
      ],
    ),
  );
}
