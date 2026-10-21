import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Flight operations dashboard', () => {
  it('renders the Vietnamese title and the map, queue, and DCL event regions', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /ứng dụng cpdlc- dcl trong quản lý luồng không lưu/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /parking chart/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /hàng chờ cất cánh/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /bản tin dcl/i })).toBeInTheDocument();
    expect(screen.getByAltText(/sơ đồ đường băng, đường lăn và vị trí đỗ/i)).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'TSAT' })).toBeInTheDocument();
  });

  it('keeps the page rendered after loading a flight CSV and running the simulation', async () => {
    const csvText = 'AirportDeliveryCode,AirportReceiptCode,CallSign,PlaneTypeCode,FlyDate,DeliveryTime\nVVTS,VVDN,VNA123,A320,03/11/23,05:00';
    const file = new File([csvText], 'flights.csv', { type: 'text/csv' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(csvText).buffer });
    const handle = { getFile: vi.fn().mockResolvedValue(file) };
    vi.stubGlobal('showOpenFilePicker', vi.fn().mockResolvedValue([handle]));
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: vi.fn().mockResolvedValue([handle]) });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /tải tệp mới/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /chạy mô phỏng/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /chạy mô phỏng/i }));
    await waitFor(() => expect(screen.getAllByText('VNA123').length).toBeGreaterThan(0));
    expect(screen.getByRole('heading', { name: /ứng dụng cpdlc- dcl trong quản lý luồng không lưu/i })).toBeInTheDocument();
    const dclBoard = screen.getByRole('table', { name: /bảng điện văn dcl/i });
    expect(dclBoard).toHaveTextContent('GIỜ');
    expect(screen.getByRole('columnheader', { name: 'TSAT' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: /tua thời gian mô phỏng/i }), { target: { value: '1440' } });
    await waitFor(() => expect(dclBoard).toHaveTextContent('CLD'));
    expect(dclBoard).toHaveTextContent('TSAT');
    expect(screen.getAllByText('VNA123').length).toBeGreaterThan(0);
    const pause = screen.queryByRole('button', { name: /tạm dừng mô phỏng/i });
    if (pause) fireEvent.click(pause);
    const slider = screen.getByRole('slider', { name: /tua thời gian mô phỏng/i });
    fireEvent.change(slider, { target: { value: '0' } });
    const rain = screen.getByRole('switch', { name: 'Thời tiết xấu' });
    fireEvent.click(rain);
    expect(rain).toHaveAttribute('aria-checked', 'true');
    fireEvent.change(slider, { target: { value: '600' } });
    expect(screen.getByRole('region', { name: 'Hàng chờ cất cánh' })).toHaveTextContent('Không tuân thủ CTOT · chờ cấp lại');
    fireEvent.click(rain);
    expect(rain).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('region', { name: 'Hàng chờ cất cánh' })).toHaveTextContent('Đã cấp TSAT/CTOT mới');
    expect(dclBoard).toHaveTextContent('TSAT REVISED');
    const revised = document.querySelector('.time-cell')?.getAttribute('title')?.match(/CTOT mới (\d{2}):(\d{2})/);
    expect(revised).not.toBeNull();
    const takeoffMinute = Number(revised![1]) * 60 + Number(revised![2]);
    fireEvent.change(slider, { target: { value: String(takeoffMinute) } });
    expect(screen.getByRole('button', { name: /VNA123.*cất cánh 25L/i })).toBeInTheDocument();
  });
});
