# B0 — API contracts đề xuất và tương thích
07/11/2026 — chỉ thiết kế, **không tạo endpoint**. Existing: /api/v1 trong app.js; bảng bên dưới dùng /api/v2 như namespace đề xuất nếu có thay đổi contract. Không tự mount writer P1.4 hoặc đổi /v1 behavior.

## Tái sử dụng hiện tại
Auth register/login/me/logout; GET/POST categories; GET/POST products và PUT product; POST products/import(mode preview/commit,csv,preview_hash); GET/POST/PUT branches; GET/POST/PATCH staff; GET users; POST/GET/detail sales và receipts; GET inventory/movements; GET bi/overview; GET ai/readiness/forecast/summary; research dataset/read routes. /dashboard/overview trả thông tin org/branch count, không toàn bộ KPI. Forgot-password luôn503 khi chưa email.
Không có /pos,/payments,/shifts,/import-sessions,/stock-counts,/transfers,/chat,/tickets runtime. Detail stock doc dùng positiveId hiện32bit dù DB BIGINT: v2 cần decimal-string validation, không truncate ID và không âm thầm đổi v1.

## Convention và gates
Tenant từ session; supplied org khác→403. branch recheck ACTIVE+assignment+action, policy/kỳ/epoch dưới lock cho write. Body strict allowlist; user/created_at/accepted_at/epoch/total server-owned. Quantity integer dương, money decimal string v2, validate finite/range/2digits, cost precision version riêng. Query Gregorian0001–9999, P1.3 range clipping giữ nguyên v1, future P1.4 DATE reader chỉ sau parity/activation.
If-Match revision cho editable resources;409 stale khi đã có mapping/data khác, không tự overwrite. POST economic dùng request_key12–80 và versioned envelope/hash, receipt atomic với target; same key+same payload trả200 frozen, khác payload409. Key scope giữ org/type legacy, new flow key identities riêng không làm yếu existing UNIQUE. Reply không chứa key/hash của tenant khác.
Pagination bounded limit≤100, cursor tie-break stable; filter allowlist, không accept SQL/table names. GET permission check mỗi request; no-store dữ liệu tenant nhạy cảm, không cache auth/stock/AI response xuyên scope.

