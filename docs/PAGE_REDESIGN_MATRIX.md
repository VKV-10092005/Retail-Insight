# UI0 — Page redesign và business-to-UI matrix
07/11/2026. 50 hàng, bao phủ routes active, aliases, legacy và chức năng đề xuất. Không runtime verification. O=OWNER,M=MANAGER,C=CASHIER,I=INVENTORY; quyền hành động ở [B0 permissions](RETAIL_INSIGHT_B0_PERMISSIONS_CRUD.md). Route/API “chưa có” không là tính năng đã triển khai.

## State profiles (mỗi hàng phải áp dụng đầy đủ)
| Profile | Empty | Loading | Error/denied/unknown | Success |
|---|---|---|---|---|
| SINFO | chưa có dữ liệu/config có chú giải | text/skeleton không progressfake | service unavailable/permission phù hợp | điều hướng/nội dung thật, không fake metric |
| SFORM | form trống có help | load options/save busy rõ | field errors/focus/If-Match conflict, giữ input | serverID/version/status + message |
| SONBOARD | checklist theo capability | load readiness | denied/unavailable step không ép dùng | state từ server, optional steps bỏqua |
| SREAD | no records khác filteredzero | skeleton hoặc stale read cóas_of | scope denied/network retry read-only | rows/KPI/source/calendar đồngnhất |
| SIMPORT | upload/mapping chưa có | realbyte/validation progress hoặc indeterminate | rowerrors/stale preview/autosaveconflict/UNKNOWN commit | created/updated/skipped/chunkcounts frozen; stock effect rõ |
| SPOST | draft/chưa chọnbranch | server validation/commit busy | stock/period/version conflict; UNKNOWN dùng samekey lookup | postedID/receipt/audit timeline, không tự newintent |
| SPOS | giỏtrống + scan hint | search/reprice/payment pending | offline/outofstock/denied/unknownpayment | server doc/payment confirmed riêng; print không postlại |
| SAI | missinghistory/stock/model, không0 | typed inferencepending | serviceerror/insufficient vs requestfailure | model/as_of/calendar/scope+output, metricsnull được giữ |
| SHELP | noarticle/history | actual FAQsearch/response pending | unavailable/backendabsent/injectiondeny | response_type/citations hoặc201ticket |
| SERROR | no entity details | bounded statuslookup | safe recovery, preserveforms, no sensitive info | route/scope recovered, no economicduplicate |

## Responsive/accessibility profiles
R1: single-column360px, formmax480desktop; A1: visiblelabels, focus-visible/order, dialogtrap, live status, safeCTA.
R2: desktoptable/cards, tabletstack, mobile labeled scrollregion/detaildrawer; A2: th/caption/tabularnumbers, accessible charttable, perrowaction names.
R3: wide import/count grid, tablet columnchooser/mobile rowdrawer; A3: keyboard navigation/edit modes, error-cell summary links, screenreader-friendly pagedalternative.
R4: desktop/tabletPOSsplit, mobile carttab + safe-areapayment, nooverlays; A4: scanner scope/shortcuts không cướp textentry, logical focus, large touch controls.
R5: desktophelp/chatpanel, mobile full drawer; A5: named panel, focusreturn, source/status announcements không đọc mỗi token.
Profile là thiết kế cần kiểm ởUI6, không kết luận responsive/AA đãđạt vì CSS có mediaquery.

