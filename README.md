# Life World MVP 🌿

Game mô phỏng cuộc sống 3D Cozy Low-poly (single-player MVP) — React 19 + Three.js / React Three Fiber 9 + Node.js Express + MySQL 8.

## Yêu cầu
- Node.js 22+, npm 10+
- MySQL 8+ (hoặc MySQL tương thích)
- Chrome/Edge có WebGL2

## Khởi chạy (Windows PowerShell hoặc CMD)

### Cách nhanh — không cần MySQL (mặc định)

```sh
npm install
npm run dev
```

Mở http://localhost:5050 và đăng nhập bằng tài khoản có sẵn:

| Tài khoản | Mật khẩu | Khu | Lô |
|---|---|---|---|
| `demo` | `demo1234` | Nông thôn | R-001 (đã có nội thất) |
| `thanhpho` | `demo1234` | Thành thị | C-001 |

Hoặc đăng ký tài khoản mới, chọn **Thành thị** hoặc **Nông thôn** (kèm một pet Mochi). Sau khi vào game, màn hình **Chọn lô đất** mở ra để bạn chọn một lô trống — xem mục *Lô đất* bên dưới.

Dữ liệu có sẵn nằm trong [`server/src/seed.js`](server/src/seed.js). Lần chạy đầu server tự tạo `server/data/db.json` từ đó, mọi thay đổi (đăng ký, nội thất, vị trí, pet) được lưu vào file này. `npm run seed -w server` chạy lại được nhiều lần: chỉ bổ sung world / zone / cấu hình / lô mẫu còn thiếu, không ghi đè chủ sở hữu. Muốn xóa sạch và quay về dữ liệu mẫu: `npm run seed:reset -w server`.

### Dùng MySQL

1. Tạo CSDL: dùng MySQL Workbench mở `database/schema.sql` và chạy toàn bộ, hoặc `mysql -u root -p < database/schema.sql`.
   - **Database đã có từ phiên bản trước:** chạy `mysql -u root -p life_world < database/migrations/002_land_plots_timeline.sql` (chỉ bổ sung cột / bảng còn thiếu, không DROP, không xoá dữ liệu, chạy lại được). Server cũng tự chạy các bước này khi khởi động và điền ranh giới / điểm xuất hiện của từng lô.
