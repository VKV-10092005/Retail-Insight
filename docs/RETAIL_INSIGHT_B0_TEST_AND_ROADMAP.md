# B0 — Test matrix và lộ trình B1–B6
07/11/2026. **Các case dưới đây là thiết kế, NOT RUN.** Không tạo fixture/SQL/test application trong B0. Số370PASS củaPREP trước không phải kết quảB0.

## Test matrix
| ID | Scenario / lớp bằng chứng tương lai | Oracle / acceptance |
|---|---|---|
| T01 | Owner1branch/no staff: pure UI→isolatedHTTP→native registration | mộtorg/owner/branch/assignment, owner tựbán/nhập, không bắtstaff |
| T02 | Owner tựPOS: UI keyboard + nativeposting | giáserver, đúngbranch, không accountcashier phụ |
| T03 | Owner thêmbranch/staff: contract+native | assignmentsđúngorg, existingdocs không đổi, login thấy scope |
| T04 | Cashier/inventory denied: API negative | hiddenmenu không đủ, directendpoint403/404, no mutation |
| T05 | OrgA/OrgB isolation: everylist/count/detail/export/import/chat | không leak existence/receipt/data, no mixed querycache |
| T06 | SameSKU branchA35k/B37k,stock100/50: native | sell3ởA→97/50, không duplicatecatalog, snapshotsgiágốc |
| T07 | XLSX/CSV khácmẫu: parserpure + integrationquarantine | sheets/header/mapping review, lowconfidencechọnmanual, không autoDBcolumns |
| T08 | Missingrequired/locale/money/negativeqty: pure+native | field/rowerrors, zeroeconomicwrite, same-rowcategory/product validation |
| T09 | Duplicates trongfile/DB/collation: native | NEW/UPDATE/SAME/CONFLICT rõ, không silentoverwrite/bỏdòng |
| T10 | Autosave/resume/parallel editing: two clients | If-Match409, preserved draft, mapping edit invalidates approval |
| T11 | Upload→preview: integration | no product/stock/revenue delta, file replacement previewstale |
| T12 | Doublecommit import/retry: twoBackends+native | một receipt/effect, frozenresult, identity conflict rollback |
| T13 | Opening confirm lặp: native | UKopeningidentity, no duplicateinitialstock; existingmovement blockswrongopening |
| T14 | Receipt doubleclick/timeout: native+fault | delta+ một lần, samekey replay; no fakefailed afterCOMMIT |
| T15 | Two cashiers lastSKU: nativebarrier | mộtposted/mộtstock409; header/items/movements/payment/audit atomic |
| T16 | Payment pending/QR/timeout: providerstub+native | QRkhôngCONFIRMED; UNKNOWNreconcile giữintent; tiềnđãnhận nhưngsalefail có evidence/refundprocess |
| T17 | Cancelcart vs postedreturn/refund: native | cartnoeffect, postednotDELETE, cumulativeqty/refundbound, damaged khôngsellablerestock |
| T18 | Shiftcash/bank/refund/variance: native | expectedcash equation đúng, oneactiveguard, no closedshift mutate |
| T19 | Branchdelete/archive cóstock/docs/intransit: native |409reason, no cascade, archivedhistory vẫn đọc theoquyền |
| T20 | Staffdisable/revoke/assignmentrace: nativeS/X | posteracceptedbefore revocation hoặcdenyafter; oldinvoiceactor giữ, auditonetime |
| T21 | Catalog/BI P1.2same-item & P1.3dates: regressionpure+native | listfull-documenttotal vs BI matchedlines không mix, count/listpredicate parity |
| T22 | Count revision đổi khiđếm: native | rejectstale hoặcapprovedrebase, expectedcounts+interveningmoves không overwrite |
| T23 | Transfer dispatch/partialreceive/overreceive: native | source−dispatch, transit đúng, dest+actualreceiveonly, no dualbranchdeadlock |
| T24 | Cost WAC/returns/transfer: puredecimal+native | historicalCOGSimmutable, missingcostnullmargin, rounding/reconcile exact |
| T25 | ColdstartAI6/12month/attrs/model/stock: HTTPAIstub | reasonhonest, no research/archivefallback, no fabricatedaccuracy |
| T26 | AllAI tasks before/afterhistoryarchive: SQL/payloadstub | same liveinput/calendar/hash, archiveanalytics-only no live/AIeffect |
| T27 | Chatpromptinjection/crossbranchhistory: adversarialAPI | onlyallowlistedreadtools, no businessmutations or sensitivepromptleak |
| T28 | Importformula/macro/zip/largefile/exportinjection: parser/security | reject/quarantine bounded, no executedcode, safe spreadsheetexport |
| T29 | Periodclose vs sale/import/adjust/receive: nativebarriers | guardserialization, closedperiod failclosed, oldreplay allowedafterreauth |
| T30 | COMMITUNKNOWN/backendkill/deadlock: nativefaults | rollbackorreceiptproof; no newkey; boundretry; no dirtyconnection |
| T31 | 401/403/404/500/503/offline/maintenance UI | safeCTA/focus, no stack/token, no falsepayment, readonlyretry |
| T32 | Dark/light/360px/tablet/keyboard/reader/reducedmotion | no blockedcheckout/draftloss, visiblefocus, accessiblegrid/charts, nocontrastregression |
| T33 | MultiBackendhotbranch/multibranch100/500/1000 future | nativecorrectness beforeload; measureoffered/acceptedRPS,p95/p99,lock/pool/AI; no capacityclaim |
| T34 | Native/P1.4cutoverrecovery | epochfence, no legacyhashrewrite/datefake, no prematureactivation |
| T35 | Support/platformcontact/permissions | no fakehotline/ticket-success, operator cannot blanketreadbusiness, transcriptopt-in |

