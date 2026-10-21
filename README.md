# Ứng dụng CPDLC–DCL trong quản lý luồng không lưu tại Cảng hàng không sân bay Tân Sơn Nhất

Ứng dụng web mô phỏng quá trình khởi hành của nhiều chuyến bay tại Tân Sơn Nhất: đọc dữ liệu lịch bay, bố trí tàu bay trên parking chart, phát lại hành trình lăn và cất cánh, quản lý hàng chờ theo CTOT, đồng thời hiển thị chuỗi điện văn DCL theo thời gian mô phỏng. Giao diện bằng tiếng Việt và giữ các thuật ngữ hàng không cần thiết.

> Đây là mô hình trình diễn phục vụ học tập. Tuyến đường, thời gian và điện văn do phần mềm mô phỏng; ứng dụng không kết nối với hệ thống điều hành bay thực tế.

## Thông tin đề tài

**Nhóm 8 · Lớp 23ĐHKL01**  
**Giảng viên hướng dẫn:** Nguyễn Ngọc Hoàng Quân

| Thành viên | Mã số sinh viên |
| --- | --- |
| Châu Ngọc Xuân | 2331710004 |
| Nguyễn Doãn Phương | 2331710008 |
| Phan Ngọc Trâm | 2331710044 |
| Dương Thị Hương Thảo | 2331710038 |

## Tính năng chính

- **Dữ liệu sẵn dùng:** hai workbook mẫu 7 ngày và 3 ngày được tích hợp trong ứng dụng. Bộ 7 ngày tự nạp khi mở trang; có thể đổi sang bộ 3 ngày ngay trên giao diện.
- **Nhập dữ liệu mới:** nhận tệp `.xls`, `.xlsx` hoặc `.csv`. Dữ liệu được đọc trong trình duyệt, lọc các chuyến khởi hành từ `VVTS` và bổ sung các trường còn thiếu để chạy mô phỏng.
- **Parking chart:** hiển thị tàu bay tại stand, quá trình lăn từ stand đến điểm chờ, nhập đường băng và cất cánh. Có chọn chuyến, phóng to/thu nhỏ bản đồ và phát lại theo nhiều tốc độ.
- **Hàng chờ CTOT:** áp dụng cửa sổ cất cánh từ **CTOT − 5 phút đến CTOT + 10 phút**. Chuyến quá hạn quay về vị trí đỗ trống gần nhất, chờ cấp TSAT/CTOT mới rồi tiếp tục khai thác.
- **Thời tiết xấu thủ công:** nút bật/tắt mưa tác động trực tiếp lên dòng thời gian. Khi bật, hệ thống ngừng cấp phép cất/hạ cánh mới; tàu đã vào đường băng hoặc bắt đầu tiếp cận được hoàn tất chuyển động. Đồng hồ tiếp tục chạy để theo dõi hết hạn CTOT. Khi tắt, hệ thống tự cấp lịch mới, giữ khoảng cách đường băng, ưu tiên slot còn hiệu lực và không xếp hai tàu Heavy liên tiếp.
- **Điện văn DCL:** phát các bước RCD, FSM, CLD, CDA theo kịch bản, trình bày từng trường của điện văn theo hàng dọc và đồng bộ với thời gian phát lại.
- **Theo dõi kết quả:** hiển thị tổng chuyến, tổng thời gian chờ, số chuyến lỡ slot/cấp lại CTOT và danh sách chuyến cùng trạng thái hiện tại.
- **Ghi kết quả:** với tệp mới được mở bằng trình duyệt hỗ trợ quyền ghi, có thể bổ sung các cột kết quả vào chính workbook nguồn.

## Luồng mô phỏng

```text
Workbook mẫu hoặc tệp tải lên
            ↓
Chuẩn hóa chuyến đi từ VVTS và chuẩn bị CTOT / stand
            ↓
Sắp thứ tự khởi hành, xét cửa sổ CTOT và năng lực đường băng
            ↓
Stand → đường lăn → điểm chờ → nhập đường băng → cất cánh
            ↓
Phát điện văn DCL, cập nhật hàng chờ và các chỉ số
```