2. Sao chép `server/.env.example` thành `server/.env`, đặt `DB_DRIVER=mysql`, cập nhật `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (ít nhất 32 ký tự ngẫu nhiên).
3. `npm run dev`. Lưu ý: chế độ MySQL không có tài khoản demo.

## Điều khiển
- **Khám phá (mặc định góc nhìn thứ 3, kiểu TPS):** **click vào khung 3D** để khoá chuột (Pointer Lock) — con trỏ được ẩn, sau đó **chỉ cần di chuột** là camera xoay quanh nhân vật (ngang 360°, dọc −60° → +70°), không cần giữ nút chuột nào. **Esc:** hiện lại con trỏ để bấm giao diện; click lại khung 3D để tiếp tục. Mở cài đặt / hộp thoại hay vào chế độ trang trí sẽ tự thả chuột.
- **WASD / phím mũi tên:** đi theo hướng camera (đi chéo không nhanh hơn), nhân vật xoay mượt theo hướng đi; **Shift:** chạy; **cuộn chuột:** zoom. **Tay cầm:** cần analog trái.
- **Nút ⚙ góc trên phải:** chỉnh **độ nhạy chuột** (0.2× → 3×) và **đảo trục dọc**; lựa chọn được ghi nhớ.
- **V** (hoặc nút "Góc nhìn"): đổi sang **nhìn từ trên cao** — con trỏ hiện bình thường, **click / giữ chuột phải** trên mặt đất để đi tới đó, **Alt + giữ chuột phải và kéo** để xoay góc nhìn (kéo ngang = xoay quanh nhân vật, kéo dọc = nghiêng); camera nhìn cùng hướng với góc nhìn thứ 3 trước đó. Lựa chọn được ghi nhớ.
- Nhà, cây, hàng rào, luống rau, cột đèn, bàn ô… đều chặn đường đi. Vật nào che khuất nhân vật sẽ tự mờ đi.
- **E:** vào nhà khi đứng gần nhà mình (hoặc bấm "Trang trí"); **Esc / E:** ra ngoài.
- **Ngôi nhà 2 lầu + sân thượng** (16 × 11 m, gấp đôi phòng cũ):
  - **Tầng trệt:** phòng khách (TV, sofa, ổ nằm của Mochi), nhà bếp (tủ bếp, bếp nấu, chậu rửa, bàn ăn), nhà tắm (bồn tắm, bồn cầu, lavabo).
  - **Cửa chính** phía trước: đi qua là ra ngoài đường. **Cửa sau** trong bếp: đi qua là ra **sân vườn**; ở sân vườn đi vào cửa nhà (nhãn "Vào nhà") là vào lại bếp.
  - **Cầu thang** cạnh tường phải lên **lầu 1**: 2 phòng ngủ, sảnh lầu, **ban công** nhô ra phía trước; cầu thang thứ hai (gấp khúc) lên **sân thượng** có bàn trà, phơi đồ, bồn nước.
  - Camera cắt lớp như nhà búp bê: chỉ hiện tầng đang đứng và các tầng bên dưới, nhãn tên phòng hiện trên sàn; thanh nội thất hiện tầng hiện tại.
  - Quanh nhà là khu phố thật (nhà hàng xóm, đường, xe, cây, quán cà phê). Lên **sân thượng** rồi nhấn **V** (hoặc nút "🔭 Ngắm cảnh"): camera chuyển sang góc nhìn thứ 3, click để khoá chuột rồi di chuột nhìn sang các toà nhà bên cạnh, WASD để đi dạo; **V / Esc** để quay lại trang trí.
- **Trang trí nhà:** camera nhìn từ trên xuống, con trỏ chuột hiện bình thường; nhân vật đi lại giữa các phòng / lên xuống cầu thang bằng **WASD**. Đồ được đặt ở **tầng đang đứng**.
  - **Rê chuột** lên món đồ để chọn (có khung đánh dấu). **Click** để nhấc lên rồi **click** chỗ mới để đặt, hoặc **giữ chuột trái và kéo thả** món đồ tới chỗ mới (khung đỏ = bị vướng).
  - **Chuột phải** (hoặc **R**): xoay món đồ đang chọn / đang cầm 90°.
  - **1–9** hoặc bấm ô ở thanh nội thất: cầm một món mới, món đồ bám theo con trỏ, click để đặt. **Delete:** cất món đang cầm. **Esc:** bỏ món đang cầm / ra ngoài.
  - Tường, đồ cố định và đồ đạc (trừ thảm) chặn đường đi; không đặt được đồ chắn cửa / đầu cầu thang; cuộn chuột để zoom.
- **Sân vườn** (phím **G** khi đứng gần nhà, hoặc nút "Sân vườn" ở thẻ bên trái): khu vườn sau nhà của riêng bạn.
  - Nút **−/+ Rộng** (6–16 m) và **−/+ Sâu** (4–12 m) để nới hoặc thu nhỏ mảnh vườn (muốn thu nhỏ thì phải dọn các khu nằm ở mép trước).
  - Chọn **Luống rau** (B) hoặc **Hồ cá** (P) cùng kích thước (luống 1×1 → 5×3, hồ 2×2 → 6×4), đi tới chỗ muốn xây, **chuột trái** để xây, **chuột phải** để xoay (ở góc nhìn thứ 3 cần khoá chuột trước; Esc để bấm thanh công cụ vườn).
  - Đứng trước luống: chuột trái để **gieo** hạt đang chọn (phím 1–7: rau cải, cà rốt, hướng dương, cà chua, bí ngô, cây cam, cây táo), cây lớn dần theo thời gian thực (3–20 phút); khi có ngôi sao vàng thì chuột trái để **thu hoạch**. Cây ăn quả hái xong vẫn giữ cây, quả mọc lại.
  - Đứng trước hồ: chuột trái để **thả cá** đang chọn (phím 8/9/0: cá vàng, cá koi, cá bảy màu); sức chứa = 2 con mỗi m² (tối đa 20).
  - Chuột phải lên một khu để nhấc lên dời chỗ, **Delete** để dọn khu đi.
- **Minimap** góc phải: nhà bạn (đỏ), quán cà phê (cam), mũi tên là hướng nhân vật.
- Thêm `?gio=20` vào URL để xem thử thế giới vào một giờ bất kỳ (ví dụ ban đêm).
- **Cho Mochi ăn:** cập nhật trạng thái pet trong database. Độ đói tăng 5%/giờ và độ vui giảm 3%/giờ kể từ lần cho ăn gần nhất (tính ở server khi đọc).
- Đồng hồ giờ Việt Nam và ánh sáng ngày/đêm chạy theo thời gian thực.

## Lô đất (Land Plot System)
- **24 lô mẫu** (cấu hình trong [`server/src/plots.js`](server/src/plots.js)): 12 lô phố 12 × 12 m dọc hai bên đường, 12 lô quê 22 × 22 m rộng và cách xa nhau; mặt tiền hướng ra đường (+Z). Trạng thái: `available` (đất trống, có biển "Đất chưa có chủ"), `owned`, `reserved` (nhà dân có sẵn), `disabled` (đang quy hoạch).
- **Người chơi mới:** đăng ký → chọn khu vực → màn hình **Chọn lô đất** (lọc theo khu vực, camera bay tới lô, highlight trên bản đồ 3D và minimap, xem kích thước / hướng mặt tiền) → **Nhận lô**. Có thể "Đi dạo xem đất trước", tới lô có biển *Đất chưa có chủ* rồi nhấn **E** để xem và nhận.
- Ranh giới lô chỉ hiện khi đứng gần; biển tên lô có chủ hiện mã lô / tên chủ (`world_settings.plot_label_mode`: `code` | `owner` | `both`).
- Nếu lô vừa bị người khác nhận trong lúc chọn: backend từ chối (`PLOT_ALREADY_OWNED`), giao diện báo và tự chọn lô khác; danh sách tự cập nhật 8 giây/lần.
- Quyền sở hữu do backend quyết định: chủ = nhân vật của JWT (bỏ qua mọi `owner_character_id` từ client); MySQL dùng transaction + `SELECT … FOR UPDATE`, `UNIQUE(owner_character_id)`. Mỗi nhân vật một lô.
- Sau khi nhận đất, nhân vật xuất hiện trước cổng (điểm xuất hiện lưu trong `player_spawn_points`, được kiểm tra không nằm trong lô / nhà / suối). Nút **Về nhà** (phím **H**) gọi `POST /api/characters/return-home` — backend kiểm tra quyền và dùng điểm đã lưu, không nhận toạ độ từ client; lưu vị trí nhảy xa bất thường bị từ chối (`INVALID_POSITION`).
- Chỉ lô của mình mới vào được Trang trí / Sân vườn (mọi API nhà / vườn chỉ thao tác trên nhà của người gọi).

## House Builder (Build Mode) — Phase 02.1
- Đứng trên lô đất của mình → nút **Xây nhà** / phím **B**. Build Mode thả Pointer Lock, hiện con trỏ, khoá WASD của nhân vật và chuyển sang camera xây dựng (nhìn chéo từ trên): **cuộn** zoom, **kéo chuột phải** xoay, **Shift + kéo phải / chuột giữa** di chuyển, **WASD** pan, **Q / E** xoay 45°, **R** về mặc định; điểm nhìn bị giới hạn quanh lô.
- Hiện ranh giới lô (mũi tên = mặt tiền) và lưới (0.5 / 1 / 2 m, khớp lưới bật / tắt), chọn tầng, ẩn / hiện nhà hiện có. Công cụ: **Chọn (1)**, **Cọc đánh dấu (2)** để phác bố cục, **Xoá (3)**; Tường / Sàn / Cửa / Cửa sổ / Mái đã có chỗ trên thanh công cụ nhưng “Sắp có”. **Ctrl+Z / Ctrl+Y** hoàn tác / làm lại, **Ctrl+S** lưu, **B / Esc** thoát (hỏi lại nếu chưa lưu); thoát xong camera về góc nhìn thứ 3, click để khoá chuột lại.
- Đứng trên lô của người khác + **B** → chỉ **xem** (không thêm / sửa / xoá). Quyền do backend quyết định (`GET /api/land-plots/:id/build-permission`), backend kiểm tra lại khi lưu: chủ lô theo JWT, từng cấu trúc phải nằm trong ranh giới / đúng tầng / đúng loại, `version` chống ghi đè.
- Hệ toạ độ: gốc local = **tâm lô**, X = chiều ngang, Z = chiều dài (+Z = mặt tiền), Y = chiều cao (tầng f ở y = 3.4·f); world = vị trí lô + xoay `rotation_y`. Helper: `worldToPlotLocal`, `plotLocalToWorld`, `snapToGrid`, `isInsidePlot`, `getBuildPlaneIntersection`, `validatePlacement` (`client/src/game/building/`).
- **Lưới xây dựng (Phase 02.2):** lưới theo toạ độ local của lô, xoay cùng lô, căn từ góc lô, cắt theo ranh giới đa giác, nằm ngay trên mặt sàn tầng đang chọn (đổi tầng → lưới lên theo). Bước 1 m / 0.5 m / 2 m; **G** bật / tắt lưới, **N** bật / tắt khớp lưới, giữ **Alt** để đặt tự do tạm thời. Mỗi công cụ có kiểu khớp riêng: cọc → tâm ô, **Vùng phòng (3)** và **Thước đo (4)** → giao điểm đường lưới (kéo chuột trái để vẽ / đo, hiện kích thước, diện tích, chiều dài). Xem trước xanh = hợp lệ, đỏ = không (kèm lý do); kiểm tra cả diện tích footprint (mọi đỉnh + cạnh) với ranh giới đa giác (cả lô lõm) và **khoảng lùi** `world_settings.build_setback` (mặc định 0.5 m, vẽ nét đứt). Hình học dùng chung client / server: [`shared/buildGeometry.mjs`](shared/buildGeometry.mjs).
- **Tường (Phase 02.3):** công cụ **Tường (6)** — click điểm đầu, rê chuột xem trước (hiện chiều dài), click điểm cuối; vẽ tiếp nối từ điểm vừa kết thúc, **Esc** huỷ đoạn đang vẽ (Esc lần nữa bỏ công cụ), giữ **Shift** khoá hướng 45°. Điểm bắt vào đầu tường khác → thân tường (nối chữ T) → giao điểm lưới. Nối L / T / chữ thập kín khít (đầu nối kéo dài nửa độ dày); tường mới chạm / cắt tường cũ được **chia đoạn** tại mối nối (không xoá tường, giữ cửa); không cho tường dài < 0.2 m, trùng, chồng, vượt ranh giới / khoảng lùi. Chọn tường (công cụ Chọn): highlight + chiều dài, đổi cao / dày / vật liệu, kéo chấm tròn ở đầu tường để dời (đầu nối chung đi theo; cửa không còn vừa → báo lỗi, không mất cửa), **Delete** xoá, Ctrl+Z / Ctrl+Y. Chế độ hiển thị (**T**): Đầy đủ / Cắt góc / Hạ thấp / Ẩn tường — không đổi dữ liệu. Tường đã **lưu** được vẽ trong thế giới và có va chạm (mỗi đoạn tầng trệt một collider); xem trước không có va chạm. Dữ liệu: `{ id, type: 'wall', floor, start: [x, z], end: [x, z], height, thickness, material_id, color?, openings: [] }` theo toạ độ local của tầng; hình học dùng chung ở [`shared/wallGeometry.mjs`](shared/wallGeometry.mjs), server kiểm tra lại khi lưu.
- **Sàn & phòng (Phase 02.4):** tường khép kín được **tự nhận diện thành phòng** (đồ thị phẳng + duyệt mặt, không dùng bounding box: bỏ tường cụt / cầu, đảo bên trong thành lỗ; phòng chữ L đúng diện tích; tường hở không tạo phòng). Mỗi lần thêm / xoá / dời tường, phòng được tính lại và **giữ Room ID** theo diện tích giao: chia đôi → mảnh lớn giữ id, mảnh kia chép thuộc tính; xoá tường ngăn → hợp nhất; phòng không còn khép kín → cảnh báo mất vùng sàn; phòng không liên quan giữ nguyên. Chọn phòng (công cụ Chọn, click trong phòng): đổi tên, loại (khách / ngủ / bếp / tắm / khác), vật liệu sàn, xem diện tích (tim tường). Công cụ **Sàn (7)**: click góc đầu → click góc đối diện (khớp lưới, xem trước diện tích), chỉnh độ dày / vật liệu, xoá; không cho chồng tấm khác cùng tầng / ra ngoài lô. Sàn phòng vẽ bằng ShapeGeometry, tấm sàn bằng ExtrudeGeometry; nhân vật đứng lên mặt tấm sàn trong Explore Mode. Server tự nhận diện lại phòng khi lưu: phòng không khớp vùng khép kín bị từ chối, vùng khép kín chưa có phòng được tự tạo, diện tích / polygon do server tính. Hình học: [`shared/roomGeometry.mjs`](shared/roomGeometry.mjs).
- **Cửa & cửa sổ (Phase 02.5):** công cụ **Cửa (8)** / **Cửa sổ (9)** — chọn mẫu (cửa một cánh / hai cánh / kính / trượt; cửa sổ một cánh / hai cánh / kính lớn / trượt), trỏ vào tường để xem trước (tìm Wall ID, vị trí dọc tường, khớp bước nửa ô lưới, xanh / đỏ), click để gắn. Không cho vượt ra ngoài đoạn tường hay cắt vào mối nối, chồng lỗ khác, cao hơn tường. Chọn cửa: đổi rộng / cao / mép dưới / vị trí / bản lề trái-phải / mở vào-ra / màu, **Gỡ**. Tường có **lỗ mở thật** (chia khối quanh lỗ, không CSG). Sửa tường: cửa đi theo đoạn chứa nó khi chia; rút ngắn / hạ thấp làm cửa không vừa → báo lỗi; xoá tường có cửa → thông báo rõ (Ctrl+Z). **Explore Mode:** tới gần cửa → "E Mở cửa"; cửa mở / đóng mượt, mở thì đi qua được (collider cập nhật), cửa sổ luôn chặn, kính nhìn xuyên. Chỉ chủ nhà mở được (server kiểm tra, `POST /api/land-plots/:id/doors/:openingId {open}`), trạng thái do server giữ (`GET /api/door-states`) và phát sự kiện `door:toggle` để làm multiplayer sau. Dữ liệu lỗ mở nằm trong `wall.openings` (id, catalog_id, offset, width, height, sill, swing, swing_dir, color — gắn với Wall ID). Hình học: [`shared/openingGeometry.mjs`](shared/openingGeometry.mjs).
- **Nhà nhiều tầng (Phase 02.6):** tối đa 2 tầng (Level 0 = tầng trệt, Level 1 = tầng 2), chiều cao mỗi tầng mặc định 3 m, chỉnh được (2.6–4.5 m) và lưu trong `design.levels` (`id`, `index`, `height`, `elevation`). Mọi tường / phòng / sàn / cầu thang có `floor` + `level_id` (cửa thuộc tường); không lưu toạ độ Y — độ cao luôn tính từ tầng. Bảng **Tầng** trong Build Mode: chọn tầng / ▲▼ (PageUp / PageDown), **＋ Thêm tầng** (chỉ khi tầng trệt đã có phòng hoặc tấm sàn đỡ), chiều cao tầng, gỡ tầng trên (khi trống), *Tầng dưới mờ*, *Hiện tầng trên*; lưới & camera nâng theo cao độ tầng. Quy tắc: tường tầng trên phải nằm trên sàn tầng dưới (không có tầng trôi nổi); tấm sàn tầng trên = ban công, nhô tối đa 1.5 m. **Cầu thang (0)**: thẳng hoặc chữ L (rẽ trái / phải), click chân → rê chuột chọn hướng lên → click; kiểm tra không ra ngoài lô, không đè tường / cầu thang khác, đầu trên có sàn tầng trên, chân không bị chặn; tự khoét lỗ sàn tầng trên. **Explore Mode:** đi lên / xuống cầu thang (độ cao theo bậc), không rơi qua mép sàn hay lỗ cầu thang, gầm cầu thang bị chặn, tường tầng trên có va chạm riêng; vào trong nhà thì ẩn các tầng phía trên nhân vật. Nhà một tầng cũ (schema 1) tự nâng cấp khi đọc / khởi động server (giữ nguyên version) — MySQL: [`database/migrations/004_multi_floor.sql`](database/migrations/004_multi_floor.sql). Hình học: [`shared/levelGeometry.mjs`](shared/levelGeometry.mjs).
- **Mái nhà (Phase 02.7):** công cụ **Mái (-)** — click lên lô để dựng mái cho tầng đang chọn (mỗi tầng một mái). Ba loại: **mái bằng**, **mái hai dốc**, **mái bốn dốc**; chỉnh độ dốc (10–50°), phần nhô (0–1 m), hướng nóc (tự động theo cạnh dài / ↔ / ↕), vật liệu (ngói đỏ, ngói xám, tôn, bê tông) và màu riêng — chỉ đổi tham số, không đụng tường / phòng; xoá mái, Ctrl+Z / Ctrl+Y. Đối tượng mái chỉ lưu **tham số** (`kind`, `pitch`, `overhang`, `ridge`, `material_id`, `color`) — hình mái luôn dựng lại từ các phòng của tầng (trừ phần có tầng trên đè lên), nên sửa tường thì mái tự khớp. Chân mái = đỉnh tường cao nhất của tầng; cạnh ngoài nới thêm nửa bề dày tường → tường không xuyên qua mái; cạnh giáp tầng trên không nhô. Footprint chữ L / chữ T… tạo một hệ mặt mái liền với đường nóc / khe mái ở chỗ giao; phòng có cạnh xiên vẫn dựng được mái dốc; tầng chưa có phòng → mái giữ tham số, tạm không hiển thị. Có thể chọn trực tiếp mái bằng công cụ **Chọn**, và Explore Mode coi mặt mái là mặt đứng được để nhân vật đi lên từ sàn / mái liền kề. Hiển thị: Explore Mode hiện mái bình thường (vào trong nhà thì ẩn mái); Build Mode mặc định ẩn nhà dựng sẵn của lô, có **Hiện mái (M)**, mái của tầng trên ẩn khi chỉnh tầng dưới (mờ nếu bật *Hiện tầng trên*), mái của tầng đang chỉnh vẽ mờ trừ khi dùng công cụ Mái — ẩn chỉ là hiển thị, không xoá. Server kiểm tra lại: tham số trong giới hạn, đúng tầng / `level_id`, không trùng mái cùng tầng, phần nhô không ra ngoài lô. Không cần migration (mái nằm trong JSON thiết kế). Hình học: [`shared/roofGeometry.mjs`](shared/roofGeometry.mjs).
- **Build Editor UX (Phase 02.8):** giao diện cozy gọn thành top bar (tầng, grid, Undo/Redo, lưu), tool rail bên trái theo nhóm và Property Inspector bên phải. Toolbar chính gồm Chọn, Tường, Sàn, Cửa, Cửa sổ, Cầu thang, Mái, Sơn và Xoá; mỗi công cụ có icon, tooltip, phím và trạng thái chọn. Chọn 3D ưu tiên hit gần camera, chỉ chọn tầng hiện tại; click trống bỏ chọn. Inspector sửa có validation tức thời cho tường / sàn / phòng / cửa / cửa sổ / cầu thang / mái. History lưu command có loại + version (`CREATE_WALL`, `UPDATE_WALL`, `DELETE_WALL`, `CREATE_FLOOR`, `ADD_OPENING`, `MOVE_OPENING`, `CREATE_STAIRS`, `CHANGE_MATERIAL`, `CREATE_ROOF`), thao tác mới sau Undo xoá redo; lưu phiên bản mới đóng history cũ. Xoá tường có cửa, cầu thang, mái, tầng và chuyển thiết kế chưa lưu đều có xác nhận; thoát chưa lưu vẫn hỏi Lưu & thoát / Bỏ thay đổi.
- `GET /api/house-designs` — thiết kế đã lưu của mọi lô (vẽ tường + va chạm trong Explore Mode).
- Thiết kế lưu ở bảng `house_designs` (JSON theo toạ độ local) — database cũ: `database/migrations/003_house_designs.sql`.

## Thời gian thực (Timeline)
- Tỷ lệ 1:1, múi giờ **Asia/Ho_Chi_Minh**, giờ chuẩn lấy từ server (`GET /api/world/time`). Client đồng bộ khi mở trang, nội suy bằng `performance.now()` (không bị ảnh hưởng khi chỉnh đồng hồ máy) và đồng bộ lại định kỳ, khi quay lại tab, khi có mạng lại, khi phát hiện máy vừa ngủ dậy. Mất mạng: đồng hồ tự chạy tiếp và hiện ⚠.
- Đồng hồ góc trên: giờ, thứ, ngày/tháng/năm, buổi (sáng / trưa / chiều / tối). Ánh sáng, bầu trời, sương mù, đèn đường, cửa sổ nhà đổi theo mốc `world_settings.day_cycle` (mặc định bình minh 5–7h, ngày 7–17h, hoàng hôn 17–19h, đêm 19–5h).
- Thế giới không lưu "giờ game" riêng nên không reset khi đăng xuất / không ai online; cây lớn, pet đói… được tính lại từ thời điểm hiện tại + mốc trong database.

## Kiểm thử
`npm test` (= `npm test -w server` + `npm test -w client`). Server: chạy server thật trên file dữ liệu tạm: 6 kịch bản lô đất của đặc tả (nhận C-001, B bị từ chối, A không nhận lô thứ hai, đăng nhập lại / khởi động lại vẫn còn, A không sửa được nhà / vườn của B, nhiều người cùng nhận một lô chỉ một thành công), mã lỗi, phân trang, về nhà, chống dịch chuyển, API cũ; timeline (giờ server, chuyển ngày, ánh sáng, chỉnh đồng hồ máy, mất mạng) và seed / migration chạy lại; quyền House Builder (chủ sửa được, người khác chỉ xem / bị 403, dữ liệu sai bị 400, version cũ bị 409). Client: hệ toạ độ lô (khứ hồi world ↔ local khi lô xoay, khớp three.js), snap, ranh giới, tia chuột ↔ mặt sàn, kiểm tra đặt, store (đặt / xoá / hoàn tác / làm lại / chỉ xem / hỏi khi thoát).

## API chính
Lỗi trả về dạng `{ error, code }` (`PLOT_NOT_FOUND`, `PLOT_ALREADY_OWNED`, `PLAYER_ALREADY_HAS_PLOT`, `PLOT_NOT_AVAILABLE`, `UNAUTHORIZED`, `INVALID_ZONE`, `INVALID_SPAWN`, `INVALID_POSITION`, `RATE_LIMITED`, …).
- `POST /api/auth/register`: `{username,password,zone:'city'|'rural'}` — tạo tài khoản + nhân vật + pet (chưa có lô đất)
- `GET /api/land-plots?zone=&status=&page=&limit=` — danh sách lô (phân trang, lọc); `GET /api/land-plots/available` — lô trống
- `GET /api/land-plots/:id` — chi tiết; `GET /api/land-plots/:id/owner` — chủ sở hữu công khai (chỉ tên hiển thị)
- `GET /api/land-plots/my-plot` (JWT) — lô của mình + điểm xuất hiện; `POST /api/land-plots/:id/claim` (JWT, rate limit) — nhận lô
- `GET /api/world/time` · `GET /api/world/zones` · `GET /api/world/settings`
- `POST /api/characters/return-home` (JWT, rate limit) — về trước cổng nhà
- `GET /api/land-plots/:id/build-permission` — quyền Build Mode (`can_view`, `can_edit`) của người gọi
- `GET /api/land-plots/:id/house-design` — thiết kế nhà (ai cũng xem được); `PUT` (JWT, chỉ chủ lô): `{design, version}` → lỗi `NOT_PLOT_OWNER` (403), `INVALID_DESIGN` (400), `VERSION_CONFLICT` (409)
- `POST /api/auth/login`: `{username,password}`
- `GET /api/me` (Bearer JWT)
- `GET /api/world` — toàn bộ lô đất (để vẽ bản đồ) + giờ server
- `GET /api/catalog`
- `GET /api/house/furniture` (Bearer JWT)
- `POST /api/house/furniture` (Bearer JWT): `{catalogId,x,z,floor,rotation}` — tọa độ **cục bộ** trong nhà (|x| ≤ 7.9, −5.4 ≤ z ≤ 7.4), `floor` 0 = tầng trệt, 1 = lầu 1, 2 = sân thượng
- `PUT /api/house/furniture/:id` (Bearer JWT): `{x,z,floor,rotation}` — di chuyển/xoay món đã đặt
- `GET /api/garden` / `PUT /api/garden {width,depth}` (Bearer JWT): xem / đổi kích thước sân vườn (kèm danh sách hạt giống, loại cá, giới hạn)
- `POST /api/garden/plots {kind,x,z,w,d}`, `PUT|DELETE /api/garden/plots/:id`: xây, dời/xoay, dọn luống rau (`bed`) / hồ cá (`pond`)
- `POST /api/garden/plots/:id/plant {crop}`, `.../harvest`, `.../fish {species}`: gieo hạt, thu hoạch, thả cá
- `DELETE /api/house/furniture/:id` (Bearer JWT)
- `POST /api/pet/feed` (Bearer JWT)
- `POST /api/character/position` (Bearer JWT): `{x,z}`
- `GET /api/health`

## Kiến trúc
```
client/ (Vite + React + R3F)
    │ HTTP REST (JWT)
    ▼
