# UI0 — Roadmap UI1–UI6 liên kết B1–B6
07/11/2026. **Chưa phê duyệt code.** [B0 roadmap/tests](RETAIL_INSIGHT_B0_TEST_AND_ROADMAP.md), [alignment](RETAIL_INSIGHT_B0_UI0_ALIGNMENT.md).

| Phase đề xuất | Bàn giao sau approval riêng | Dependency / gate | Acceptance / rollback |
|---|---|---|---|
| UI1 Design System | tokens light/dark, typography, Button/Input/Dialog/Table primitives, layout baseline | duyệt conceptC, existingroute/importgraph baseline; không DB | component states/keyboard/VI/contrast tests; feature toggles route-local, oldstyles fallback, không đổi endpoints |
| UI2 Public Experience | /welcome landing, auth polish, onboarding read status, loading/error/help contact views | authregister/me contract giữ nguyên; config contact thật hoặc unavailable | không fake metrics/AI, login/register/logout regression; giữ / authenticateddashboard, root đổi chỉ approval riêng |
| UI3 Application Shell | role-aware sidebar/topbar, branchcontext, dashboard states/account/common help | B1 capabilities mapping, permission source-of-truth, P1.3 calendar | OWNER1branch/CASHIER/INVENTORY/multi-scope, no unauthorized fetch; branchswitch draftguard; not menu-only security |
| UI4 Business Workspaces | theo lát: catalog→receipt→import→POS→shift/payment→counts/transfers→report/AI | B2prices; B3staging; B4payment/shift; B5cost/count/transfer; P1.4 gates riêng | mỗi lát contract/economic oracle + mock/integration/native proof tương ứng; chưa backend thì chỉ gated unavailable không fake |
| UI5 Robot & Chatbot | original static/animated robot, FAQ/search, conversationpanel, supporthandoff | B6KB/API/ACL/quotas/approvedprovider nếuLLM; help có thểđi trước businessAI |8states, no economictools/injectionleak, accessiblepanel, noPOSEclipse; degrade toFAQ/unavailable |
| UI6 Polish & QA | motion/refinedresponsive, perf/a11y/visualregression/E2E | featurefunctional từB phases, approvedtestenvironment | targetdevices/darklight/reducedmotion, budgetsmeasured; zero data/tenant regression; do not declare capacity fromUIDemo |

## Thứ tự có thể kiểm thử
1. Freeze semantic contracts trước: source oftruthpermissions, payment≠sale, branchprice/newintent/calendar, source labels. OWNER duyệt các conflict ởalignment.
2. Sau approvalUI1: component-only work không network, compile/bundle compare; baseline screenshots từ disposable được phép, không login production để có ảnh.
3. UI2/3 tận dụng API hiện có; giữ link /sales,/inventory,/reports và /research aliases. /account mới cần role-access contract; /settings owner-only không tự broaden thành adminplane.
4. B1/B2→UI4catalog slice: branchoffer/pricepermission, backendvalidated read fields; nochart redesign ảnh hưởng same-item filters.
5. B3→importStudio slice: fullpreview/staging/save/resume/commit outcomes; modelhistory/importanalytics vẫn OFF.
6. B4→POS/payment/shifts slice: manualcash/bank confirm, stableintent/UNKNOWNlookup, concurrency native gates trước realusers.
7. B5→count/transfer/refund/cost slice; các màn“profit” chỉ khi validcostsnapshots, không tính từ catalogreference.
8. UI5FAQ/robot tách rollout; businesschat chỉ sau scopedreadonly tools và inference/data-sharing consent.
9. UI6complete crossrolecrossdevice regression, performance/a11y fieldvalidation, docs/capability/versionmanifest.

Mỗi PR tương lai tách design-system appearance và transaction/API changes để review; source preservation củaB0 không tự yêu cầu một lần rewrite. Không dùng frontend rollback để bỏ writer_epoch fence hoặc undo posted document. NativeP1.4 activation/migrations/infra approvals vẫn độc lập.
Đối với component legacy demo: audit import graph trước removal, có redirect/backwardcompat và approval, không “dọn” bằng xóa page mock ngay khi thay shell.
Không ước lượng ngày cam kết/chi phí library chưa đo; lên effort/timeline sau approved scope và native readiness, không chờđủ6/12tháng AI đểshipPOScơbản.
**STOP UI0: chờ duyệt concept, role/cost/payment/source contracts và phase tiếp theo. Không triển khai UI1 trong lượt này.**
