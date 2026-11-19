import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/app_state.dart';
import '../dashboard/dashboard_screen.dart';
import '../inventory/inventory_screen.dart';
import '../pos/pos_screen.dart';
import '../support/support_and_profile_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int index = 0;
  static const screens = [
    DashboardScreen(),
    PosScreen(),
    InventoryScreen(),
    SupportAndProfileScreen(),
  ];
  static const titles = [
    'Tổng quan',
    'Bán hàng POS',
    'Kho & Nhập hàng',
    'Hỗ trợ & Cá nhân',
  ];

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(
        title: Text(
          titles[index],
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
        actions: [
          if (state.role == 'OWNER' && state.branches.isNotEmpty)
            DropdownButtonHideUnderline(
              child: DropdownButton<int>(
                value: state.selectedBranchId,
                icon: const Icon(Icons.expand_more),
                items: state.branches
                    .map(
                      (branch) => DropdownMenuItem(
                        value: int.tryParse(branch['id'].toString()),
                        child: Text(
                          branch['name'].toString(),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) state.selectBranch(value);
                },
              ),
            ),
          IconButton(
            onPressed: state.refreshAll,
            icon: const Icon(Icons.refresh),
            tooltip: 'Làm mới',
          ),
        ],
      ),
      body: IndexedStack(index: index, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Tổng quan',
          ),
          NavigationDestination(
            icon: Icon(Icons.point_of_sale_outlined),
            selectedIcon: Icon(Icons.point_of_sale),
            label: 'POS',
          ),
          NavigationDestination(
            icon: Icon(Icons.inventory_2_outlined),
            selectedIcon: Icon(Icons.inventory_2),
            label: 'Kho',
          ),
          NavigationDestination(
            icon: Icon(Icons.support_agent_outlined),
            selectedIcon: Icon(Icons.support_agent),
            label: 'Hỗ trợ',
          ),
        ],
      ),
    );
  }
}