server/ (Express, validation)
    ▼
store/ ──┬─ file.js  → server/data/db.json (seed từ src/seed.js)   [DB_DRIVER=file]
         └─ mysql.js → database/schema.sql (+ migrations/) (MySQL) [DB_DRIVER=mysql]
plots.js (quy hoạch lô đất) · timeline.js (thời gian thế giới) — dùng chung cho cả hai chế độ lưu trữ
```

**MVP không có multiplayer.** Về sau thêm Colyseus + room/zone, xử lý tọa độ authoritative ở server, visibility culling theo chunk, Redis cho các node máy chủ. Tránh ghi tọa độ di chuyển từng frame vào MySQL.

## Giới hạn có chủ ý
- Các ngôi nhà được dựng bằng mesh hình học, chưa có GLB. Nhà hiển thị ngoài trời và phòng trang trí là **2 cảnh riêng**, chưa có hệ thống cửa/teleport.
- Pet có AI đi theo đơn giản, chưa có va chạm đầy đủ, pathfinding hoặc NPC. Pet tạo trước bản cập nhật này (`last_fed_at` NULL) chỉ bắt đầu suy giảm sau lần cho ăn đầu tiên.
- Collision nhà chỉ là AABB thô, không có navmesh và không có vật lý đầy đủ. Không có chế độ xây tự do.
- Chưa có quyền riêng tư, chat, multiplayer, tiền tệ, chống bot/anti-cheat sản phẩm hoàn chỉnh.
- Khi đăng ký chọn lô đầu tiên còn trống theo khu, 24 lô demo. Muốn quy mô lớn phải bổ sung world/chunk allocator và bản đồ.
- Bản demo cần HTTPS, rate-limit theo hạ tầng, quản lý secret, backup, log, xác thực email, kiểm thử bảo mật và kiểm thử tải trước khi triển khai công khai.

## Lưu ý
Nếu tài khoản bị chặn bởi lỗi kết nối database, xem console server và thông số MySQL trong `server/.env`. Không commit `.env` lên Git.