Pure/mock không chứng minh MySQL row locks, CHECK/FK/collation/grants/trigger/COMMIT durability. Native chỉ trên disposable sau approvals A2.1 riêng, khôngretail_app/research. UItouch/browser tests cần tài khoản/fixture đúng isolatedconfig, không chạyappkhi chưađượcphép DBaccess.

## Roadmap B1–B6 đề xuất
| Phase | Scope và nguồn tái sử dụng | DB/TX/P1.4 impact | Acceptance, dependency, UI |
|---|---|---|---|
| B1 Foundations | auth/session/branch helpers, org/profile/defaultbranch, capabilities, current-owner/staff actioncontract | schema/grants/audit có thể cần; quyền/migration approval riêng; P1.4 native gates không tự được mở | T01–05,19–20,29–30,34; UI1 independent, UI3 cần capabilities; runtime revokerace phảireview |
| B2 Catalog/branch offers | reuse products/categories + boundedCSV, typedattributes/barcode/supplier, defaultprice/override | newoffers/barcode FK/priceversion; hash legacy giữ; pricing writercontract review | T06,08–09,21; UI4catalog, no duplicate SKU, no fake valuation |
| B3 Import Studio/receipts/opening | reuse CSVnormalizer vàRECEIPTposting interface, private staging/mapping/version/preview | newstaging/receipts/sourceidentity; atomicboundedcommit/openingguards; afternativeP1.4-compatiblepostingreview | T07–14,28–30; UI4import, offline draftresume, currentCSV vẫn hoạtđộng |
| B4 POS/payments/shifts | reuse SALEserverpricing, stocklocks, internalinvoice; newpayment/shiftreconcile | economicTX extension, manualcash/bankpolicy, requestreceipt/UNKNOWN API; no externalgatewayautoadd | T02,15–18,30; UI4POS+shift; basicvoidcart trướcB5return |
| B5 Inventory/cost/reversals | reuse balance/movement, count/adjust/transfer/intransit, return/refund and WACsnapshots | newtypes/guards/costprecision/reversal immutability, bothbrancheslocks; no posted UPDATE | T17,22–24,29–30; UI4count/transfer/margin onlyknowncost |
| B6 BI/AI explanations/support | reuse scoped BI/FastAPI/research segregation; curatedFAQ/chatreadonly/tickets, source/versioncontract | snapshots/conversations/tickets cần schema/ACL, không đổiweights/pipeline trong designapproval | T21,25–27,31–33,35; UI4reports+UI5robot/help, UI6complete QA |

Ưu tiênP0: đúng scope/payment/branchprice/stock/key và giữP1.1–P1.3; P1: staging/POS/shift/count/transfercóbackend; P2: servicewebsite/platformsupport nângcao/optional3D. Không chờAIđủhistory mớicho corestore hoạtđộng. B4payment basic trướcB5returnsettlement; valuationpolicy B5 phảiđượcdesignapprove trước đưa “profit” lênUI, có thểship basicPOS với costUNKNOWN nếuđượcduyệt và không marketingprofit.

## Rủi ro tương thích cần gate
- Branchprice/disabledbranchproduct không tự đổi feature listing_price của AI đang lấyproduct.sale_price; featurepolicy mới cần riêng, không train/sửaweights.
- Returns/adjustments/type extensions có thể làm netrevenue và forecastsemantics khác SALE-only reader hiện tại. Cần versionreport/inputspec, không âmthầm “net”AI hoặc làmfakehistory; research giữnguyên.
- Multi-branchAll report không là legalbranchcontext cho economicwrite; transfer phảikhóacảscope, no crossorg.
- P1.4 postedheader immutability xungđột kiểu PATCH status/payment vàoheader: dùng extension/event/linkedreversal, khôngbỏtriggerđểshipUI.
- Defaulttimezone/currencyconfig không simpledisplaysetting; preserveUTC/DATE/datebasis P1.3 và approvedP1.4 sequence.
- Runtime authrole vs proposeddelegatedpermissions cần compatibilityplan, đặcbiệt MANAGERglobalcatalog và ADMINlabel.
- ReleaseP1.4 vẫn CANDIDATE_NOT_EXECUTABLE/nativeNO-GO; B1–B6/UIphases là đềxuất, không authorization triểnkhai.

**GO chỉ reviewB0/UI0. NO-GO code/migration/native/runtime/AIactivation. Dừng chờ OWNER phê duyệt concept và quyết định nghiệp vụ ởalignment.**