| ID | Business flow | Actor/quyền | Route hiện có | API hiện có | Data source | Trạng thái | UI đề xuất | E/L/Error/Success | Responsive/A11y | Priority | Dependency | Acceptance |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P01 | Landing công khai | Public | Chưa có; / đang protected | Không | Không | MISSING | /welcome cinematic, preview có nhãn | SINFO | R1/A1 | P1 | UI2 | Landing không fake số/khách hàng; root bookmark giữ |
| P02 | Đăng nhập | All | /login | POST auth/login; GET auth/me | users/auth_sessions | VERIFIED_IN_SOURCE | Auth form DS + status typed | SFORM | R1/A1 | P0 | UI1/2 | 401 không leak email; keyboard submit |
| P03 | Đăng ký org+branch | Public | /register | POST auth/register | org/user/branch/assignment | VERIFIED_IN_SOURCE | Owner1branch, 201→login | SFORM | R1/A1 | P0 | UI2+B1 | Không ép staff hoặc tự login |
| P04 | Khôi phục mật khẩu | Public | /forgot-password | POST auth/forgot-password→503 | Email delivery chưa có | PARTIAL | Unavailable rõ, contact config | SINFO | R1/A1 | P1 | UI2+email | Không báo đã gửi email giả |
| P05 | Onboarding | OWNER | Chưa có | Chỉ register/me hiện có | Org/branch; progress thiếu | PARTIAL | Checklist progressive optionalstaff | SONBOARD | R1/A1 | P1 | B1/UI2 | Không yêu cầu thêm OWNER/cashier account |
| P06 | Dashboard org/branch | O/M; staff greeting | / | GET bi/overview; dashboard/overview | docs/items/balances | VERIFIED_IN_SOURCE | KPI source/as_of, null≠0, quickactions | SREAD | R2/A2 | P0 | UI3/P1.3 | Scope và date/stock labels không đổi |
| P07 | Reports BI | O/M | /reports→Dashboard | GET bi/overview | Read snapshot | PARTIAL | Dedicated reports; export gated | SREAD | R2/A2 | P1 | UI4+B6 | Không gọi revenue thành profit hoặc reportfreeze |
| P08 | Catalog list/detail | All view; O/M edit hiện tại | /products | GET/POST/PUT products | products/categories | PARTIAL | List+detail+archive rõ context | SREAD | R2/A2 | P0 | B2/UI4 | MANAGER org mutation policy duyệt; no stock edit |
| P09 | Product create/edit | O/M; /new chỉO hiện tại | /products/new→Products | POST/PUT products | Shared catalog | PARTIAL | Guided typed fields, no fakeAI attrs | SFORM | R1/A1 | P0 | B2/UI4 | Invalid JSON không mất form; no duplicateSKU |
| P10 | Danh mục | O/M hiện tại | Embedded /products | GET/POST categories | categories | PARTIAL | CRUD+referenced archive state | SFORM | R2/A2 | P1 | B2/UI4 | Referenced category không cascade delete |
| P11 | Import CSV hiện tại | O/M | Embedded /products | POST products/import | Create-only products | PARTIAL | Giữ CSV flow, không nhãn nhận hàng | SIMPORT | R2/A3 | P0 | UI4 | 200row/60KB; preview khôngstock |
| P12 | Import Studio | Mode/action scoped | Chưa có | Staging/mapping/session APIs thiếu | Staging đề xuất | MISSING | Sheet/mapping/grid/autosave/resume | SIMPORT | R3/A3 | P0 | B3/UI4/P1.4 gate | Rời trang/resume không mất draft; commit onlyonce |
| P13 | Opening stock | O + explicit approver | Chưa có | Opening confirm thiếu | Opening identity/posted docs đề xuất | MISSING | Init stock khác receipt/history | SPOST | R2/A1 | P0 | B3/B5/P1.4 | Repeat opening không cộng lặp |
| P14 | Giá/sellability branch | O; M delegated | Chưa có | Branch offers API thiếu | branch_products thiếu | MISSING | Price inheritance/override/version diff | SFORM | R2/A2 | P0 | B2/UI4 | MộtSKU 35k/37k, stockA/B độc lập |
| P15 | Tồn kho live | All authenticated hiện tại | /inventory | GET inventory | inventory_balances | VERIFIED_IN_SOURCE | Stock-current table + scoped actions | SREAD | R2/A2 | P0 | UI4/P1.3 | Ngày lọc không giả tồn hồi tố |
| P16 | Movement history | Assigned scope | /inventory | GET inventory/movements | movement+document time | VERIFIED_IN_SOURCE | Timeline/read filters | SREAD | R2/A2 | P0 | UI4/P1.3 | Giữ raw audit vs doc-time distinction |
| P17 | Nhập hàng thủ công | O/M/I | /inventory form | POST receipts | RECEIPT document TX | PARTIAL | Receipt draft/review, supplier extension | SPOST | R2/A1 | P0 | B3/UI4/P1.4 | Confirmed delta1lần; sourceprice snapshot |
| P18 | Receipt list/detail/in | O/M/I | /inventory | GET receipts,receipts/:id | Header/items | VERIFIED_IN_SOURCE | Drawer detail/print, preservehistory | SREAD | R2/A2 | P0 | UI4 | Không destructive edit posted |
| P19 | Bán hàng form hiện tại | O/M/C | /sales | POST sales | SALE/items/movements | PARTIAL | Không gọi confirmed payment khi chỉ SALE | SPOST | R2/A1 | P0 | UI4/B4/P1.4 | Server price/stock/key giữ semantics |
| P20 | POS search/scan/cart | O/M/C | Chưa /pos; /sales chỉform | Catalog+sale có; barcode API thiếu | Branch catalog đề xuất | PARTIAL | /pos splitcart, keyboard/scan | SPOS | R4/A4 | P0 | B2+B4/UI4 | LastSKU race; no robot overlay/payment giả |
| P21 | Invoice history/detail | O/M/C | /sales | GET sales,sales/:id | Snapshotitems/total | VERIFIED_IN_SOURCE | List/detail/internalreceipt print | SREAD | R2/A2 | P0 | UI4 | Chứng từ nội bộ không giả e-invoice thuế |
| P22 | Cash/bank payment | sale/payment action | Chưa có | Payment API thiếu | Payment ledger thiếu | MISSING | Pending/confirmed/unknown timeline | SPOS | R4/A4 | P0 | B4/UI4 | QR≠received; unknown reconcile sameintent |
| P23 | Ca thu ngân | O/M/C theo action | Chưa có | Shift API thiếu | cashier_shifts thiếu | MISSING | Open/close/variance/reconcile | SPOST | R2/A1 | P1 | B4/UI4 | Owner tựmở; expectedcash không lẫnbank |
| P24 | Return/refund | Requester+approver | Chưa có | Return/refund API thiếu | Linked original lines đề xuất | MISSING | Qty bound/reason/disposition | SPOST | R2/A1 | P1 | B4/B5/UI4 | Không DELETEsale; partialreturn không vượtqty |
| P25 | Kiểm kê/adjust | O/M approve; I count | Chưa có | Count API thiếu | Count baseline+revision thiếu | MISSING | Count/rebase/diff approve | SPOST | R3/A3 | P1 | B5/UI4/P1.4 | Stock đổi giữa đếm/confirm phải stale/rebase |
| P26 | Chuyển kho | Source/dest scoped | Chưa có | Transfer API thiếu | In-transit ledger thiếu | MISSING | Dispatch/partialreceive/loss | SPOST | R2/A1 | P1 | B5/UI4/P1.4 | Đích chưa nhận không tăng stock |
| P27 | Nhà cung cấp | O/delegated | Chưa có | Supplier API thiếu | Supplier thiếu | MISSING | List/detail/create/archive | SFORM | R2/A2 | P1 | B2/B3/UI4 | Referenced supplier archive, notcascade |
| P28 | Chi nhánh | OWNER; assigned view | /branches | GET/POST/PUT branches | branches | PARTIAL | Default/status/archive/reactivate | SFORM | R2/A2 | P0 | B1/UI4 | Có giao dịch/stock phải giải thích cannotdelete |
| P29 | Nhân viên | OWNER | /users | GET/POST/PATCH staff | users/user_branch_roles | PARTIAL | Assignments/disable/invite/history | SFORM | R2/A2 | P0 | B1/UI4 | Disable giữ invoice actor; revoke race gate |
| P30 | Tài khoản/cửa hàng | /settings O-only hiện tại | /settings→Account | GET me,dashboard/overview | Session/org read | PARTIAL | Common /account; owner settings separate | SFORM | R1/A1 | P1 | B1/UI3 | Không UI timezone toggle đổi calendar ngầm |
| P31 | SKU forecast | O/M scoped | /forecast | GET ai/forecast?task=sku,readiness | Livehistory/model | PARTIAL | Readiness/history/attrs/model panel | SAI | R2/A2 | P1 | B6/UI4 | No fake accuracy;6month/attrs checks |
| P32 | Total forecast | O/M scoped | /forecast/total | GET ai/forecast?task=total | Prior forecast snapshot thiếu | PARTIAL | Missing snapshot explicit | SAI | R2/A2 | P1 | B6/UI4 | Không reconstruct causal forecast bằng attrs hômnay |
| P33 | Multi forecast | O/M scoped | /forecast/multi | GET ai/forecast?task=multi | Live history12months | PARTIAL | Origin/horizon/source chart | SAI | R2/A2 | P1 | B6/UI4 | Cold-start không pad trướcorgexistence |
| P34 | Stockout alerts | O/M scoped | /alerts | GET ai/forecast?task=stockout | Model7features proxy | PARTIAL | Proxy risk label + missing stock | SAI | R2/A2 | P1 | B6/UI4 | Không xemscore như calibrated guarantee |
| P35 | Replenishment | O/M scoped | /replenishment | GET ai/forecast?task=replenishment | Knownstock+forecast | PARTIAL | Explainformula, review action link | SAI | R2/A2 | P1 | B6/UI4 | ceil(pred)+ceil(.2pred); no autoPO/stockdelta |
| P36 | AI summary | O/M | Embedded dashboard | GET ai/summary | Five forecasttasks | PARTIAL | Lazy/intentional AI status summary | SAI | R2/A2 | P1 | B6/UI3 | Show null, not0; no repeatedfanout dueanimation |
| P37 | Research library | O/M+datasetgrant | /research | research datasets/runs/forecasts | NCKH archive riêng | VERIFIED_IN_SOURCE | Researchlabel+grantedselector | SREAD | R2/A2 | P1 | UI4 | Không feedlive/AI bằngNCKHfallback |
| P38 | Research aliases | Authenticated then targetguard | /research-demo,/research-branches | Redirect /research | No extra data | VERIFIED_IN_SOURCE | Giữ bookmark redirects | SINFO | R1/A1 | P2 | UI3 | Không route sang old mock thànhlive |
| P39 | Robot/chat assistant | Help; business O/M scoped | /assistant→ComingSoon | Chat/KB/storage API thiếu | Legacy demoAnswer RAM | PARTIAL; legacy MOCK/DEMO | FAQ thật trước business chat | SHELP | R5/A5 | P1 | B6/UI5 | No fake answer/no write tools/no crossscope |
| P40 | Market/service request | O opt-in; proposed | /market→ComingSoon | Market API không có | Legacy pricecalculator demo | PARTIAL | Gated service request ngoàiNCKH | SINFO | R1/A1 | P2 | B6/UI2/5 | Không bịa giá thịtrường/vendor/phone |
| P41 | Support Center | Own ticket/org policy | Chưa có | Ticket/help API thiếu | Ticket/KB đềxuất | MISSING | FAQ/search/ticket/handoff | SHELP | R5/A5 | P1 | B6/UI2/5 | Chưa201 không báo ticket sent |
| P42 | Platform admin | Separate identity | Chưa có | Platform API thiếu | users ENUM khôngADMIN | MISSING | Service shell không tenant data | SREAD | R2/A2 | P2 | B1/B6/UI3 | No blanket cross-tenant business access |
| P43 | Legacy pages | Không mounted | pages/* trừ auth3pages | Một số oldAPI; còn lại mock | mockData/local state | MOCK/DEMO | Importgraph review trước retire | SINFO | R2/A2 | P2 | UI1/6 | Không dùng demo làm runtime proof |
| P44 | Error 401 | Auth/scope appropriate | Chưa dedicated route | auth-expired | No sensitive data | PARTIAL | Dedicated safe recovery 401 | SERROR | R1/A1 | P0 | UI2/3 | Retry read only; writes UNKNOWN→lookup |
| P45 | Error 403 | Auth/scope appropriate | /forbidden | Generic State/error hiện tại | No sensitive data | PARTIAL | Dedicated safe recovery 403 | SERROR | R1/A1 | P0 | UI2/3 | Retry read only; writes UNKNOWN→lookup |
| P46 | Error 404 | Auth/scope appropriate | Chưa dedicated route | Wildcard Navigate(/) | No sensitive data | PARTIAL | Dedicated safe recovery 404 | SERROR | R1/A1 | P0 | UI2/3 | Retry read only; writes UNKNOWN→lookup |
| P47 | Error 500 | Auth/scope appropriate | Chưa dedicated route | Generic State/error hiện tại | No sensitive data | PARTIAL | Dedicated safe recovery 500 | SERROR | R1/A1 | P0 | UI2/3 | Retry read only; writes UNKNOWN→lookup |
| P48 | Error 503 | Auth/scope appropriate | Chưa dedicated route | Generic State/error hiện tại | No sensitive data | PARTIAL | Dedicated safe recovery 503 | SERROR | R1/A1 | P0 | UI2/3 | Retry read only; writes UNKNOWN→lookup |
| P49 | Error offline | Auth/scope appropriate | Chưa dedicated route | Generic State/error hiện tại | No sensitive data | PARTIAL | Dedicated safe recovery offline | SERROR | R1/A1 | P0 | UI2/3 | Retry read only; writes UNKNOWN→lookup |
| P50 | Error maintenance | Auth/scope appropriate | Chưa dedicated route | Generic State/error hiện tại | No sensitive data | PARTIAL | Dedicated safe recovery maintenance | SERROR | R1/A1 | P0 | UI2/3 | Retry read only; writes UNKNOWN→lookup |

Mỗi row giữ existingintegration nơi có, bổ sung UI theo businessdependency thay vì đặt button không backend. Chi tiết screen layouts/tokens ở Design System, robot/chat ở specs riêng, safe errors ở Error UX. Source anchors và limitations trong alignment/inventory.
