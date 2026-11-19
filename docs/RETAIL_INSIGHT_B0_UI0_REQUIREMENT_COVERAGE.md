# B0 + UI0 — Đối chiếu đặc tả bàn giao
07/11/2026. Master prompt đã đọc toàn bộ1565dòng; SHA256 ghi trong source inventory. Bảng này kiểm coverage **tài liệu**, không kiểm chức năng chạy.

## B0: mục I–XIV và17đầu ra
| Yêu cầu | Tài liệu/nguồn đối chiếu | Kết quả trong phạm vi thiết kế |
|---|---|---|
| I mục tiêu,5scenario | B0_SYSTEM_DESIGN / role-navigation trong ALIGNMENT | OWNER1branch/staff/multi-branch/multi-role/multi-org, không marketplace |
| II multi-tenant/sharedcatalog/branchprice | B0_DATA_MODEL, PERMISSIONS_CRUD; source001/002/common/catalog | giábranch là gap mới, không duplicateSKU |
| III owner/branch/staff/permissions | PERMISSIONS_CRUD, PAGE rowsP28–30/P42; catalog/auth | protectedOWNER, actionmatrix, platformplane thiếu |
| IV ImportStudio | SYSTEM_DESIGN, API_CONTRACTS, DATA_MODEL, PAGE P11–13 |3modes/live vsarchive, mapping/staging/resume/commit/identity |
| V POS/payment/shift/return | SYSTEM_DESIGN, API_CONTRACTS, PAGE P19–24 |payment≠document, UNKNOWN, manualbank, full history |
| VI stock/count/transfer/cost | SYSTEM_DESIGN, DATA_MODEL, PAGE P15–18/P25–27 |intransit, revision/rebase, WAC proposal/history snapshots |
| VII CRUD | PERMISSIONS_CRUD |14entitygroups, C/R/U/A/X/D restrictions + audit |
| VIII UItheoquymô | PERMISSIONS_CRUD, ALIGNMENT, DS |khôngépstaff, rolefirst và explicit branch |
| IX BI/AI | SYSTEM_DESIGN, CHATBOT_ARCHITECTURE, API/PAGE |calendar/source/coldstart/null/proxy/no model changes |
| X support/website service | ERROR_AND_SUPPORT_UX, CHATBOT_ARCHITECTURE |ticket/service opt-in, nofakecontacts/marketplace |
| XI ERD/API | B0_DATA_MODEL, B0_API_CONTRACTS |logical table aliases/reuse, columns/types/PK/FK/UK, payload/status/TX |
| XII tests | B0_TEST_AND_ROADMAP T01–35 |mock/integration/native distinctions; NOT RUN |
| XIII protectionP0–P1.4 | all headers + ALIGNMENT + manifest |only docs, source hashes, RC2 stays not executable |
| XIV17deliverables |5B0docs +8UI0docs +ALIGNMENT/inventory/matrix |inventory/gaps/architecture/scales/import/POS/stock/permissions/CRUD/ERD/API/flows/roleUI/tests/P14risk/roadmap/decisions |

## UI0: mục1–21,8file bắt buộc
| Phạm vi | Tài liệu/board | Tình trạng |
|---|---|---|
|1,2 goals/reference | FRONTEND_UI_AUDIT, SOURCE_INVENTORY |source/oldbaselinePNG;2referenceURLs read, original3referenceimages unavailable |
|3 visual A/B/C | RETAIL_INSIGHT_DESIGN_SYSTEM, CONCEPTS.svg |3originalconcepts;C recommended, chưa approval |
|4 sharedDS | RETAIL_INSIGHT_DESIGN_SYSTEM |tokens/components/interaction states/keyboard/theme |
|5 publiclanding | DS/ALIGNMENT/PAGE P01/UIroadmap |/welcome mới đềxuất,10sections +footer mô tả dưới đây |
|6,7 effects/loading | MOTION_AND_PERFORMANCE_BUDGET |all12groups chọn/hoãn, nofakeprogress/noPOSintro |
|8 robot | ROBOT_AI_ASSISTANT_SPEC, ROBOT_STATES.svg |8states, static/reducedmotion/brandoriginal |
|9 chatbot | CHATBOT_ARCHITECTURE |readinessinventory/FAQ vsbusiness/read-only contract/security/cost |
|10 ownerdashboard | DS/PAGE P06 + audit actualDashboard |KPI honest, optionalstaff/onboarding, source/as_of |
|11 roleUI | PERMISSIONS_CRUD/ALIGNMENT/PAGE |backend permissions, ADMIN gap explicit |
|12 importworkspace | SYSTEM_DESIGN/PAGE P11–13 +API |upload/mapping/grid/autosave/resume/commit counts |
|13 POS | SYSTEM_DESIGN/PAGE P19–24 +DS |fastcart/scan/paymentUNKNOWN, noblockchat |
|14 management CRUD | PERMISSIONS_CRUD/PAGE P08–30 |list/detail/actions/archive/restore/versionconflict |
|15 errorpages | ERROR_AND_SUPPORT_UX/PAGE P44–50 |401/403/404/500/503/offline/maintenance |
|16 contacts/support | ERROR_AND_SUPPORT_UX |configuredcontact only; ticket newAPI not sentfake |
|17 onboarding | ERROR_AND_SUPPORT_UX/PAGE P05 |optionalsteps, owneralonenotforcedstaff |
|18 quality | MOTION_AND_PERFORMANCE_BUDGET |budgets targets,9opaquecontrastchecks, runtimeUNKNOWN |
|19 UI1–UI6 | UI_IMPLEMENTATION_ROADMAP +dependencygraph |incremental slices, no rewrite/autostart |
|20 constraints | ALIGNMENT/manifest |no code/DB/weights/infra/P1.4activation |
|21 eightoutputs |eight exact docnames in ALIGNMENT index |đủ8file, linked toB0source/contracts |

## Landing content outline để review (không chỉ hero)
Hero: “Quản lý rõ ràng. Quyết định có dữ liệu.” CTA “Bắt đầu sử dụng”→/register, “Khám phá tính năng”→sections; secondary login. Dashboard preview phải gắn nhãn “Bản thiết kế minh họa”, không sốtest/revenue/customer giả.
Các section:1giới thiệu bài toán bánlẻ;2một cửa hàng/nhiềubranch;3importExcel/CSV có review;4POS tại quầy;5tồn/doanhthu/nguồn;6AI readiness/forecast;7replenishment là gợiý cần review;8bắtđầu khôngbắtstaff;9FAQ;10help/support; footerpolicy/contact từ config được xácnhận. Features chưa shipped phải ghi “Lộ trình đề xuất”, không marketingnhư đangcó.
Cinematic chỉ hero vàshortreveal; publiccontent không cần quyền xem sales. Không copy logo/contact/illustration đối thủ hoặc renderFAQ script nhưBusinessLLM.

## Quyết định coverage chưa là approval
Mọi đề xuất DB/TX được phân lớp theo B1–B6 và data/API/permissions matrices. Không yêu cầu runtime/native trong B0, nên absence of data/model/ACL thực ghi UNKNOWN/BLOCKED thay vì bỏ qua. 50hàngbusiness-to-UImatrix dùng cùng bộrows; acceptance các phase sau là dự kiến. Không thêm screenshot mới, animation package hoặc code frontend để “chứng minh” thiết kế.