Ứng dụng dùng cấu hình đường băng **25L / 25R**. Vị trí và đường đi trên chart là hình học mô phỏng gắn với ảnh parking chart; thời gian và thứ tự bay được tính từ dữ liệu đầu vào. Kết quả có tính tái lập với cùng bộ dữ liệu và ngày được chọn.

## Bắt đầu trên máy

Yêu cầu **Node.js 20+** và trình duyệt hiện hành. Chrome hoặc Edge được khuyến nghị nếu cần ghi kết quả trở lại tệp đã chọn.

```bash
npm install
npm run dev
```

Mở địa chỉ localhost do Vite in ra. Trên giao diện:

1. Chọn bộ dữ liệu mẫu hoặc **Tải tệp mới**.
2. Chọn ngày mô phỏng và nhấn **Chạy mô phỏng**.
3. Dùng thanh thời gian, nút phát/tạm dừng và tốc độ để xem lại cả ngày.
4. Chọn một chuyến trong hàng chờ để xem vị trí và điện văn liên quan.
5. Nếu đã mở tệp mới bằng quyền ghi, dùng **Ghi vào workbook** khi cần lưu các cột mô phỏng.

Để tạo bản phát hành tĩnh:

```bash
npm run build
```

Thư mục đầu ra là `dist/`.

## Dữ liệu và quy tắc xử lý

Bốn workbook trong `public/samples/` được phục vụ cùng ứng dụng. Bộ `21102026.xlsx` được chọn mặc định; các bộ cũ vẫn có thể chọn trong danh sách nguồn dữ liệu:

| Bộ dữ liệu | Đường dẫn công khai | Số dòng nguồn |
| --- | --- | ---: |
| Cập nhật 21.10.2026, khai thác 01.10.2026 | `/samples/21102026.xlsx` | 100: 70 DEP, 30 ARR |
| Chuyên đề, khai thác 01.10.2026 | `/samples/chuyen-de.xlsx` | 100: 70 DEP, 30 ARR |
| 7 ngày | `/samples/7-days.xls` | 14.150 |
| 3 ngày | `/samples/3-days.xls` | 6.016 |

Trong bộ cập nhật, cả 70 CTOT đã có trong nguồn và cách STD 15 phút. Bộ đọc ghép giờ CTOT dạng `01:20 PM` với `FlyDate`, đồng thời giữ đúng timestamp ISO nếu có. Cột `Compliance = Không tuân thủ` là kịch bản bắt buộc: 25 chuyến được đánh dấu sẽ chờ quá CTOT + 10 phút, quay về vị trí đỗ trống gần nhất, rồi nhận TSAT/CTOT mới. Các trường nguồn được giữ nguyên. Bộ này có 50 chuyến đi nội địa, 20 chuyến đi quốc tế, 22 chuyến đến nội địa và 8 chuyến đến quốc tế; thời gian hạ cánh dùng ATA có sẵn. Có 5 dòng STA sớm hơn ATD được giữ nguyên để đối chiếu với nguồn.

Các workbook mẫu được ứng dụng đọc mà không ghi đè. Khi dùng dữ liệu tải lên, phần mềm giữ các cột nguồn và bổ sung trường mô phỏng khi thiếu, trong đó có `ScheduledDeparture`, `CTOT`, `Stand`, `StandReadyAt`, `TaxiMinutes`, `TaxiRoute`, `RunwayConfig`, `RunwayEntry`, `TakeoffRollStart`, `ActualTakeoff`, `ReissuedCTOT`, `QueueOrder` và `SimulationStatus`. Giá trị được tạo cho demo ổn định theo dữ liệu nguồn; trường có sẵn được ưu tiên giữ lại.

