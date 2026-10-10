# Đặc tả thiết kế demo sắp xếp chuyến bay

## Mục tiêu

Xây dựng một ứng dụng web chạy cục bộ để mô phỏng các chuyến bay khởi hành từ vị trí đỗ tại Tân Sơn Nhất, di chuyển theo tuyến lăn cấu hình sẵn, xếp hàng tại điểm chờ, tuân thủ CTOT và phát lại quy trình trao đổi bản tin DCL. Ứng dụng so sánh lịch gốc với lịch được tối ưu và trình bày mức giảm tổng thời gian chờ.

Đây là phần mềm demo phục vụ trình bày. Các trường khai thác không có trong dữ liệu mẫu sẽ được đánh dấu là mô phỏng.

## Quyết định đã thống nhất

- Ứng dụng là web chạy cục bộ trên máy, giao diện tiếng Việt kèm thuật ngữ hàng không như stand, taxiway, holding point, CTOT và DCL.
- PARKING CHART của TSN là nền bản đồ. Các stand, nút và đoạn taxiway, điểm chờ, lối vào đường băng và tuyến lăn được cấu hình sẵn trên nền này.
- Tuyến đen phía dưới PARKING CHART mà người dùng đã chỉ định là tuyến lăn khởi hành cần được đưa vào lớp tuyến mô phỏng, nối từ các stand/nhánh taxiway liên quan đến holding point và đường băng.
- Người dùng chọn một cấu hình đường băng trước khi chạy. Có cấu hình mặc định và có thể chọn cấu hình khác.
- Chỉ mô phỏng chuyến khởi hành trong phiên bản đầu tiên.
- Tuyến lăn và cách gán stand được mô phỏng theo loại tàu bay và các ràng buộc cấu hình. Không yêu cầu người dùng vẽ tuyến.
- Hai workbook mẫu là hai lựa chọn riêng, không gộp dữ liệu:
  - File 7 ngày có 14.150 dòng, nhiều trường chuyến bay và giờ khai thác.
  - File 3 ngày có 6.016 dòng, chỉ có sáu trường cơ bản và không có giờ chuyến bay.
- Dùng các trường thật có sẵn; bổ sung các trường mô phỏng còn thiếu trực tiếp vào chính file dữ liệu đang dùng. Không tạo workbook dữ liệu phụ. Nếu trường mô phỏng đã có thì giữ và sử dụng giá trị hiện tại.
- Giá trị mô phỏng được tạo nhất quán để nạp lại cùng dữ liệu cho kết quả có thể so sánh. Nhãn dữ liệu phân biệt giá trị nguồn và giá trị mô phỏng.
- CTOT là trường riêng, không đồng nhất với DeliveryTime. Nếu CTOT thiếu, ứng dụng tạo CTOT mô phỏng dựa trên lịch chuyến, mật độ giao thông và năng lực đường băng; quy tắc tạo cần có thể giải thích và lặp lại.
- Cửa sổ CTOT được chấp nhận là từ CTOT − 5 phút đến CTOT + 10 phút. Cất cánh ngoài cửa sổ được tính là lỡ slot. Chuyến lỡ slot vẫn lăn ra holding point, chuyển xuống cuối hàng và được cấp CTOT mới khả dụng.
- DCL tự chạy theo kịch bản, có cả luồng bình thường và các trường hợp từ chối/timeout. Nội dung và trạng thái dựa trên mẫu trong báo cáo đồ án; không kết nối CPDLC thật.
- Thuật toán ưu tiên chạy nhanh trên nhiều chuyến. Ứng dụng chạy lịch gốc theo thứ tự CTOT và lịch đề xuất trên cùng bộ dữ liệu, cùng các ràng buộc; hiển thị tổng thời gian chờ, số phút và phần trăm cải thiện, số lần lỡ/cấp lại CTOT và thứ tự cất cánh. Thuật toán là heuristic, không cam kết tối ưu toàn cục.
- Phát lại đủ 24 giờ; có điều khiển tốc độ, tạm dừng và tua đến thời điểm/sự kiện.
- Dùng UI UX Pro Max để hoàn thiện hệ thiết kế, chi tiết tương tác và kiểm tra trải nghiệm giao diện.

## Dữ liệu và bổ sung trường

### Trường lấy từ nguồn

File 7 ngày có các trường gồm ngày bay, callsign, loại tàu bay, mã sân bay, giờ khai thác và route hành trình bay. Route hành trình bay là đường bay dự kiến giữa các sân bay, không phải tuyến taxiway trên mặt đất. Hệ thống lọc chuyến rời TSN theo mã sân bay trong workbook; cần xác minh ánh xạ trường đi/đến trước khi triển khai bộ lọc.

File 3 ngày có ngày bay, callsign, loại tàu bay, route và hai mã sân bay. Do thiếu giờ, ứng dụng tạo giờ sẵn sàng/giờ khởi hành mô phỏng cho các dòng được chọn.

### Trường mô phỏng

Tối thiểu cần bổ sung các trường sau nếu nguồn không có:

- Giờ khởi hành theo lịch hoặc giờ sẵn sàng tại stand.
- CTOT ban đầu.
- Stand và nhóm tương thích tàu bay.
- Cấu hình đường băng và tuyến taxiway/điểm chờ.
- Thời lượng lăn và các thời điểm/sự kiện phục vụ phát lại.
- Trạng thái bản tin DCL và lịch sử CTOT được cấp lại.

Các trường bổ sung phải được lưu ngay trong workbook/CSV đang dùng. Cần giữ nguyên giá trị nguồn và ghi nhận rõ trường nào được sinh cho mô phỏng. Khi workbook được lưu, lần nạp sau dùng lại các giá trị mô phỏng đã có thay vì sinh lại.

## Mô hình mô phỏng và xếp lịch

Mô phỏng chạy theo sự kiện. Máy bay chiếm stand, di chuyển qua các đoạn taxiway, chờ khi đoạn/điểm đang bận, vào hàng tại holding point và rời mô hình khi cất cánh. Mạng tuyến có thời gian di chuyển và trạng thái chiếm dụng riêng; các tham số năng lực đường băng, khoảng cách cất cánh và cấu hình khai thác được quản lý theo cấu hình.

Tổng thời gian chờ là tổng thời lượng mỗi chuyến phải dừng chờ do chưa sẵn sàng, xung đột đường lăn hoặc xếp hàng tại holding point. Thời gian máy bay đang di chuyển không tính là thời gian chờ.

Lịch gốc ưu tiên CTOT và xử lý xung đột theo hàng chờ. Lịch đề xuất dùng heuristic nhanh để thử sắp xếp lại các chuyến khả dụng, tránh xung đột và giảm tổng thời gian chờ. Cả hai lượt chạy dùng cùng chuyến bay, CTOT mô phỏng, stand, tuyến, cấu hình đường băng và luật vận hành để so sánh công bằng.

Khi thời điểm cất cánh dự kiến nằm ngoài cửa sổ CTOT, máy bay được đánh dấu lỡ slot, chuyển xuống cuối hàng tại holding point và nhận CTOT sớm nhất còn khả dụng theo năng lực/cấu hình đã chọn. Hệ thống ghi lại lý do và mọi lần cấp lại.

## Giao diện

- PARKING CHART chiếm vùng chính, có thể phóng to/thu nhỏ và thể hiện stand, taxiway, holding point, máy bay và đoạn tuyến đang sử dụng.
- Thanh điều khiển chứa chọn workbook, ngày, cấu hình đường băng, chạy/tạm dừng, tốc độ và tua thời gian.
- Bảng hàng chờ hiển thị callsign, loại tàu bay, stand, giờ sẵn sàng, CTOT, trạng thái và thứ tự dự kiến.
- Dòng sự kiện DCL hiển thị thời điểm, bên gửi/nhận, mã chuyến, nội dung và trạng thái bản tin; có thể chọn chuyến/bản tin để làm nổi tuyến liên quan.
- Bảng kết quả so sánh lịch gốc và lịch đề xuất, gồm tổng thời gian chờ, mức cải thiện, số lần lỡ CTOT/cấp lại và thứ tự cất cánh.
- Trạng thái có nhãn chữ bên cạnh màu; chuyển động có thể giảm/tắt để hỗ trợ trình chiếu và người dùng nhạy với chuyển động.

## Bản tin DCL

Ứng dụng dùng mẫu điện văn trong báo cáo đồ án để phát các sự kiện tự động theo thời gian mô phỏng. Kịch bản bình thường thể hiện yêu cầu khởi tạo DCL, phản hồi hệ thống, huấn lệnh uplink, xác nhận từ tổ lái và trạng thái hoàn tất. Kịch bản ngoại lệ thể hiện từ chối hoặc timeout, trạng thái xử lý và đường chuyển tiếp tương ứng. Tất cả bản tin liên kết với chuyến bay và dòng thời gian để người xem theo dõi đồng bộ với bản đồ.

## Ngoài phạm vi phiên bản đầu

- Chuyến đến, điều hành tiếp cận hoặc cất/hạ cánh ngoài phạm vi sơ đồ đã cấu hình.
- Kết nối hệ thống ATC, CPDLC/ACARS hoặc nguồn dữ liệu khai thác trực tiếp.
- Cam kết rằng lịch đề xuất là nghiệm tối ưu toán học toàn cục.
- Chỉnh sửa tuyến taxiway trực tiếp trên bản đồ.

## Điểm cần xác minh khi lập kế hoạch triển khai

- Ánh xạ chính xác trường sân bay đi/đến trong hai workbook để lọc chuyến rời TSN.
- Bộ trường mô phỏng cần thiết cho từng workbook và cách ghi trực tiếp mà vẫn giữ định dạng XLS/CSV hiện có.
- Quy tắc tương thích stand, loại tàu bay, taxiway, cấu hình đường băng và năng lực/cự ly cất cánh cho phạm vi demo.
- Nội dung, chuỗi trạng thái và điều kiện timeout/từ chối cần lấy từ các mẫu DCL trong báo cáo.
- Cách tạo CTOT mô phỏng nhất quán dựa trên giờ lịch, mật độ chuyến và năng lực đường băng.
- Quy mô thực tế của tập chuyến khởi hành sau khi lọc trong từng bộ dữ liệu và tốc độ phát lại mặc định phù hợp.
