import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Flight operations dashboard', () => {
  it('renders the Vietnamese title and the map, queue, and DCL event regions', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /điều phối khởi hành/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /parking chart/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /hàng chờ cất cánh/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /bản tin dcl/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/tuyến lăn theo sơ đồ parking chart/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/điểm chờ trước đường băng/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/sân đỗ tân sơn nhất ground/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/vùng chờ trước cất cánh/i)).not.toBeInTheDocument();
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

    await user.click(screen.getAllByRole('button', { name: /nạp workbook/i })[0]);
    await waitFor(() => expect(screen.getAllByRole('status')[0]).toHaveTextContent(/đã nạp flights\.csv/i));
    fireEvent.click(screen.getAllByRole('button', { name: /chạy mô phỏng/i })[0]);
    await waitFor(() => expect(screen.getAllByRole('status')[0]).toHaveTextContent(/mô phỏng hoàn tất/i));
    expect(screen.getAllByRole('heading', { name: /điều phối khởi hành/i })).toHaveLength(1);
    const dclBoard = screen.getByRole('table', { name: /bảng điện văn dcl/i });
    expect(dclBoard).toHaveTextContent('GIỜ');
    expect(dclBoard).toHaveTextContent('CALLSIGN');
    expect(dclBoard).toHaveTextContent('LOẠI BẢN TIN');
    fireEvent.change(screen.getByRole('slider', { name: /tua thời gian mô phỏng/i }), { target: { value: '1440' } });
    await waitFor(() => expect(dclBoard).toHaveTextContent('RCD'));
  });
});