Chỉ các dòng có `AirportDeliveryCode = VVTS` mới được đưa vào mô phỏng khởi hành. Thời gian chờ được tính riêng với thời gian tàu bay đang lăn. Nếu bỏ lỡ cửa sổ CTOT, chuyến bay vẫn tiếp tục được xếp lịch bằng CTOT cấp lại, không đứng chờ vô thời hạn.

Để quan sát xử lý thời tiết, chạy lịch rồi bật **Thời tiết xấu** khi một tàu đang lăn. Tiếp tục phát lại hoặc tua qua CTOT + 10 phút để xem tàu về vị trí đỗ và chuyển trạng thái đỏ. Tắt nút mưa để nhận TSAT/CTOT mới tự động; hàng chờ, bản đồ và bản tin DCL cập nhật đồng bộ. Tàu chưa rời stand tiếp tục chờ tại stand đó. Nếu tua về quá khứ và thay đổi nút thời tiết, các thay đổi thời tiết sau thời điểm vừa chọn được thay bằng kịch bản mới.

**Lưu ý về dữ liệu công khai:** khi triển khai website, hai workbook trong `public/samples/` có thể được truy cập trực tiếp bằng URL ở bảng trên. Không đặt dữ liệu nhạy cảm vào thư mục này.

## Cấu trúc dự án

| Thư mục / tệp | Vai trò |
| --- | --- |
| `src/App.tsx` | Giao diện, điều khiển phát lại và liên kết các phân hệ |
| `src/data/` | Đọc/ghi workbook, chuẩn hóa và bổ sung dữ liệu chuyến bay |
| `src/simulation/` | Lịch khởi hành, hàng chờ, CTOT và thứ tự chuyến |
| `src/map/` | Tọa độ stand, điểm chờ và đường di chuyển trên parking chart |
| `src/dcl/` | Kịch bản và định dạng điện văn DCL |
| `src/styles/` | Giao diện và thiết kế đáp ứng |
| `public/assets/` | Ảnh parking chart |
| `public/samples/` | Hai workbook demo tích hợp |
| `vercel.json` | Cấu hình xuất bản trên Vercel |

Nền tảng sử dụng **React, TypeScript, Vite và SheetJS**. Việc đọc tệp và mô phỏng diễn ra ở phía trình duyệt; dự án không cần máy chủ ứng dụng riêng.

## Triển khai trên Vercel

Địa chỉ production công khai: **https://tsn-flight-management.vercel.app**. Người xem không cần đăng nhập Vercel.

`vercel.json` đã khai báo framework Vite, lệnh dựng `npm run build` và thư mục đầu ra `dist`. Có thể kết nối repository với Vercel hoặc triển khai bằng CLI từ thư mục dự án:

```bash
npx vercel@latest
npx vercel@latest --prod
```

Lệnh đầu tạo bản xem trước; lệnh thứ hai xuất bản bản production. Hai workbook mẫu đi cùng bản dựng. Tính năng ghi trực tiếp vào workbook phụ thuộc quyền truy cập tệp của trình duyệt; thao tác tải lên và mô phỏng vẫn chạy trên website.

## Giới hạn của bản demo

- DCL là điện văn dựng theo kịch bản, không phải trao đổi CPDLC/DCL với ATC.
- Hình học đường lăn là mô phỏng trực quan trên parking chart, không thay thế dữ liệu đường lăn và quy trình điều hành được phê chuẩn.
- Kết quả sắp xếp phục vụ minh họa, không dùng để đưa ra quyết định khai thác thực tế.

## Giấy phép và nguồn dữ liệu

Repository hiện chưa khai báo giấy phép phần mềm. Ảnh parking chart và workbook mẫu được giữ trong dự án để phục vụ phần trình diễn; trước khi tái sử dụng hoặc phát hành dữ liệu ở phạm vi khác, cần kiểm tra quyền sử dụng của từng nguồn.
