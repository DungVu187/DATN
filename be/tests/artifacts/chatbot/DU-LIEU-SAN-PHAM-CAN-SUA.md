# Sản phẩm có dữ liệu làm chatbot trả lời sai

Quét chỉ-đọc DB `Ecom` ngày 23/9/2026: 275 sản phẩm đang hiển thị.
Sửa qua trang admin (Sản phẩm → sửa). Chatbot đọc dữ liệu mới ở lượt chat kế tiếp; danh mục nhóm/hãng tự làm mới sau tối đa 5 phút.

## 1. Tên gợi ý một nhóm nhưng đang xếp vào nhóm khác (4)

Hỏi "PLC Mitsubishi" mà ra cầu dao chính là do lỗi này.

| Mã | Tên | Nhóm đang gán | Hãng | Tên gợi ý nhóm |
|---|---|---|---|---|
| NF250-CV 3P 250A | cầu dao tự động dạng khối | PLC | Mitsubishi | aptomat |
| BH-D6 2P 16A type C N | cầu dao tự động | PLC | Mitsubishi | aptomat |
| BH-D10 3P 40A | MCB 3P 40A | PLC | Mitsubishi | aptomat |
| BH-D10 3P 10A | MCB 3P 10A | PLC | Mitsubishi | aptomat |

## 2. Giá dưới 20.000 đ — cần kiểm tra có nhập thiếu số 0 không (7)

| Mã | Tên | Nhóm | Hãng | Biến thể | Giá |
|---|---|---|---|---|---|
| PST 1T | Cảm biến lực treo PST 1 tấn | Loadcell | Keli | 1 | 4.000 đ |
| SQB 1T R12 | Cảm biến lực thanh SQB 1 tấn ren 12 | Loadcell | Keli | 1 | 13.000 đ |
| ĐT 3/8'' | Đầu bịt đồng 3/8'' | Van điện từ | Khác | 1 | 13.000 đ |
| CVV 2x1R5-0.3B | Dây điện 2x1 mềm | Dây điện | Goldcup | 1 | 10.000 đ |
| SG 4x0.5 | Dây tín hiệu loadcell 4x0.5 | Dây điện | Sangjin | 1 | 17.000 đ |
| LV510307 | MCCB Schneider chỉnh dòng LV510307 (70-100A) 25kA 3P | Aptomat | Schneider | 1 | 2.000 đ |
| STB02 | Đầu nối bằng đồng STB02 | Chưa phân loại | Chưa rõ | 1 | 14.000 đ |

## 3. Thông số là đoạn mẫu chung "24 V DC hoặc 220 V AC tiêu chuẩn; -10°C đến 55°C" (151)

Đoạn này giống hệt nhau ở mọi nhóm (biến tần, dây điện, van...), nên chatbot có thể trích ra như thông số thật. Nên thay bằng thông số đúng của từng món hoặc xóa đi.