## Endpoint/action matrix đích
| Endpoint đề xuất | Action / validation | Boundary / idempotency / response |
|---|---|---|
| GET /capabilities | authenticated current scope | role/actions/branches/policy versions; UI affordance không là authorization |
| GET/PATCH /organization | owner profile/config | If-Match, logo upload separate ACL; currency/timezone activation không generic PATCH |
| GET/POST /branches; GET/PATCH /branches/:id | branch.view/create/update | scoped detail/list; If-Match; existing v1 PUT vẫn full body contract |
| POST /branches/:id/archive hoặc reactivate; DELETE /branches/:id | branch.archive; default/stock/in-transit/ref checks | state action key+TX+audit;409inuse, no cascade |
| GET/POST/PATCH /employees; POST /:id/disable,reactivate,invite | employee.* scoped | owner cannot demote last owner; assignment txn/revoke protocol; invite email service absent→unavailable |
| GET/POST/PATCH/DELETE /categories,:id; POST archive/reactivate | catalog permission | unused delete only; referenced inactive; name uniqueness collation tested |
| GET/POST/PATCH /products,:id; POST archive/reactivate; DELETE unused | product.* org scope | category FK/safe attributes, UK SKU; no stock mutation |
| GET/PUT /branches/:id/products/:product | branch_product.view/price.update | server resolve effective price/version/enabled; no duplicate catalog SKU |
| GET /products/lookup?barcode=...&branch_id=... | sale.create hoặc inventory scope | tenant barcode normalization, branch sellability; no trusted stock reservation |
| GET/POST/PATCH /suppliers,:id; POST archive/reactivate; DELETE unused | supplier.* org | contact validation/PII ACL; FK receipts preserved |
| POST /import-sessions | import.create + mode-specific rights | mode CATALOG/OPENING/RECEIPT,branch required except catalog; creates draft only, request key |
| POST /:id/upload; GET /:id/sheets | draft ACL, quotas/MIME/hash/size | private storage reference; no product/stock DML, report real bytes progress |
| PUT /:id/mapping; PATCH /:id/rows | import.edit,If-Match | mapping/version CAS, validation errors percell, bulk changes tracked |
| GET /:id; GET /:id/rows; GET /import-sessions | import.view | filters error/skip/duplicate, pagination; resume current scope |
| POST /:id/preview; POST /:id/approve | import.preview/approve | immutable hash/revisions/expiry; preview not ledger lock; approver policy explicit |
| POST /:id/commit; GET /:id/commit-status | import.commit + effect action | preview_id/hash+If-Match+request_key; exact result receipt;UNKNOWN no new key |
| POST /:id/cancel; DELETE uncommitted draft | import.cancel/purge | deny COMMITTED; retention permission+manifest; no economic cleanup |
| POST /opening-runs/:id/confirm | inventory.opening.approve | no existing incompatible ledger; UK opening identity; no retry double stock |
| POST /receipt-drafts; PATCH /:id; POST /:id/confirm,cancel | inventory.receive | supplier/branch/product recheck; confirm one atomic posting, cancel only draft |
| GET /receipts/:id; GET /receipts | inventory.receipt.view | historical branch-read scope separate from active-write guard |
| POST /sales/confirm | sale.create + payment.confirm | server prices+cost+stock+confirmed manual payment+doc+audit+receipt same TX |
| GET /sales/:id; GET /sales; GET /requests/:type/:key | sale.view / authorized replay lookup | no cache; no enumeration leakage; frozen response on timeout recovery |
| POST /sales/:id/payment-intents; POST /payment-intents/:id/confirm | payment.* explicit | PENDING no payment success; external gateway not implemented; duplicate reference guard |
| GET /payment-intents/:id/status | authorized current scope | UNKNOWN→reconciliation; never “timeout means failed” |
| POST /sales/:id/returns; POST /returns/:id/approve,confirm | return.request/approve + refund.confirm | cumulative line qty/refund locks; linked reversal not document DELETE |
| GET /shifts; POST /shifts/open; GET /shifts/:id | shift.* | active shift guard/org/branch/register; opening cash not sale |
| POST /shifts/:id/close-preview,close; GET reconciliation | shift.close | expected vs counted cash/version; UNKNOWN payment unresolved policy; closed immutable |
| GET /inventory,/movements | inventory.view/current scope | current stock independent of date filters, movement doc-date semantics |
| POST /stock-counts; PATCH /:id/lines; POST submit/approve/post/cancel | inventory.count/adjust.approve | baseline revision and intervening movements; no blind balance overwrite |
| POST /transfers; PATCH /:id; POST approve/dispatch/receive/cancel | transfer action for each source/dest branch | guards IDs sorted, each effect receipt atomic, received≤dispatched, no auto dest increase |
| GET /bi/overview,/bi/reports; POST /bi/exports | report.view/export | live/history scope explicit; no profit when cost unknown; export snapshot/digest/ACL new |
| GET /ai/readiness,/ai/forecast,/ai/summary | ai.forecast scope | reuse semantics/version/status, no new inference/model switch; existing gateway stillUTC |
| GET /help/articles; GET /help/search | public FAQ or authenticated help | curated version/citations, not LLM inference |
| POST /conversations; POST /:id/messages; GET history | ai.help or ai.explain | scope reauth, bounded input/output; proposals only, no mutations |
| POST /tickets; GET /tickets,:id; POST /:id/messages,close | support own/org policy | validated contact config, no fake hotline; redacted attachments |
| /platform/organizations,status,tickets | platform plane explicit authority | separate identity/audit, no implicit cross-tenant business reads |