| Mã | Tên | Nhóm | Hãng |
|---|---|---|---|
| MA12 | Đồng hồ hiển thị dòng điện MA12 | Đồng Hồ | Selec |
| VAF36 | Đồng hồ hiển thị điện áp dòng điện VAF36 | Đồng Hồ | Selec |
| NF400-CW 3P 400A | Aptomat NF400-CW 3P 400A | Aptomat | Mitsubishi |
| NF250-CW 3P 250A | Aptomat NF250-CW 3P 250A | Aptomat | Mitsubishi |
| NF125-CV 3P 125A | Aptomat NF125-CV 3P 125A | Aptomat | Mitsubishi |
| NF63-CV 3P 63A | Aptomat NF63-CV 3P 63A | Aptomat | Mitsubishi |
| BH-D10 3P 63A | Aptomat BH-D10 3P 63A | Aptomat | Mitsubishi |
| BH-D6 3P 10A | Aptomat BH-D6 3P 10A | Aptomat | Mitsubishi |
| BH-D6 2P 16A | Aptomat BH-D6 2P 16A | Aptomat | Mitsubishi |
| BH-D10 3P 32A | Aptomat BH-D10 3P 32A | Aptomat | Mitsubishi |
| GE1A-B30HA220 | Rơle thời gian GE1A-B30HA220 | Relay Thời Gian | Idec |
| SR2P-06B | Đế rơle thời gian SR2P-06B | Relay Thời Gian | Idec |
| S8FS-C15024 | Bộ nguồn 24VDC 6.5A | Nguồn | Omron |
| GG15-2A | Ruột cầu chì GG15-2A | Thiết bị khác | Giga |
| GIGA18W-32X | Cầu chì GIGA18W-32X | Thiết bị khác | Giga |
| EZ9L33745 | Chống sét lan truyền Schneider | Thiết bị khác | Schneider |
| MFO-40 500/5A | Thiết bị đo dòng điện 500A (TI) | TI | Taiwan |
| MFO-30 250/5A | Thiết bị đo dòng điện 250A (TI) | TI | Taiwan |
| FKL6622.230 | Quạt gió tủ | Thiết bị khác | Khác |
| YW1P-1EQM3R | Đèn báo pha đỏ | Đèn | Idec |
| YW1P-1EQM3Y | Đèn báo pha vàng | Đèn | Idec |
| YW1P-1EQM3G | Đèn báo pha xanh | Đèn | Idec |
| PST 1T | Cảm biến lực treo PST 1 tấn | Loadcell | Keli |
| PST 2T | Cảm biến lực treo PST 2 tấn | Loadcell | Keli |
| PST 3T | Cảm biến lực treo PST 3 tấn | Loadcell | Keli |
| PST 5T | Cảm biến lực treo PST 5 tấn | Loadcell | Keli |
| SQB 1T R12 | Cảm biến lực thanh SQB 1 tấn ren 12 | Loadcell | Keli |
| SQB 2T R12 | Cảm biến lực thanh SQB 2 tấn ren 12 | Loadcell | Keli |
| SQB 3T R12 | Cảm biến lực thanh SQB 3 tấn ren 12 | Loadcell | Keli |
| SQB 5T R12 | Cảm biến lực thanh SQB 5 tấn ren 12 | Loadcell | Keli |
| SQB 1T R16 | Cảm biến lực thanh SQB 1 tấn ren 16 | Loadcell | Keli |
| SQB 2T R16 | Cảm biến lực thanh SQB 2 tấn ren 16 | Loadcell | Keli |
| SQB 3T R16 | Cảm biến lực thanh SQB 3 tấn ren 12 | Loadcell | Keli |
| PST 5T R16 | Cảm biến lực treo PST 5 tấn ren 16 | Loadcell | Keli |
| KM02 | Hộp chỉnh cân KM02 | Loadcell | Keli |
| SC100x250S | Xy lanh khí nén 100x250 Airtac | Xy lanh khí nén | Airtac |
| SC100x200 | Xy lanh khí nén 100x200 Airtac | Xy lanh khí nén | Airtac |
| 4V310-10-A220 | Van khí 4V310-10 220v | Van điện từ | Airtac |
| Y80-Y100 | Khớp quay xy lanh Y80-Y100 | Phụ kiện khí nén | Airtac |
| CA100 | Đế xy lanh 100 | Phụ kiện khí nén | Airtac |
| CA80 | Đế xy lanh 80 | Phụ kiện khí nén | Airtac |
| 300M-3F | Đế bắt van 4V310-10 | Van điện từ | Airtac |
| ĐT 3/8'' | Đầu bịt đồng 3/8'' | Van điện từ | Khác |
| 4V320-10-A220V | Van khí nén 4V320-10-A220V | Van điện từ | Airtac |
| 4V210-08-A220 | Van điện khí 4V210-08-A220 | Van điện từ | Airtac |
| 2L150-15-A2 | Van khí 2L150-15-A2 (van nổ) | Van điện từ | Airtac |
| GAFC400-15-SW | Bộ lọc khí đôi GAFC400-15-SW | Bộ lọc khí | Airtac |
| GAFR400-15 | Bộ lọc khí nén đơn GAFR400-15 | Bộ lọc khí | Airtac |
| STB03 | Giảm thanh đồng STB03 | Phụ kiện khí nén | Khác |
| STB01 | Giảm thanh đồng STB01 | Phụ kiện khí nén | Khác |
| F12mmx8mmx100m | Ống hơi phi 12 | Phụ kiện khí nén | SangA |
| F10mmx6.5mmx100m | Ống hơi phi 10 | Phụ kiện khí nén | SangA |
| GPG1210 | Khớp nối GPG1210 | Phụ kiện khí nén | SangA |
| GPC1204 | Khớp nối GPC1204 | Phụ kiện khí nén | SangA |
| YPC1204 | Khớp nối YPC1204 | Phụ kiện khí nén | STNC |
| GPC1203 | Khớp nối GPC1203 | Phụ kiện khí nén | SangA |
| YPC1203 | Khớp nối YPC1203 | Phụ kiện khí nén | STNC |
| GPL1203 | Khớp nối GPL1203 | Phụ kiện khí nén | SangA |
| YPC1002 | Khớp nối YPC1002 | Phụ kiện khí nén | STNC |
| GPC1202 | Khớp nối GPC1202 | Phụ kiện khí nén | SangA |
| GT16 | Búa rung khí nén GT16 | Phụ kiện khí nén | Parker |
| PHS520S-02-220V | Van điện khí PHS520S-02-220V | Van điện từ | Parker |
| PHS530S-03-220V | Van điện khí PHS530S-03-220V | Van điện từ | Parker |
| PHS530D-03-220V | Van điện khí PHS530D-03-220V | Van điện từ | Parker |
| PHS520D-02-220V | Van điện khí PHS520D-02-220V | Van điện từ | Parker |
| CLD-A54 | Cảm biến xi lanh CL-D-A54 | Phụ kiện khí nén | Parker |
| GDC100x350 | Xy lanh khí nén 100x350 Parker | Xy lanh khí nén | Parker |
| SG2-A2 | Cuộn cảm van điện từ SG2-A2 220V Nass | Phụ kiện khí nén | Nass |
| SC63x250S | Xy lanh khí nén 63x250 Airtac | Xy lanh khí nén | Airtac |
| CA63 | Đế xy lanh CA63 | Phụ kiện khí nén | Airtac |
| Y63 | Đầu kéo xy lanh Y63 | Phụ kiện khí nén | Airtac |
| MFO-30 60/5A | Thiết bị đo dòng điện 60A (TI) | TI | Taiwan |
| PEC5-220V | Cuộn cảm van điện từ PEC5-220V Parker | Phụ kiện khí nén | Parker |
| CEV 3x10R2-0.6B | Dây điện 3x10 | Dây điện | Goldcup |
| CVV 2x1R5-0.3B | Dây điện 2x1 mềm | Dây điện | Goldcup |
| CVV 3x1.5R5-0.3-B | Dây điện 3x1.5 mềm | Dây điện | Goldcup |
| CV 1R5-0.3-B | Dây điện 1x1 mềm | Dây điện | Goldcup |
| CV 1.5R5-0.45-B | Dây điện 1x1.5 mềm | Dây điện | Goldcup |
| CV 16R5-0.45-B | Dây điện 1x16 mềm | Dây điện | Goldcup |
| PGL 20 | Thùng cân inox 20L | Thùng cân PGL | TTSmart |
| DN50 | Van bướm điều khiển khí nén DN50 | Van khí nén | Haitima |
| SG 4x0.5 | Dây tín hiệu loadcell 4x0.5 | Dây điện | Sangjin |
| VTP | Vật tư phụ bổ sung lắp đặt | Vật tư phụ khác | Khác |
| HYBT-15A | Cầu mắt 15A | Cầu Đấu | Hanyoung |
| MF-30 100/5A | Thiết bị đo dòng điện 100A (TI) | TI | Taiwan |
| HYT-603 | Cầu đấu 60A 3 mắt | Cầu Đấu | Hanyoung |
| HYT-604 | Cầu đấu 60A 4 mắt | Cầu Đấu | Hanyoung |
| PR12-4DN | Cảm biến tiệm cận PR12-4DN | Cảm biến | Autonics |
| Van sục khí silo | Van sục khí silo | Van khí nén | Airtac |
| Bép sục khí silo | Bép sục khí silo | Phụ kiện khí nén | Khác |
| Lọc bụi silo TTS | Lọc bụi silo TTS | Lọc bụi | TTSmart |
| Lọc bụi silo Wam | Lọc bụi silo Wam | Lọc bụi | TTSmart |
| Lõi lọc bụi silo | Lõi lọc bụi silo | Lọc bụi | TTSmart |
| PRL18-8DN | Cảm biến tiệm cận PRL18-8DN | Cảm biến | Autonics |
| NF630-CW 3P 630A | Aptomat NF630-CW 3P 630A | Aptomat | Mitsubishi |
| DN300 | Van khí nén DN300 (xả xi) | Van khí nén | Chaofan |
| DN150 | Van bướm điều khiển khí nén DN150 (xả nước) | Van khí nén | Haitima |
| GGK-500VA | Biến áp cách ly 500VA | Biến áp cách ly | Giga |
| DRL-24V120W1EN | Nguồn 24VDC 5A DELTA gắn ray | Nguồn | Delta |
| GG-TBR-10A | Cầu đấu ghép mắt 10A | Cầu Đấu | Giga |
| NF63-CV 3P 32A | Aptomat NF63-CV 3P 32A | Aptomat | Mitsubishi |
| HYT-3010 | Cầu đấu 30A 10 mắt | Cầu Đấu | Hanyoung |
| AD2015E | Đồng hồ cảm biến lực Loadcell AD2015E | Loadcell | Khác |
| FR500A-4T-011G/015PB-H | Biến tần vào 3P 380VAC 11/15kW | Biến tần | Frecon |
| NF32-CV 3P 32A | Aptomat NF32-CV 3P 32A | Aptomat | Mitsubishi |
| GW1P-1EQM3G | Đèn báo pha xanh | Đèn | Giga |
| GW1P-1EQM3R | Đèn báo pha đỏ | Đèn | Giga |
| GW1P-1EQM3Y | Đèn báo pha vàng | Đèn | Giga |
| NF100-SRU 3P 100A | Aptomat NF100-SRU 3P 100A | Aptomat | Mitsubishi |
| HYT3003 | Cầu đấu 300A 3 mắt | Cầu Đấu | Hanyoung |
| HYT-1010 | Cầu đấu 10A 10 mắt | Cầu Đấu | Hanyoung |
| HYT-2010 | Cầu đấu 20A 10 mắt | Cầu Đấu | Hanyoung |
| HYT-204 | Cầu đấu 20A 4 mắt | Cầu Đấu | Hanyoung |
| HYT-303 | Cầu đấu 30A 3 mắt | Cầu Đấu | Hanyoung |
| HYT-304 | Cầu đấu 30A 4 mắt | Cầu Đấu | Hanyoung |
| HYT-1003 | Cầu đấu 100A 3 mắt | Cầu Đấu | Hanyoung |
| HYT-1004 | Cầu đấu 100A 4 mắt | Cầu Đấu | Hanyoung |
| HYT-1503 | Cầu đấu 150A 3 mắt | Cầu Đấu | Hanyoung |
| HYT-1504 | Cầu đấu 150A 4 mắt | Cầu Đấu | Hanyoung |
| HYT-2003 | Cầu đấu 200A 3 mắt | Cầu Đấu | Hanyoung |
| HYT-2004 | Cầu đấu 200A 4 mắt | Cầu Đấu | Hanyoung |
| MFO-40 400/5A | Thiết bị đo dòng điện 400A (TI) | TI | Taiwan |
| NF800-SEW 3P 800A | Aptomat NF800-SEW 3P 800A | Aptomat | Mitsubishi |
| MFO-60 800/5A | Thiết bị đo dòng điện 800A (TI) | TI | Taiwan |
| NFO-40 400/5A | biến dòng vuông | Cuộn hút | Taiwan |
| ATV320D11N4B | Biến tần Schneider ATV320D11N4B 11kW 3 Pha 380V | Biến tần | Schneider |
| ATV320U15N4C | Biến tần Schneider ATV320U15N4C 1.5kW 3 Pha 380-500V | Biến tần | Schneider |
| MFO-30 150/5A | Thiết bị đo dòng (TI) 150A | TI | Taiwan |
| A9F74206 | MCB Schneider A9F74206 6A 6kA 2P | Aptomat | Schneider |
| A9F74210 | MCB Schneider A9F74210 10A 6kA 2P | Aptomat | Schneider |
| A9F74216 | MCB Schneider A9F74216 16A 6kA 2P | Aptomat | Schneider |
| A9F74220 | MCB Schneider A9F74220 20A 6kA 2P | Aptomat | Schneider |
| A9F74225 | MCB Schneider A9F74225 25A 6kA 2P | Aptomat | Schneider |
| A9F74232 | MCB Schneider A9F74232 32A 6kA 2P | Aptomat | Schneider |
| A9F74240 | MCB Schneider A9F74240 40A 6kA 2P | Aptomat | Schneider |
| A9F74250 | MCB Schneider A9F74250 50A 6kA 2P | Aptomat | Schneider |
| A9F74263 | MCB Schneider A9F74263 63A 6kA 2P | Aptomat | Schneider |
| EZ9F34206 | MCB Schneider EZ9F34206 6A 4.5kA 2P | Aptomat | Schneider |
| EZ9F34210 | MCB Schneider EZ9F34210 10A 4.5kA 2P | Aptomat | Schneider |
| EZ9F34216 | MCB Schneider EZ9F34216 16A 4.5kA 2P | Aptomat | Schneider |
| EZ9F34220 | MCB Schneider EZ9F34220 20A 4.5kA 2P | Aptomat | Schneider |
| EZ9F34225 | MCB Schneider EZ9F34225 25A 4.5kA 2P | Aptomat | Schneider |
| EZ9F34232 | MCB Schneider EZ9F34232 32A 4.5kA 2P | Aptomat | Schneider |
| EZ9F34240 | MCB Schneider EZ9F34240 40A 4.5kA 2P | Aptomat | Schneider |
| EZ9F34250 | MCB Schneider EZ9F34250 50A 4.5kA 2P | Aptomat | Schneider |
| EZ9F34263 | MCB Schneider EZ9F34263 63A 4.5kA 2P | Aptomat | Schneider |
| LV516302 | MCCB Schneider chỉnh dòng LV516302 (88-125A) 25kA 3P | Aptomat | Schneider |
| LV510307 | MCCB Schneider chỉnh dòng LV510307 (70-100A) 25kA 3P | Aptomat | Schneider |
| HYT-2020 | Cầu đấu 20A 20 mắt | Cầu Đấu | Hanyoung |
| AC10-T3-2R2G-B | Biến tần AC10-T3-2R2G-B VEICHI | Biến tần | VEICHI |
| GAFR400-15-SW | Bộ lọc khí GAFR400-15-SW | Bộ lọc khí | Giga |