State actions are proposals; GET endpoints of same entity follow read scopes and stable list/detail rules in CRUD matrix. PATCH/DELETE unposted requires version and reference recheck under TX; DELETE not economic idempotency bypass.

## Request/response mẫu — đều là thiết kế, không thực thi
Import draft:
```json
{"mode":"RECEIPT","branch_id":101,"supplier_id":31,"request_key":"draft-create-000001"}
```
Preview:
```json
{"preview_id":"9001","revision":7,"mode":"RECEIPT","persisted":false,"counts":{"total":12,"valid":10,"errors":1,"duplicate":1,"skipped":0},"can_commit":false,"expires_at_utc":"<server UTC>"}
```
Commit sau review If-Match:7:
```json
{"request_key":"import-confirm-000001","preview_id":"9001","preview_hash":"<64 hex>","expected_revision":7}
```
Response atomic success chỉ sau commit:201 {status:COMMITTED,receipt_id,created/updated/skipped,document_ids,replayed:false}; replay200 frozen. Nếu sub-batch được duyệt,202 progress có completed_chunks/failed_chunks và PARTIALLY_COMMITTED; không reuse success của atomic như đã nhập toàn file.

Sale confirm v2:
```json
{"branch_id":101,"shift_id":"7001","request_key":"sale-confirm-000001","schema_version":"sale-confirm-v2","items":[{"product_id":51,"quantity":2,"expected_price_version":4}],"payment":{"method":"CASH","received":"100000.00"}}
```
Server không tin client tổng/giá override.201 mẫu:
```json
{"document_id":"9007199254740993","document_state":"POSTED","payment_state":"CONFIRMED","total":"70000.00","change":"30000.00","replayed":false,"business_date":"<server DATE>","accepted_at_utc":"<server UTC>","invoice_kind":"INTERNAL_SALES_RECEIPT"}
```
Bank manual confirm phải có actor/approval/evidence reference được duyệt; không đọc ảnhQR để setCONFIRMED. Nếu có tiền đã nhận nhưng stock không còn: transaction không post SALE; payment evidence vào reconciliation và hoàn tiền/đổi hàng theo workflow, không thất lạc chứng cứ vì rollback. Contract này cần settle policy trước B4.

Count confirm:
```json
{"request_key":"count-post-000001","expected_version":3,"baseline_live_revision":"81","lines":[{"product_id":51,"counted_quantity":8,"reason":"Kiểm đếm trực tiếp"}]}
```
409 STALE_INVENTORY khi current revision khác và không có approved rebase. Transfer receive: source/dest từ transfer server, request {key,expected_version,lines:[{transfer_line_id,quantity_received,damaged_quantity}]}; reject over-receive/unauthorized destination.

Errors v2 đề xuất:
```json
{"error":{"code":"COMMIT_OUTCOME_UNKNOWN","message":"Chưa xác nhận kết quả. Giữ nguyên mã yêu cầu và tra cứu trạng thái.","retryable":false,"correlation_id":"<server ID>","lookup_required":true}}
```
400 field issues;401 reauth;403 permission;404 scoped entity;409 hash/version/stock/period conflict;413 quota;422 validation;429 Retry-After;503 service unavailable/UNKNOWN. Current v1 chưa có structured code/correlation/status lookup: shared.request còn bỏ HTTP status, cần backend+client change được duyệt, không chỉ thay wording UI.

## P1.4/cutover gates
Không đổi legacy hash hoặc replay khi chuyển form. New envelope canon gồm branch/mode/schema/explicit price expectations/payment intent/range/source identity theo từng contract; version immutable. Transaction auth lock rank/control/guard/period/product/balance/identity nhất quán với revoke và close period; no network/inference inside.
Chỉ reader DATE sau backfill/parity và writer epoch fences; rollback UI có thể, rollback writer cũ sau cutover không tự động. New modules cần schema/endpoint/grants approval riêng; B0 không tạo DDL, connection hoặc API route.
